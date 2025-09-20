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

    // Process batches in parallel for better performance
    const batchPromises = [];

    for (let i = 0; i < videoIds.length; i += batchSize) {
      const batch = videoIds.slice(i, i + batchSize);
      const batchIndex = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(videoIds.length / batchSize);

      const batchPromise = (async () => {
        const videoIdsString = batch.join(',');
        const url = `https://www.googleapis.com/youtube/v3/videos?id=${videoIdsString}&part=snippet&fields=items(id,snippet(thumbnails))&key=${apiKey}`;

        try {
          console.log(`Processing batch ${batchIndex}/${totalBatches}`);
          const response = await fetch(url);

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`YouTube API error for batch ${batchIndex}:`, response.status, errorText);
            return {};
          }

          const data = await response.json();
          const batchThumbnails: Record<string, string> = {};

          if (data.items) {
            data.items.forEach((item: any) => {
              const snippet = item.snippet;
              if (snippet && snippet.thumbnails) {
                const thumbs = snippet.thumbnails;
                // Priority: high > medium > default (skip maxres as it's often unavailable)
                batchThumbnails[item.id] =
                  thumbs.high?.url ||
                  thumbs.medium?.url ||
                  thumbs.default?.url ||
                  '';
              }
            });
          }

          return batchThumbnails;
        } catch (batchError) {
          console.error(`Error fetching batch ${batchIndex}:`, batchError);
          return {};
        }
      })();

      batchPromises.push(batchPromise);
    }

    // Wait for all batches to complete
    const batchResults = await Promise.all(batchPromises);

    // Merge all results
    for (const batchResult of batchResults) {
      Object.assign(thumbnails, batchResult);
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