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
  apiKey?: string
): Promise<number[][]> {
  const API_URL = `https://api-inference.huggingface.co/models/${model}`;

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { 'Authorization': `Bearer ${apiKey}` })
      },
      body: JSON.stringify({
        inputs: texts,
        options: { wait_for_model: true }
      })
    });

    if (!response.ok) {
      throw new Error(`Hugging Face API error: ${response.status}`);
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
  } catch (error) {
    console.error('Error getting sentence embeddings:', error);
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

// Fallback to local computation if API fails
export function computeFallbackEmbeddings(
  texts: string[],
  dimensions: number = 384
): number[][] {
  console.warn('Using fallback random embeddings - results will be poor');

  // Generate deterministic pseudo-random embeddings based on text
  return texts.map(text => {
    const embedding = new Array(dimensions);
    let hash = 0;

    // Simple hash function
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash = hash & hash; // Convert to 32bit integer
    }

    // Generate pseudo-random values
    for (let i = 0; i < dimensions; i++) {
      const seed = hash * (i + 1);
      embedding[i] = (Math.sin(seed) + Math.cos(seed * 0.5)) * 0.5;
    }

    return embedding;
  });
}

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
    console.error('Failed to get sentence embeddings, using fallback:', error);

    // Fallback to local computation
    return {
      embeddings: computeFallbackEmbeddings(titles, dimensions),
      model: 'fallback',
      dimensions
    };
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