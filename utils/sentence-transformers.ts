// Sentence Transformers implementation using Hugging Face Inference API
// Much better than Word2Vec for understanding full sentence/title semantics

export interface SentenceTransformerConfig {
  model: string;
  apiKey?: string;
  dimensions?: number;
}

// Popular sentence transformer models
export const SENTENCE_TRANSFORMER_MODELS = {
  'all-MiniLM-L6-v2': {
    name: 'all-MiniLM-L6-v2',
    dimensions: 384,
    description: 'Fast and accurate, good balance'
  },
  'all-mpnet-base-v2': {
    name: 'all-mpnet-base-v2',
    dimensions: 768,
    description: 'Best quality, slower'
  },
  'paraphrase-multilingual-MiniLM-L12-v2': {
    name: 'paraphrase-multilingual-MiniLM-L12-v2',
    dimensions: 384,
    description: 'Multilingual support'
  }
};

// Call Hugging Face Inference API to get embeddings
export async function getSentenceEmbeddings(
  texts: string[],
  model: string = 'sentence-transformers/all-MiniLM-L6-v2',
  apiKey?: string,
  retryCount: number = 0
): Promise<number[][]> {
  const API_URL = `https://api-inference.huggingface.co/models/${model}`;
  const maxRetries = 3;

  console.log(`Calling Hugging Face API: ${API_URL}, texts: ${texts.length}, has API key: ${!!apiKey}`);

  try {
    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    // Only include Authorization header if API key is provided
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    };

    if (apiKey && apiKey.trim() !== '') {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        inputs: texts,
        options: { wait_for_model: true }
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      // Try to get error details from response body
      let errorDetails = '';
      try {
        const errorBody = await response.text();
        console.error('Hugging Face API error response:', errorBody);
        errorDetails = errorBody;
      } catch (e) {
        console.error('Could not read error response body');
      }

      let errorMessage = `Hugging Face API error: ${response.status}`;

      // Retry for model loading errors
      if (response.status === 503 && retryCount < maxRetries) {
        console.log(`Model is loading, retrying in 5 seconds... (attempt ${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        return getSentenceEmbeddings(texts, model, apiKey, retryCount + 1);
      } else if (response.status === 503) {
        errorMessage = 'Model is still loading after multiple attempts, please try again later';
      } else if (response.status === 429) {
        errorMessage = 'Hugging Face API rate limit exceeded. Please wait 1-2 minutes and try again';
      } else if (response.status === 401) {
        errorMessage = 'Hugging Face API authentication failed. Try without API key for free tier usage';
      } else if (response.status === 400) {
        errorMessage = `Bad request to Hugging Face API: ${errorDetails}`;
      }

      throw new Error(errorMessage);
    }

    const result = await response.json();

    // Handle different response formats
    if (Array.isArray(result)) {
      return result;
    } else if (result.embeddings) {
      return result.embeddings;
    } else {
      throw new Error('Unexpected response format from Hugging Face API');
    }
  } catch (error: any) {
    console.error('Error getting sentence embeddings:', error);

    // Provide more specific error messages
    if (error.name === 'AbortError') {
      throw new Error('Request timed out after 30 seconds. The Hugging Face API may be down or overloaded.');
    } else if (error.message?.includes('fetch')) {
      throw new Error('Network error: Unable to connect to Hugging Face API. Check your internet connection.');
    }

    throw error;
  }
}

// Alternative: Use free inference without API key (rate limited)
export async function getEmbeddingsFree(
  texts: string[]
): Promise<number[][]> {
  // Use the free tier (may be rate limited)
  return getSentenceEmbeddings(
    texts,
    'sentence-transformers/all-MiniLM-L6-v2'
  );
}

// NO FALLBACK EMBEDDINGS - We must fail properly if API doesn't work
// Removed fallback function completely - better to fail than give bad results

// Process YouTube titles with Sentence Transformers
export async function processYouTubeTitles(
  titles: string[],
  config?: Partial<SentenceTransformerConfig>
): Promise<{
  embeddings: number[][];
  model: string;
  dimensions: number;
}> {
  const model = config?.model || 'sentence-transformers/all-MiniLM-L6-v2';
  const dimensions = config?.dimensions || 384;

  try {
    console.log(`Getting embeddings for ${titles.length} titles using ${model}...`);

    // Batch process if needed (API might have limits)
    const batchSize = 100;
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < titles.length; i += batchSize) {
      const batch = titles.slice(i, i + batchSize);
      const batchEmbeddings = await getSentenceEmbeddings(
        batch,
        model,
        config?.apiKey
      );
      allEmbeddings.push(...batchEmbeddings);

      // Small delay to respect rate limits
      if (i + batchSize < titles.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`Successfully generated ${allEmbeddings.length} embeddings`);

    return {
      embeddings: allEmbeddings,
      model,
      dimensions
    };

  } catch (error) {
    console.error('Failed to get sentence embeddings:', error);
    // NO FALLBACK - Better to fail than provide bad embeddings
    throw new Error(`Failed to generate embeddings: ${error}. Please check your internet connection and try again.`);
  }
}

// Enhanced version with progress callback support
export async function processYouTubeTitlesWithProgress(
  titles: string[],
  options?: {
    config?: Partial<SentenceTransformerConfig>;
    onProgress?: (batch: number, totalBatches: number, message: string) => void;
  }
): Promise<{
  embeddings: number[][];
  model: string;
  dimensions: number;
}> {
  const config = options?.config;
  const onProgress = options?.onProgress;
  const model = config?.model || 'sentence-transformers/all-MiniLM-L6-v2';
  const dimensions = config?.dimensions || 384;

  try {
    console.log(`Getting embeddings for ${titles.length} titles using ${model}...`);

    // Batch process if needed (API might have limits)
    const batchSize = 100;
    const totalBatches = Math.ceil(titles.length / batchSize);
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < titles.length; i += batchSize) {
      const batchNumber = Math.floor(i / batchSize) + 1;
      const batch = titles.slice(i, i + batchSize);

      // Report progress
      if (onProgress) {
        const startVideo = i + 1;
        const endVideo = Math.min(i + batchSize, titles.length);
        onProgress(
          batchNumber,
          totalBatches,
          `Processing batch ${batchNumber}/${totalBatches}: Generating embeddings for videos ${startVideo}-${endVideo}...`
        );
      }

      try {
        const batchEmbeddings = await getSentenceEmbeddings(
          batch,
          model,
          config?.apiKey
        );
        allEmbeddings.push(...batchEmbeddings);
      } catch (batchError: any) {
        console.error(`Failed to process batch ${batchNumber}:`, batchError);
        if (onProgress) {
          onProgress(batchNumber, totalBatches, `Error in batch ${batchNumber}: ${batchError.message}`);
        }
        throw batchError;
      }

      // Small delay to respect rate limits
      if (i + batchSize < titles.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`Successfully generated ${allEmbeddings.length} embeddings`);

    return {
      embeddings: allEmbeddings,
      model,
      dimensions
    };

  } catch (error) {
    console.error('Failed to get sentence embeddings:', error);
    // NO FALLBACK - Better to fail than provide bad embeddings
    if (onProgress) {
      onProgress(1, 1, 'ERROR: Failed to generate embeddings');
    }
    throw new Error(`Failed to generate embeddings: ${error}. Please check your internet connection and try again.`);
  }
}

// Compare two embeddings using cosine similarity
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have same dimensions');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

// Find most similar titles
export function findSimilarTitles(
  targetEmbedding: number[],
  allEmbeddings: number[][],
  titles: string[],
  topK: number = 5
): Array<{ title: string; similarity: number }> {
  const similarities = allEmbeddings.map((embedding, index) => ({
    title: titles[index],
    similarity: cosineSimilarity(targetEmbedding, embedding)
  }));

  // Sort by similarity (descending) and return top K
  return similarities
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}