import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@clickhouse/client';
import { getGoogleEmbeddings } from '@/utils/google-embeddings';
import { processYouTubeTitlesWithProgress } from '@/utils/sentence-transformers';

export async function POST(request: NextRequest) {
  try {
    const { host, username, password, database, action, embeddingConfig, apiKeys } = await request.json();

    console.log('[EMBEDDINGS API] Request received:', {
      action,
      embeddingType: embeddingConfig?.embeddingType,
      dimensions: embeddingConfig?.dimensions,
      batchSize: embeddingConfig?.batchSize
    });

    if (!host || !username || !password) {
      console.error('[EMBEDDINGS API] Missing credentials');
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
      console.log('[EMBEDDINGS API] Clearing embeddings:', embeddingConfig);

      // Clear embeddings for specific dimension column
      const embeddingColumn = `embedding_${embeddingConfig.dimensions}d`;
      const clearQuery = `ALTER TABLE ${database || 'default'}.videos UPDATE ${embeddingColumn} = [] WHERE 1 = 1`;

      console.log('[EMBEDDINGS API] Clear query:', clearQuery);

      await client.command({
        query: clearQuery,
        clickhouse_settings: {
          wait_end_of_query: 1
        }
      });

      console.log('[EMBEDDINGS API] Clear completed');
      return NextResponse.json({
        success: true,
        message: 'Embedding data cleared successfully'
      });
    }

    if (action === 'generate') {
      // Use dedicated column for this embedding dimension
      const embeddingColumn = `embedding_${embeddingConfig.dimensions}d`;

      console.log('[EMBEDDINGS API] Target column:', embeddingColumn);
      console.log('[EMBEDDINGS API] Target dimensions:', embeddingConfig.dimensions);

      // Count videos without embeddings for this dimension
      const countQuery = `SELECT count() as total FROM ${database || 'default'}.videos WHERE ${embeddingColumn} IS NULL OR length(${embeddingColumn}) = 0`;
      console.log('[EMBEDDINGS API] Count query:', countQuery);

      const countResult = await client.query({ query: countQuery });
      const countData = await countResult.json() as any;
      const totalVideos = countData.data[0]?.total || 0;

      console.log('[EMBEDDINGS API] Videos needing embeddings:', totalVideos);

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
            console.log(`[EMBEDDINGS PROGRESS] ${processed}/${total} - ${message}`);
            const data = JSON.stringify({ processed, total, message, percentage: Math.round((processed / total) * 100) });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          };

          try {
            const batchSize = embeddingConfig.batchSize || 25;
            const batchDelay = embeddingConfig.batchDelay || 1000;
            let processed = 0;
            let batchNumber = 0;
            const totalBatches = Math.ceil(totalVideos / batchSize);

            console.log(`[EMBEDDINGS API] Starting generation: ${totalVideos} videos, ${totalBatches} batches, ${batchSize} per batch`);
            sendProgress(0, totalVideos, `Starting embedding generation... (${totalVideos} videos, ${totalBatches} batches)`);

            while (processed < totalVideos) {
              batchNumber++;
              const selectQuery = `
                SELECT id, title
                FROM ${database || 'default'}.videos
                WHERE ${embeddingColumn} IS NULL OR length(${embeddingColumn}) = 0
                LIMIT ${batchSize}
              `;
              console.log(`[EMBEDDINGS API] Batch ${batchNumber} query:`, selectQuery);

              const result = await client.query({ query: selectQuery });

              const data = await result.json() as any;
              const videos = data.data;

              if (videos.length === 0) break;

              sendProgress(processed, totalVideos, `Batch ${batchNumber}/${totalBatches}: Fetching embeddings for ${videos.length} videos...`);

              const titles = videos.map((v: any) => v.title);
              let embeddings: number[][];

              // Generate embeddings based on config
              if (embeddingConfig.embeddingType === 'google') {
                if (!apiKeys.googleApiKey) {
                  throw new Error('Google API key required for Google embeddings');
                }
                sendProgress(processed, totalVideos, `Batch ${batchNumber}/${totalBatches}: Calling Google API (${embeddingConfig.dimensions}D)...`);
                embeddings = await getGoogleEmbeddings(titles, {
                  apiKey: apiKeys.googleApiKey,
                  dimensions: embeddingConfig.dimensions || 3072,
                  taskType: 'CLUSTERING'
                });
              } else {
                if (!apiKeys.huggingFaceApiKey) {
                  throw new Error('Hugging Face API key required for HuggingFace embeddings');
                }
                sendProgress(processed, totalVideos, `Batch ${batchNumber}/${totalBatches}: Calling HuggingFace API (${embeddingConfig.model})...`);
                const results = await processYouTubeTitlesWithProgress(titles, {
                  config: {
                    model: embeddingConfig.model || 'BAAI/bge-base-en-v1.5',
                    apiKey: apiKeys.huggingFaceApiKey,
                    dimensions: embeddingConfig.dimensions || 768
                  }
                });
                embeddings = results.embeddings;
              }

              sendProgress(processed, totalVideos, `Batch ${batchNumber}/${totalBatches}: Saving ${embeddings.length} embeddings to database...`);

              // Save embeddings to database with mutations_sync for immediate completion
              for (let i = 0; i < videos.length; i++) {
                const video = videos[i];
                const embedding = embeddings[i];

                if (embedding && embedding.length > 0) {
                  const modelName = embeddingConfig.embeddingType === 'google'
                    ? (embeddingConfig.dimensions === 3072 ? 'gemini-embedding-001' : 'text-embedding-004')
                    : embeddingConfig.model;
                  const dimensions = embedding.length;

                  const updateQuery = `
                    ALTER TABLE ${database || 'default'}.videos
                    UPDATE
                      ${embeddingColumn} = [${embedding.join(',')}]
                    WHERE id = '${video.id}'
                  `;

                  await client.command({
                    query: updateQuery,
                    clickhouse_settings: {
                      mutations_sync: 2
                    }
                  });
                }

                processed++;

                if (processed % 10 === 0 || processed === totalVideos) {
                  sendProgress(processed, totalVideos, `Batch ${batchNumber}/${totalBatches}: Saved ${processed}/${totalVideos} videos`);
                }
              }

              // Add delay between batches if not the last batch
              if (processed < totalVideos && batchDelay > 0) {
                sendProgress(processed, totalVideos, `Batch ${batchNumber}/${totalBatches} complete. Waiting ${batchDelay}ms before next batch...`);
                await new Promise(resolve => setTimeout(resolve, batchDelay));
              }
            }

            console.log(`[EMBEDDINGS API] Generation complete! ${totalBatches} batches, ${totalVideos} embeddings`);
            sendProgress(totalVideos, totalVideos, `Embedding generation completed! Processed ${totalBatches} batches, generated ${totalVideos} embeddings.`);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, processed, total: totalVideos })}\n\n`));
            controller.close();
          } catch (error: any) {
            console.error('[EMBEDDINGS API] Stream error:', error);
            console.error('[EMBEDDINGS API] Error stack:', error.stack);
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

    console.error('[EMBEDDINGS API] Invalid action:', action);
    return NextResponse.json(
      { error: 'Invalid action. Use "clear" or "generate"' },
      { status: 400 }
    );

  } catch (error: any) {
    console.error('[EMBEDDINGS API] Top-level error:', error);
    console.error('[EMBEDDINGS API] Error details:', {
      message: error.message,
      stack: error.stack,
      cause: error.cause
    });
    return NextResponse.json(
      { error: error.message || 'Failed to process embedding generation' },
      { status: 500 }
    );
  }
}