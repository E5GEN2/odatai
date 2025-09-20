import { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { videoIds, apiKey } = await request.json();

    if (!videoIds || !Array.isArray(videoIds) || videoIds.length === 0) {
      return Response.json({ error: 'Video IDs array is required' }, { status: 400 });
    }

    if (!apiKey) {
      return Response.json({ error: 'YouTube API key is required' }, { status: 400 });
    }

    // YouTube Data API allows up to 50 video IDs per request
    const batchSize = 50;
    const thumbnails: Record<string, string> = {};

    for (let i = 0; i < videoIds.length; i += batchSize) {
      const batch = videoIds.slice(i, i + batchSize);
      const videoIdsString = batch.join(',');

      const url = `https://www.googleapis.com/youtube/v3/videos?id=${videoIdsString}&part=snippet&fields=items(id,snippet(thumbnails))&key=${apiKey}`;

      try {
        const response = await fetch(url);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('YouTube API error:', response.status, errorText);
          continue; // Skip this batch and continue with others
        }

        const data = await response.json();

        if (data.items) {
          data.items.forEach((item: any) => {
            // Prefer higher quality thumbnails
            const snippet = item.snippet;
            if (snippet && snippet.thumbnails) {
              const thumbs = snippet.thumbnails;
              // Priority: maxres > high > medium > default
              thumbnails[item.id] =
                thumbs.maxresdefault?.url ||
                thumbs.high?.url ||
                thumbs.medium?.url ||
                thumbs.default?.url ||
                '';
            }
          });
        }
      } catch (batchError) {
        console.error('Error fetching batch:', batchError);
        continue;
      }
    }

    return Response.json({ thumbnails });

  } catch (error: any) {
    console.error('YouTube thumbnails API error:', error);
    return Response.json(
      { error: 'Failed to fetch thumbnails', details: error.message },
      { status: 500 }
    );
  }
}