// Word2Vec utilities for YouTube title clustering
import * as natural from 'natural';
// @ts-ignore - No types available for stopwords
import { removeStopwords, eng } from 'stopwords';
// @ts-ignore - No types available for stemmer
import { stemmer } from 'stemmer';

// Pre-trained word embeddings (GloVe-style) - subset for common words
// In production, this would be loaded from a larger embeddings file
const EMBEDDINGS: Record<string, number[]> = {
  // Common YouTube words
  'video': [0.2, 0.1, -0.3, 0.4, 0.15, -0.1, 0.25, 0.3],
  'tutorial': [0.3, 0.2, 0.1, 0.5, 0.2, -0.2, 0.4, 0.1],
  'review': [0.1, 0.3, -0.2, 0.2, 0.4, 0.1, -0.1, 0.3],
  'funny': [0.4, -0.1, 0.2, 0.1, 0.3, 0.2, 0.1, -0.2],
  'music': [0.2, 0.4, 0.1, -0.1, 0.3, 0.3, 0.2, 0.1],
  'game': [0.1, 0.2, 0.4, 0.3, -0.1, 0.2, 0.3, 0.2],
  'news': [0.3, 0.1, 0.2, 0.4, 0.1, -0.3, 0.2, 0.4],
  'movie': [0.2, 0.3, -0.1, 0.2, 0.4, 0.1, 0.3, -0.1],
  'how': [0.1, 0.4, 0.2, -0.2, 0.3, 0.2, 0.1, 0.3],
  'best': [0.4, 0.2, 0.3, 0.1, -0.1, 0.3, 0.2, 0.1],
  'top': [0.3, 0.3, 0.2, 0.2, 0.1, -0.2, 0.4, 0.2],
  'new': [0.2, 0.1, 0.4, 0.3, 0.2, 0.1, -0.1, 0.3],
  'amazing': [0.4, 0.1, 0.2, -0.1, 0.3, 0.3, 0.2, 0.1],
  'epic': [0.3, 0.2, 0.4, 0.1, 0.2, -0.1, 0.3, 0.2],
  'crazy': [0.2, 0.4, -0.2, 0.3, 0.1, 0.2, 0.3, -0.1],
  'reaction': [0.1, 0.3, 0.2, 0.4, -0.2, 0.1, 0.2, 0.3],
  'trailer': [0.3, 0.1, 0.4, 0.2, 0.3, -0.1, 0.1, 0.2],
  'compilation': [0.2, 0.2, 0.1, 0.3, 0.4, 0.2, -0.2, 0.1],
  'challenge': [0.4, -0.1, 0.3, 0.2, 0.1, 0.3, 0.2, 0.1],
  'vs': [0.1, 0.2, 0.4, -0.1, 0.3, 0.2, 0.3, 0.1],
  // Add more common words as needed...
  'ultimate': [0.3, 0.4, 0.1, 0.2, -0.1, 0.3, 0.2, 0.1],
  'guide': [0.2, 0.3, 0.4, 0.1, 0.2, -0.2, 0.3, 0.2],
  'tips': [0.1, 0.2, 0.3, 0.4, 0.1, 0.2, -0.1, 0.3],
  'secrets': [0.4, 0.1, -0.2, 0.3, 0.2, 0.3, 0.1, 0.2],
};

const EMBEDDING_DIM = 8; // Dimension of our embeddings

export interface Word2VecConfig {
  approach: 'pretrained' | 'custom' | 'hybrid';
  dimensions: number;
  aggregation: 'mean' | 'sum' | 'max' | 'tfidf';
  removeStopwords: boolean;
  stemWords: boolean;
  lowercase: boolean;
  handleUnknown: boolean;
}

export interface ProcessedText {
  original: string;
  tokens: string[];
  vector: number[];
  coverage: number; // Percentage of words found in embeddings
}

// Text preprocessing pipeline
export function preprocessText(
  text: string,
  config: Word2VecConfig
): string[] {
  let processed = text;

  // Lowercase
  if (config.lowercase) {
    processed = processed.toLowerCase();
  }

  // Tokenize
  const tokenizer = new natural.WordTokenizer();
  let tokens = tokenizer.tokenize(processed) || [];

  // Remove punctuation and numbers
  tokens = tokens.filter(token => /^[a-zA-Z]+$/.test(token));

  // Remove stopwords
  if (config.removeStopwords) {
    tokens = removeStopwords(tokens, eng);
  }

  // Stem words
  if (config.stemWords) {
    tokens = tokens.map(token => stemmer(token));
  }

  return tokens;
}

// Get word embedding
export function getWordEmbedding(
  word: string,
  config: Word2VecConfig
): number[] | null {
  const embedding = EMBEDDINGS[word.toLowerCase()];

  if (embedding) {
    return embedding;
  }

  // Handle unknown words
  if (config.handleUnknown) {
    // Return random vector for unknown words (simple fallback)
    return Array.from({ length: EMBEDDING_DIM }, () => Math.random() * 0.1 - 0.05);
  }

  return null;
}

// Convert text to vector using Word2Vec embeddings
export function textToVector(
  text: string,
  config: Word2VecConfig
): ProcessedText {
  const tokens = preprocessText(text, config);
  const embeddings: number[][] = [];
  let foundWords = 0;

  // Get embeddings for each token
  for (const token of tokens) {
    const embedding = getWordEmbedding(token, config);
    if (embedding) {
      embeddings.push(embedding);
      foundWords++;
    }
  }

  // Calculate coverage
  const coverage = tokens.length > 0 ? (foundWords / tokens.length) * 100 : 0;

  // Aggregate embeddings into single vector
  let finalVector: number[];

  if (embeddings.length === 0) {
    // No embeddings found, return zero vector
    finalVector = Array(EMBEDDING_DIM).fill(0);
  } else {
    switch (config.aggregation) {
      case 'mean':
        finalVector = aggregateMean(embeddings);
        break;
      case 'sum':
        finalVector = aggregateSum(embeddings);
        break;
      case 'max':
        finalVector = aggregateMax(embeddings);
        break;
      case 'tfidf':
        // For now, fallback to mean (TF-IDF requires corpus statistics)
        finalVector = aggregateMean(embeddings);
        break;
      default:
        finalVector = aggregateMean(embeddings);
    }
  }

  return {
    original: text,
    tokens,
    vector: finalVector,
    coverage
  };
}

// Aggregation functions
function aggregateMean(embeddings: number[][]): number[] {
  const dim = embeddings[0].length;
  const mean = Array(dim).fill(0);

  for (const embedding of embeddings) {
    for (let i = 0; i < dim; i++) {
      mean[i] += embedding[i];
    }
  }

  return mean.map(sum => sum / embeddings.length);
}

function aggregateSum(embeddings: number[][]): number[] {
  const dim = embeddings[0].length;
  const sum = Array(dim).fill(0);

  for (const embedding of embeddings) {
    for (let i = 0; i < dim; i++) {
      sum[i] += embedding[i];
    }
  }

  return sum;
}

function aggregateMax(embeddings: number[][]): number[] {
  const dim = embeddings[0].length;
  const max = Array(dim).fill(-Infinity);

  for (const embedding of embeddings) {
    for (let i = 0; i < dim; i++) {
      max[i] = Math.max(max[i], embedding[i]);
    }
  }

  return max;
}

// Convert multiple texts to vectors for clustering
export function prepareDataForClustering(
  texts: string[],
  config: Word2VecConfig
): ProcessedText[] {
  return texts.map(text => textToVector(text, config));
}

// Calculate similarity between two vectors (cosine similarity)
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}