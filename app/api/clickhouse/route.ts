import { NextRequest } from 'next/server';

interface ClickHouseConfig {
  host: string;
  username: string;
  password: string;
  database: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, config, data } = body;

    if (!config || !config.host || !config.username || !config.password) {
      return Response.json({
        success: false,
        error: 'Missing required ClickHouse configuration'
      }, { status: 400 });
    }

    const { host, username, password, database } = config as ClickHouseConfig;

    // Create authorization header
    const auth = Buffer.from(`${username}:${password}`).toString('base64');
    const headers = {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'text/plain',
    };

    switch (action) {
      case 'test':
        return await testConnection(host, headers);

      case 'create_tables':
        return await createTables(host, headers, database);

      case 'import_urls':
        return await importUrls(host, headers, database, data?.urls || []);

      case 'save_videos':
        return await saveVideos(host, headers, database, data?.videos || []);

      case 'save_complete_videos':
        return await saveCompleteVideos(host, headers, database, data?.videos || []);

      case 'save_results':
        return await saveAnalysisResults(host, headers, database, data?.results || {});

      case 'get_urls':
        return await getUrls(host, headers, database, data?.limit || 1000);

      case 'get_videos_with_embeddings':
        return await getVideosWithEmbeddings(host, headers, database, data?.limit || 1000);

      default:
        return Response.json({
          success: false,
          error: 'Invalid action specified'
        }, { status: 400 });
    }

  } catch (error: any) {
    console.error('ClickHouse API error:', error);
    return Response.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
}

// Test ClickHouse connection
async function testConnection(host: string, headers: any) {
  try {
    const response = await fetch(host, {
      method: 'POST',
      headers,
      body: 'SELECT 1 as test',
    });

    if (!response.ok) {
      const errorText = await response.text();
      return Response.json({
        success: false,
        error: `Connection failed: ${response.status} - ${errorText}`
      });
    }

    const result = await response.text();
    return Response.json({
      success: true,
      message: 'Connection successful',
      result: result.trim()
    });

  } catch (error: any) {
    return Response.json({
      success: false,
      error: `Connection failed: ${error.message}`
    });
  }
}

// Create necessary tables
async function createTables(host: string, headers: any, database: string) {
  try {
    // Create urls table
    const createUrlsTable = `
      CREATE TABLE IF NOT EXISTS ${database}.urls (
        id UUID DEFAULT generateUUIDv4(),
        url String,
        added_at DateTime DEFAULT now(),
        processed Boolean DEFAULT false,
        INDEX idx_url url TYPE bloom_filter GRANULARITY 1
      ) ENGINE = MergeTree()
      ORDER BY added_at
      SETTINGS index_granularity = 8192;
    `;

    // Create comprehensive videos table with all metadata
    const createVideosTable = `
      CREATE TABLE IF NOT EXISTS ${database}.videos (
        id String,
        url String,
        title String,
        thumbnail String,
        duration String,
        view_count Nullable(UInt64),
        like_count Nullable(UInt64),
        comment_count Nullable(UInt64),
        published_at Nullable(DateTime),
        channel_id Nullable(String),
        channel_title Nullable(String),
        description Nullable(String),
        tags Array(String) DEFAULT [],
        category_id Nullable(String),
        embedding Array(Float32) DEFAULT [],
        embedding_model Nullable(String),
        embedding_dimensions Nullable(UInt16),
        embedding_generated_at Nullable(DateTime),
        processed_for_clustering Boolean DEFAULT false,
        language_detected Nullable(String),
        language_confidence Nullable(Float32),
        added_at DateTime DEFAULT now(),
        updated_at DateTime DEFAULT now(),
        INDEX idx_id id TYPE bloom_filter GRANULARITY 1,
        INDEX idx_url url TYPE bloom_filter GRANULARITY 1,
        INDEX idx_title title TYPE bloom_filter GRANULARITY 1,
        INDEX idx_channel channel_id TYPE bloom_filter GRANULARITY 1,
        INDEX idx_embedding_model embedding_model TYPE bloom_filter GRANULARITY 1
      ) ENGINE = ReplacingMergeTree(updated_at)
      ORDER BY id
      SETTINGS index_granularity = 8192;
    `;

    // Create analysis_results table
    const createAnalysisTable = `
      CREATE TABLE IF NOT EXISTS ${database}.analysis_results (
        id UUID DEFAULT generateUUIDv4(),
        session_id String,
        video_count UInt32,
        cluster_count UInt32,
        embedding_model String,
        clustering_algorithm String,
        created_at DateTime DEFAULT now(),
        results String,
        INDEX idx_session session_id TYPE bloom_filter GRANULARITY 1
      ) ENGINE = MergeTree()
      ORDER BY created_at
      SETTINGS index_granularity = 8192;
    `;

    // Execute table creation queries
    const tables = [
      { name: 'urls', query: createUrlsTable },
      { name: 'videos', query: createVideosTable },
      { name: 'analysis_results', query: createAnalysisTable }
    ];

    for (const table of tables) {
      const response = await fetch(host, {
        method: 'POST',
        headers,
        body: table.query,
      });

      if (!response.ok) {
        const errorText = await response.text();
        return Response.json({
          success: false,
          error: `Failed to create ${table.name} table: ${errorText}`
        });
      }
    }

    return Response.json({
      success: true,
      message: 'All tables created successfully'
    });

  } catch (error: any) {
    return Response.json({
      success: false,
      error: `Table creation failed: ${error.message}`
    });
  }
}

// Import URLs (with duplicate prevention)
async function importUrls(host: string, headers: any, database: string, urls: string[]) {
  try {
    if (!urls || urls.length === 0) {
      return Response.json({
        success: false,
        error: 'No URLs provided'
      });
    }

    // First, create tables if they don't exist
    await createTables(host, headers, database);

    // Prepare insert query with deduplication
    const values = urls.map(url => `('${(url || '').replace(/'/g, "''")}')`).join(',');
    const insertQuery = `
      INSERT INTO ${database}.urls (url)
      SELECT url FROM (
        SELECT url FROM VALUES ('url String', ${values})
      ) AS new_urls
      WHERE url NOT IN (
        SELECT url FROM ${database}.urls
      );
    `;

    const response = await fetch(host, {
      method: 'POST',
      headers,
      body: insertQuery,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return Response.json({
        success: false,
        error: `Failed to import URLs: ${errorText}`
      });
    }

    // Get count of imported URLs
    const countQuery = `SELECT count() as total FROM ${database}.urls`;
    const countResponse = await fetch(host, {
      method: 'POST',
      headers,
      body: countQuery,
    });

    let totalCount = 0;
    if (countResponse.ok) {
      const countResult = await countResponse.text();
      totalCount = parseInt(countResult.trim()) || 0;
    }

    return Response.json({
      success: true,
      message: `URLs imported successfully`,
      totalUrls: totalCount,
      submittedUrls: urls.length
    });

  } catch (error: any) {
    return Response.json({
      success: false,
      error: `Import failed: ${error.message}`
    });
  }
}

// Save complete video data with all metadata (new comprehensive version)
async function saveCompleteVideos(host: string, headers: any, database: string, videos: any[]) {
  try {
    if (!videos || videos.length === 0) {
      return Response.json({
        success: false,
        error: 'No videos provided'
      });
    }

    console.log('Saving complete videos to ClickHouse:', {
      count: videos.length,
      sampleVideo: videos[0],
      database
    });

    // First, create tables if they don't exist
    await createTables(host, headers, database);

    // Use the same comprehensive insert logic
    const values = videos.map(video => {
      const id = video.id || '';
      const url = (video.url || '').replace(/'/g, "''");
      const title = (video.title || '').replace(/'/g, "''");
      const thumbnail = (video.thumbnail || '').replace(/'/g, "''");
      const duration = video.duration || '';
      const view_count = video.view_count || 'NULL';
      const like_count = video.like_count || 'NULL';
      const comment_count = video.comment_count || 'NULL';
      const published_at = video.published_at ? `'${video.published_at}'` : 'NULL';
      const channel_id = video.channel_id ? `'${video.channel_id.replace(/'/g, "''")}'` : 'NULL';
      const channel_title = video.channel_title ? `'${video.channel_title.replace(/'/g, "''")}'` : 'NULL';
      const description = video.description ? `'${video.description.replace(/'/g, "''")}'` : 'NULL';
      const tags = video.tags && Array.isArray(video.tags)
        ? `[${video.tags.map((tag: string) => `'${tag.replace(/'/g, "''")}'`).join(',')}]`
        : '[]';
      const category_id = video.category_id ? `'${video.category_id}'` : 'NULL';

      // Handle embeddings
      const embedding = video.embedding && Array.isArray(video.embedding)
        ? `[${video.embedding.join(',')}]`
        : '[]';
      const embedding_model = video.embedding_model ? `'${video.embedding_model.replace(/'/g, "''")}'` : 'NULL';
      const embedding_dimensions = video.embedding_dimensions || 'NULL';
      const embedding_generated_at = video.embedding_generated_at ? `'${video.embedding_generated_at}'` : 'NULL';

      // Language detection
      const language_detected = video.language_detected ? `'${video.language_detected}'` : 'NULL';
      const language_confidence = video.language_confidence || 'NULL';

      const processed_for_clustering = video.processed_for_clustering ? 'true' : 'false';

      return `('${id}', '${url}', '${title}', '${thumbnail}', '${duration}', ${view_count}, ${like_count}, ${comment_count}, ${published_at}, ${channel_id}, ${channel_title}, ${description}, ${tags}, ${category_id}, ${embedding}, ${embedding_model}, ${embedding_dimensions}, ${embedding_generated_at}, ${processed_for_clustering}, ${language_detected}, ${language_confidence}, now(), now())`;
    }).join(',');

    const insertQuery = `
      INSERT INTO ${database}.videos (
        id, url, title, thumbnail, duration, view_count, like_count, comment_count,
        published_at, channel_id, channel_title, description, tags, category_id,
        embedding, embedding_model, embedding_dimensions, embedding_generated_at,
        processed_for_clustering, language_detected, language_confidence, added_at, updated_at
      )
      VALUES ${values};
    `;

    const response = await fetch(host, {
      method: 'POST',
      headers,
      body: insertQuery,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return Response.json({
        success: false,
        error: `Failed to save complete videos: ${errorText}`
      });
    }

    return Response.json({
      success: true,
      message: `${videos.length} complete videos saved successfully with all metadata`
    });

  } catch (error: any) {
    return Response.json({
      success: false,
      error: `Save failed: ${error.message}`
    });
  }
}

// Save video data (legacy version for backward compatibility)
async function saveVideos(host: string, headers: any, database: string, videos: any[]) {
  try {
    if (!videos || videos.length === 0) {
      return Response.json({
        success: false,
        error: 'No videos provided'
      });
    }

    console.log('Saving videos to ClickHouse:', {
      count: videos.length,
      sampleVideo: videos[0],
      database
    });

    // First, create tables if they don't exist
    await createTables(host, headers, database);

    // Prepare values for comprehensive batch insert
    const values = videos.map(video => {
      const id = video.id || '';
      const url = (video.url || '').replace(/'/g, "''");
      const title = (video.title || '').replace(/'/g, "''");
      const thumbnail = (video.thumbnail || '').replace(/'/g, "''");
      const duration = video.duration || '';
      const view_count = video.view_count || 'NULL';
      const like_count = video.like_count || 'NULL';
      const comment_count = video.comment_count || 'NULL';
      const published_at = video.published_at ? `'${video.published_at}'` : 'NULL';
      const channel_id = video.channel_id ? `'${video.channel_id.replace(/'/g, "''")}'` : 'NULL';
      const channel_title = video.channel_title ? `'${video.channel_title.replace(/'/g, "''")}'` : 'NULL';
      const description = video.description ? `'${video.description.replace(/'/g, "''")}'` : 'NULL';
      const tags = video.tags && Array.isArray(video.tags)
        ? `[${video.tags.map((tag: string) => `'${tag.replace(/'/g, "''")}'`).join(',')}]`
        : '[]';
      const category_id = video.category_id ? `'${video.category_id}'` : 'NULL';

      // Handle embeddings
      const embedding = video.embedding && Array.isArray(video.embedding)
        ? `[${video.embedding.join(',')}]`
        : '[]';
      const embedding_model = video.embedding_model ? `'${video.embedding_model.replace(/'/g, "''")}'` : 'NULL';
      const embedding_dimensions = video.embedding_dimensions || 'NULL';
      const embedding_generated_at = video.embedding_generated_at ? `'${video.embedding_generated_at}'` : 'NULL';

      // Language detection
      const language_detected = video.language_detected ? `'${video.language_detected}'` : 'NULL';
      const language_confidence = video.language_confidence || 'NULL';

      const processed_for_clustering = video.processed_for_clustering ? 'true' : 'false';

      return `('${id}', '${url}', '${title}', '${thumbnail}', '${duration}', ${view_count}, ${like_count}, ${comment_count}, ${published_at}, ${channel_id}, ${channel_title}, ${description}, ${tags}, ${category_id}, ${embedding}, ${embedding_model}, ${embedding_dimensions}, ${embedding_generated_at}, ${processed_for_clustering}, ${language_detected}, ${language_confidence}, now(), now())`;
    }).join(',');

    const insertQuery = `
      INSERT INTO ${database}.videos (
        id, url, title, thumbnail, duration, view_count, like_count, comment_count,
        published_at, channel_id, channel_title, description, tags, category_id,
        embedding, embedding_model, embedding_dimensions, embedding_generated_at,
        processed_for_clustering, language_detected, language_confidence, added_at, updated_at
      )
      VALUES ${values};
    `;

    const response = await fetch(host, {
      method: 'POST',
      headers,
      body: insertQuery,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return Response.json({
        success: false,
        error: `Failed to save videos: ${errorText}`
      });
    }

    return Response.json({
      success: true,
      message: `${videos.length} videos saved successfully`
    });

  } catch (error: any) {
    return Response.json({
      success: false,
      error: `Save failed: ${error.message}`
    });
  }
}

// Save analysis results
async function saveAnalysisResults(host: string, headers: any, database: string, results: any) {
  try {
    // First, create tables if they don't exist
    await createTables(host, headers, database);

    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const resultsJson = JSON.stringify(results).replace(/'/g, "''");

    const insertQuery = `
      INSERT INTO ${database}.analysis_results
      (session_id, video_count, cluster_count, embedding_model, clustering_algorithm, results)
      VALUES (
        '${sessionId}',
        ${results.videoCount || 0},
        ${results.clusterCount || 0},
        '${results.embeddingModel || 'unknown'}',
        '${results.clusteringAlgorithm || 'unknown'}',
        '${resultsJson}'
      );
    `;

    const response = await fetch(host, {
      method: 'POST',
      headers,
      body: insertQuery,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return Response.json({
        success: false,
        error: `Failed to save analysis results: ${errorText}`
      });
    }

    return Response.json({
      success: true,
      message: 'Analysis results saved successfully',
      sessionId
    });

  } catch (error: any) {
    return Response.json({
      success: false,
      error: `Save failed: ${error.message}`
    });
  }
}

// Get URLs from database
async function getUrls(host: string, headers: any, database: string, limit: number) {
  try {
    console.log(`Getting URLs from database: ${database}, limit: ${limit}`);

    // First, check if table exists and has data
    const countQuery = `SELECT count() as total FROM ${database}.urls`;

    const countResponse = await fetch(host, {
      method: 'POST',
      headers,
      body: countQuery,
    });

    if (!countResponse.ok) {
      const errorText = await countResponse.text();
      console.error('Count query failed:', errorText);
      return Response.json({
        success: false,
        error: `Failed to check URL count: ${errorText}`
      });
    }

    const countText = await countResponse.text();
    const totalUrls = parseInt(countText.trim()) || 0;
    console.log(`Total URLs in database: ${totalUrls}`);

    if (totalUrls === 0) {
      // Check if there are URLs in the videos table instead
      console.log('No URLs in urls table, checking videos table...');

      const videoCountQuery = `SELECT count() as total FROM ${database}.videos`;
      const videoCountResponse = await fetch(host, {
        method: 'POST',
        headers,
        body: videoCountQuery,
      });

      if (videoCountResponse.ok) {
        const videoCountText = await videoCountResponse.text();
        const totalVideos = parseInt(videoCountText.trim()) || 0;
        console.log(`Total videos in database: ${totalVideos}`);

        if (totalVideos > 0) {
          // Get URLs from videos table
          const videoQuery = `
            SELECT url, added_at
            FROM ${database}.videos
            ORDER BY added_at DESC
            LIMIT ${limit}
            FORMAT JSONEachRow
          `;

          const videoResponse = await fetch(host, {
            method: 'POST',
            headers,
            body: videoQuery,
          });

          if (videoResponse.ok) {
            const videoResultText = await videoResponse.text();
            console.log('Raw video response from ClickHouse:', videoResultText);

            const videoUrls = videoResultText
              .trim()
              .split('\n')
              .filter(line => line.trim())
              .map(line => {
                try {
                  return JSON.parse(line);
                } catch (e) {
                  console.error('Failed to parse video line:', line, e);
                  return null;
                }
              })
              .filter(Boolean);

            console.log(`Parsed ${videoUrls.length} URLs from videos table`);

            return Response.json({
              success: true,
              urls: videoUrls,
              count: videoUrls.length,
              totalInDb: totalVideos,
              source: 'videos table'
            });
          }
        }
      }

      return Response.json({
        success: true,
        urls: [],
        count: 0,
        message: 'No URLs found in either urls or videos tables'
      });
    }

    // Get the URLs
    const query = `
      SELECT url, added_at, processed
      FROM ${database}.urls
      ORDER BY added_at DESC
      LIMIT ${limit}
      FORMAT JSONEachRow
    `;

    const response = await fetch(host, {
      method: 'POST',
      headers,
      body: query,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('URLs query failed:', errorText);
      return Response.json({
        success: false,
        error: `Failed to fetch URLs: ${errorText}`
      });
    }

    const resultText = await response.text();
    console.log('Raw response from ClickHouse:', resultText);

    // Parse JSONEachRow format (one JSON object per line)
    const urls = resultText
      .trim()
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          console.error('Failed to parse line:', line, e);
          return null;
        }
      })
      .filter(Boolean);

    console.log(`Parsed ${urls.length} URLs from response`);

    return Response.json({
      success: true,
      urls,
      count: urls.length,
      totalInDb: totalUrls
    });

  } catch (error: any) {
    console.error('getUrls error:', error);
    return Response.json({
      success: false,
      error: `Fetch failed: ${error.message}`
    });
  }
}

// Get videos with embeddings and all metadata
async function getVideosWithEmbeddings(host: string, headers: any, database: string, limit: number) {
  try {
    console.log(`Getting videos with embeddings from database: ${database}, limit: ${limit}`);

    // First, check if table exists and has data
    const countQuery = `SELECT count() as total FROM ${database}.videos WHERE length(embedding) > 0`;

    const countResponse = await fetch(host, {
      method: 'POST',
      headers,
      body: countQuery,
    });

    if (!countResponse.ok) {
      const errorText = await countResponse.text();
      console.error('Count query failed:', errorText);
      return Response.json({
        success: false,
        error: `Failed to check video count: ${errorText}`
      });
    }

    const countText = await countResponse.text();
    const totalVideosWithEmbeddings = parseInt(countText.trim()) || 0;
    console.log(`Total videos with embeddings in database: ${totalVideosWithEmbeddings}`);

    if (totalVideosWithEmbeddings === 0) {
      return Response.json({
        success: true,
        videos: [],
        count: 0,
        message: 'No videos with embeddings found in database'
      });
    }

    // Get the videos with all metadata
    const query = `
      SELECT
        id, url, title, thumbnail, duration, view_count, like_count, comment_count,
        published_at, channel_id, channel_title, description, tags, category_id,
        embedding, embedding_model, embedding_dimensions, embedding_generated_at,
        processed_for_clustering, language_detected, language_confidence,
        added_at, updated_at
      FROM ${database}.videos
      WHERE length(embedding) > 0
      ORDER BY updated_at DESC
      LIMIT ${limit}
      FORMAT JSONEachRow
    `;

    const response = await fetch(host, {
      method: 'POST',
      headers,
      body: query,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Videos query failed:', errorText);
      return Response.json({
        success: false,
        error: `Failed to fetch videos: ${errorText}`
      });
    }

    const resultText = await response.text();
    console.log(`Raw video response from ClickHouse (${resultText.length} chars)`);

    // Parse JSONEachRow format (one JSON object per line)
    const videos = resultText
      .trim()
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          console.error('Failed to parse video line:', line, e);
          return null;
        }
      })
      .filter(Boolean);

    console.log(`Parsed ${videos.length} videos with embeddings from response`);

    return Response.json({
      success: true,
      videos,
      count: videos.length,
      totalInDb: totalVideosWithEmbeddings
    });

  } catch (error: any) {
    console.error('getVideosWithEmbeddings error:', error);
    return Response.json({
      success: false,
      error: `Fetch failed: ${error.message}`
    });
  }
}