import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@clickhouse/client';
import { detectTitleLanguage, detectLanguagesBatch } from '@/utils/language-detector';

export async function POST(request: NextRequest) {
  try {
    const { host, username, password, database, action } = await request.json();

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
      await client.command({
        query: `ALTER TABLE ${database || 'default'}.videos UPDATE language_detected = NULL WHERE 1 = 1`,
        clickhouse_settings: {
          wait_end_of_query: 1
        }
      });

      return NextResponse.json({
        success: true,
        message: 'Language data cleared successfully'
      });
    }

    if (action === 'detect') {
      const countResult = await client.query({
        query: `SELECT count() as total FROM ${database || 'default'}.videos WHERE language_detected IS NULL OR language_detected = ''`
      });
      const countData = await countResult.json() as any;
      const totalVideos = countData.data[0]?.total || 0;

      if (totalVideos === 0) {
        return NextResponse.json({
          success: true,
          message: 'No videos need language detection',
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
            const batchSize = 100;
            let processed = 0;

            sendProgress(0, totalVideos, 'Starting language detection...');

            while (processed < totalVideos) {
              const result = await client.query({
                query: `
                  SELECT id, title
                  FROM ${database || 'default'}.videos
                  WHERE language_detected IS NULL OR language_detected = ''
                  LIMIT ${batchSize}
                `
              });

              const data = await result.json() as any;
              const videos = data.data;

              if (videos.length === 0) break;

              sendProgress(processed, totalVideos, `Processing batch ${Math.floor(processed / batchSize) + 1}...`);

              const titles = videos.map((v: any) => v.title);
              const detectionResults = await detectLanguagesBatch(titles);

              for (let i = 0; i < videos.length; i++) {
                const video = videos[i];
                const detection = detectionResults[i];

                await client.command({
                  query: `
                    ALTER TABLE ${database || 'default'}.videos
                    UPDATE language_detected = '${detection.language}'
                    WHERE id = '${video.id}'
                  `,
                  clickhouse_settings: {
                    wait_end_of_query: 1
                  }
                });

                processed++;

                if (processed % 10 === 0 || processed === totalVideos) {
                  sendProgress(processed, totalVideos, `Processed ${processed} of ${totalVideos} videos...`);
                }
              }
            }

            sendProgress(totalVideos, totalVideos, 'Language detection completed!');
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
      { error: 'Invalid action. Use "clear" or "detect"' },
      { status: 400 }
    );

  } catch (error: any) {
    console.error('Language detection error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process language detection' },
      { status: 500 }
    );
  }
}