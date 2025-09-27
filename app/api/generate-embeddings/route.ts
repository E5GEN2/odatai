import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@clickhouse/client';
import { getGoogleEmbeddings } from '@/utils/google-embeddings';
import { processYouTubeTitlesWithProgress } from '@/utils/sentence-transformers';

export async function POST(request: NextRequest) {
  try {
    const { host, username, password, database, action, embeddingConfig, apiKeys } = await request.json();

    if (!host || !username || !password) {
      return NextResponse.json(
        { error: 'Missing database credentials' },
        { status: 400 }
      );
    }

    const client = createClient({
      url: host,
      username,
      password,
      database: database || 'default'
    });

    if (action === 'clear') {
      // Clear embeddings based on embedding type
      const clearQuery = embeddingConfig.embeddingType === 'google'
        ? `ALTER TABLE ${database || 'default'}.videos UPDATE embedding_3072d = NULL, embedding_model = NULL, embedding_dimensions = NULL, embedding_generated_at = NULL WHERE embedding_dimensions = 3072`
        : embeddingConfig.embeddingType === 'huggingface'
        ? `ALTER TABLE ${database || 'default'}.videos UPDATE embedding_768d = NULL, embedding_1536d = NULL, embedding_model = NULL, embedding_dimensions = NULL, embedding_generated_at = NULL WHERE embedding_dimensions IN (768, 1536)`
        : `ALTER TABLE ${database || 'default'}.videos UPDATE embedding_768d = NULL, embedding_1536d = NULL, embedding_3072d = NULL, embedding_model = NULL, embedding_dimensions = NULL, embedding_generated_at = NULL WHERE 1 = 1`;

      await client.command({
        query: clearQuery,
        clickhouse_settings: {
          wait_end_of_query: 1
        }
      });

      return NextResponse.json({
        success: true,
        message: 'Embedding data cleared successfully'
      });
    }

    if (action === 'generate') {
      // Count videos without embeddings of the requested type
      const embeddingColumn = embeddingConfig.embeddingType === 'google' ? 'embedding_3072d' :
                             embeddingConfig.dimensions === 768 ? 'embedding_768d' : 'embedding_1536d';

      const countResult = await client.query({
        query: `SELECT count() as total FROM ${database || 'default'}.videos WHERE ${embeddingColumn} IS NULL OR ${embeddingColumn} = []`
      });
      const countData = await countResult.json() as any;
      const totalVideos = countData.data[0]?.total || 0;

      if (totalVideos === 0) {
        return NextResponse.json({
          success: true,
          message: 'No videos need embeddings',
          processed: 0,
          total: 0
        });
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const sendProgress = (processed: number, total: number, message: string) => {
            const data = JSON.stringify({ processed, total, message, percentage: Math.round((processed / total) * 100) });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          };

          try {
            const batchSize = embeddingConfig.embeddingType === 'google' ? 25 : 50;
            let processed = 0;

            sendProgress(0, totalVideos, 'Starting embedding generation...');

            while (processed < totalVideos) {
              const result = await client.query({
                query: `
                  SELECT id, title
                  FROM ${database || 'default'}.videos
                  WHERE ${embeddingColumn} IS NULL OR ${embeddingColumn} = []
                  LIMIT ${batchSize}
                `
              });

              const data = await result.json() as any;
              const videos = data.data;

              if (videos.length === 0) break;

              sendProgress(processed, totalVideos, `Processing batch ${Math.floor(processed / batchSize) + 1}...`);

              const titles = videos.map((v: any) => v.title);
              let embeddings: number[][];

              // Generate embeddings based on config
              if (embeddingConfig.embeddingType === 'google') {
                if (!apiKeys.googleApiKey) {
                  throw new Error('Google API key required for Google embeddings');
                }
                embeddings = await getGoogleEmbeddings(titles, {
                  apiKey: apiKeys.googleApiKey,
                  dimensions: 3072,
                  taskType: 'CLUSTERING'
                });
              } else {
                if (!apiKeys.huggingFaceApiKey) {
                  throw new Error('Hugging Face API key required for HuggingFace embeddings');
                }
                const results = await processYouTubeTitlesWithProgress(titles, {
                  config: {
                    model: embeddingConfig.model || 'BAAI/bge-base-en-v1.5',
                    apiKey: apiKeys.huggingFaceApiKey,
                    dimensions: embeddingConfig.dimensions || 768
                  }
                });
                embeddings = results.embeddings;
              }

              // Save embeddings to database
              for (let i = 0; i < videos.length; i++) {
                const video = videos[i];
                const embedding = embeddings[i];

                if (embedding && embedding.length > 0) {
                  const embeddingStr = JSON.stringify(embedding);
                  const modelName = embeddingConfig.embeddingType === 'google' ? 'gemini-embedding-001' : embeddingConfig.model;
                  const dimensions = embedding.length;

                  await client.command({
                    query: `
                      ALTER TABLE ${database || 'default'}.videos
                      UPDATE
                        ${embeddingColumn} = [${embedding.join(',')}],
                        embedding_model = '${modelName}',
                        embedding_dimensions = ${dimensions},
                        embedding_generated_at = now()
                      WHERE id = '${video.id}'
                    `,
                    clickhouse_settings: {
                      wait_end_of_query: 1
                    }
                  });
                }

                processed++;

                if (processed % 10 === 0 || processed === totalVideos) {
                  sendProgress(processed, totalVideos, `Generated embeddings for ${processed} of ${totalVideos} videos...`);
                }
              }
            }

            sendProgress(totalVideos, totalVideos, 'Embedding generation completed!');
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, processed, total: totalVideos })}\n\n`));
            controller.close();
          } catch (error: any) {
            const errorData = JSON.stringify({ error: error.message });
            controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
            controller.close();
          }
        }
      });

      return new NextResponse(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    return NextResponse.json(
      { error: 'Invalid action. Use "clear" or "generate"' },
      { status: 400 }
    );

  } catch (error: any) {
    console.error('Embedding generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process embedding generation' },
      { status: 500 }
    );
  }
}