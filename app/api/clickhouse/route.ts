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

      case 'save_results':
        return await saveAnalysisResults(host, headers, database, data?.results || {});

      case 'get_urls':
        return await getUrls(host, headers, database, data?.limit || 1000);

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

    // Create videos table
    const createVideosTable = `
      CREATE TABLE IF NOT EXISTS ${database}.videos (
        id String,
        url String,
        title String,
        thumbnail String,
        duration String,
        added_at DateTime DEFAULT now(),
        INDEX idx_id id TYPE bloom_filter GRANULARITY 1,
        INDEX idx_url url TYPE bloom_filter GRANULARITY 1
      ) ENGINE = ReplacingMergeTree()
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
    const values = urls.map(url => `('${url.replace(/'/g, "''")}')`).join(',');
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

// Save video data (with duplicate prevention)
async function saveVideos(host: string, headers: any, database: string, videos: any[]) {
  try {
    if (!videos || videos.length === 0) {
      return Response.json({
        success: false,
        error: 'No videos provided'
      });
    }

    // First, create tables if they don't exist
    await createTables(host, headers, database);

    // Prepare values for batch insert
    const values = videos.map(video =>
      `('${video.id}', '${video.url.replace(/'/g, "''")}', '${video.title.replace(/'/g, "''")}', '${video.thumbnail.replace(/'/g, "''")}', '${video.duration}')`
    ).join(',');

    const insertQuery = `
      INSERT INTO ${database}.videos (id, url, title, thumbnail, duration)
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
    const query = `
      SELECT url, added_at, processed
      FROM ${database}.urls
      ORDER BY added_at DESC
      LIMIT ${limit}
      FORMAT JSON;
    `;

    const response = await fetch(host, {
      method: 'POST',
      headers,
      body: query,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return Response.json({
        success: false,
        error: `Failed to fetch URLs: ${errorText}`
      });
    }

    const result = await response.json();

    return Response.json({
      success: true,
      urls: result.data || [],
      count: result.data?.length || 0
    });

  } catch (error: any) {
    return Response.json({
      success: false,
      error: `Fetch failed: ${error.message}`
    });
  }
}