// Google Gemini Embeddings API implementation
// Much better than BGE Large - 3072 dimensions vs 1024!

export interface GoogleEmbeddingConfig {
  apiKey: string;
  model?: string;
  dimensions?: number;
  taskType?: 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT' | 'SEMANTIC_SIMILARITY' | 'CLASSIFICATION' | 'CLUSTERING';
}

// Call Google Gemini API to get embeddings
export async function getGoogleEmbeddings(
  texts: string[],
  config: GoogleEmbeddingConfig,
  retryCount: number = 0
): Promise<number[][]> {
  // Use the correct model based on desired dimensions
  const modelName = config.dimensions === 3072 ? 'gemini-embedding-001' : 'text-embedding-004';
  const API_URL = config.dimensions === 3072
    ? 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents'
    : 'https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents';
  const maxRetries = 3;

  console.log(`Calling Google Gemini API: ${texts.length} texts, dimensions: ${config.dimensions || 768}`);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30 seconds - much faster than HF

    const requestBody = {
      requests: texts.map(text => ({
        model: config.model && config.model.startsWith('models/') ? config.model : `models/${modelName}`,
        content: {
          parts: [{ text }]
        },
        taskType: config.taskType || 'SEMANTIC_SIMILARITY'
        // Note: outputDimensionality is omitted to get full dimensional embeddings
        // Text-embedding-004 should return 3072 dimensions by default
      }))
    };

    const response = await fetch(`${API_URL}?key=${config.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      let errorDetails = '';
      try {
        const errorBody = await response.text();
        console.error('Google API error response:', errorBody);
        errorDetails = errorBody;
      } catch (e) {
        console.error('Could not read error response body');
      }

      let errorMessage = `Google Gemini API error: ${response.status}`;

      if (response.status === 429) {
        errorMessage = 'Google API rate limit exceeded. Please wait and try again';

        // Retry logic for rate limits
        if (retryCount < maxRetries) {
          const delay = Math.pow(2, retryCount) * 3000; // Exponential backoff: 3s, 6s, 12s
          console.log(`Rate limit hit, retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return getGoogleEmbeddings(texts, config, retryCount + 1);
        }
      } else if (response.status === 401 || response.status === 403) {
        errorMessage = 'Google API authentication failed. Check your API key';
      } else if (response.status === 400) {
        errorMessage = `Bad request to Google API: ${errorDetails}`;
      }

      throw new Error(errorMessage);
    }

    const result = await response.json();

    // Extract embeddings from Google's response format
    const embeddings = result.embeddings?.map((item: any) => item.values) || [];

    if (embeddings.length === 0) {
      throw new Error('No embeddings returned from Google API');
    }

    console.log(`Successfully generated ${embeddings.length} embeddings with ${embeddings[0].length} dimensions`);
    return embeddings;

  } catch (error: any) {
    console.error('Error getting Google embeddings:', error);

    if (error.name === 'AbortError') {
      throw new Error('Request timed out after 30 seconds. Please try again.');
    } else if (error.message?.includes('fetch')) {
      throw new Error('Network error: Unable to connect to Google API. Check your internet connection.');
    }

    throw error;
  }
}

// Process YouTube titles with Google Gemini embeddings
export async function processYouTubeTitlesWithGoogle(
  titles: string[],
  config: GoogleEmbeddingConfig,
  onProgress?: (batch: number, totalBatches: number, message: string) => void
): Promise<{
  embeddings: number[][];
  model: string;
  dimensions: number;
}> {
  const model = config.model || 'text-embedding-004';
  const dimensions = config.dimensions || 3072;

  try {
    console.log(`Getting Google embeddings for ${titles.length} titles using ${model}...`);

    // Use very small batches to respect rate limits - Google free tier is very restrictive
    const batchSize = Math.min(10, titles.length);
    const totalBatches = Math.ceil(titles.length / batchSize);
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < titles.length; i += batchSize) {
      const batchNumber = Math.floor(i / batchSize) + 1;
      const batch = titles.slice(i, i + batchSize);

      if (onProgress) {
        const startVideo = i + 1;
        const endVideo = Math.min(i + batchSize, titles.length);
        onProgress(
          batchNumber,
          totalBatches,
          `Processing batch ${batchNumber}/${totalBatches}: Generating Google embeddings for videos ${startVideo}-${endVideo}...`
        );
      }

      try {
        const batchEmbeddings = await getGoogleEmbeddings(batch, config);
        allEmbeddings.push(...batchEmbeddings);
      } catch (batchError: any) {
        console.error(`Failed to process batch ${batchNumber}:`, batchError);
        if (onProgress) {
          onProgress(batchNumber, totalBatches, `Error in batch ${batchNumber}: ${batchError.message}`);
        }
        throw batchError;
      }

      // Longer delay to respect rate limits - especially important for free tier
      if (i + batchSize < titles.length) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay between batches
      }
    }

    console.log(`Successfully generated ${allEmbeddings.length} Google embeddings`);

    return {
      embeddings: allEmbeddings,
      model,
      dimensions
    };

  } catch (error) {
    console.error('Failed to get Google embeddings:', error);
    throw new Error(`Failed to generate Google embeddings: ${error}. Please check your API key and try again.`);
  }
}