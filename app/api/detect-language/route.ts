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
        query: `ALTER TABLE youtube_videos UPDATE language_detected = NULL WHERE 1 = 1`,
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
        query: `SELECT count() as total FROM youtube_videos WHERE language_detected IS NULL OR language_detected = ''`
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

      const batchSize = 100;
      let processed = 0;

      while (processed < totalVideos) {
        const result = await client.query({
          query: `
            SELECT video_id, title
            FROM youtube_videos
            WHERE language_detected IS NULL OR language_detected = ''
            LIMIT ${batchSize}
          `
        });

        const data = await result.json() as any;
        const videos = data.data;

        if (videos.length === 0) break;

        const titles = videos.map((v: any) => v.title);
        const detectionResults = detectLanguagesBatch(titles);

        for (let i = 0; i < videos.length; i++) {
          const video = videos[i];
          const detection = detectionResults[i];

          await client.command({
            query: `
              ALTER TABLE youtube_videos
              UPDATE language_detected = '${detection.language}'
              WHERE video_id = '${video.video_id}'
            `,
            clickhouse_settings: {
              wait_end_of_query: 1
            }
          });
        }

        processed += videos.length;
      }

      return NextResponse.json({
        success: true,
        message: 'Language detection completed',
        processed,
        total: totalVideos
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