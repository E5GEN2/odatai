// Google langdetect for YouTube titles
// Uses Google's language detection library ported to JavaScript

import { detect } from 'langdetect';

export interface LanguageDetectionResult {
  language: string; // 2-letter code
  confidence: 'high' | 'medium' | 'low';
  detectionScore: number; // confidence score from detector
}

export function detectTitleLanguage(title: string): LanguageDetectionResult {
  // Clean title - remove emojis and excessive punctuation but keep meaningful text
  const cleanTitle = title
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/gu, ' ') // Remove emojis
    .replace(/[|\\\/]/g, ' ') // Replace separators with spaces
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  // Language detector needs at least some text to work with
  if (cleanTitle.length < 3) {
    return {
      language: '??',
      confidence: 'low',
      detectionScore: 0
    };
  }

  try {
    // Detect language using Google's langdetect
    const results = detect(cleanTitle);

    if (!results || results.length === 0) {
      return {
        language: '??',
        confidence: 'low',
        detectionScore: 0
      };
    }

    // Get the top prediction
    const topPrediction = results[0];
    const languageCode = topPrediction.lang;
    const score = topPrediction.prob;

    // Determine confidence based on score and text characteristics
    let confidence: 'high' | 'medium' | 'low' = 'low';
    if (score > 0.9 && cleanTitle.length > 15) {
      confidence = 'high';
    } else if (score > 0.7 && cleanTitle.length > 5) {
      confidence = 'medium';
    }

    return {
      language: languageCode,
      confidence,
      detectionScore: score
    };
  } catch (error) {
    console.error('Language detection failed:', error);
    return {
      language: '??',
      confidence: 'low',
      detectionScore: 0
    };
  }
}

// Batch detection for multiple titles
export function detectLanguagesBatch(titles: string[]): LanguageDetectionResult[] {
  const results: LanguageDetectionResult[] = [];

  for (const title of titles) {
    const result = detectTitleLanguage(title);
    results.push(result);
  }

  return results;
}

// Get language statistics from detection results
export function getLanguageStatistics(results: LanguageDetectionResult[]): {
  total: number;
  byLanguage: Record<string, number>;
  byConfidence: Record<string, number>;
} {
  const byLanguage: Record<string, number> = {};
  const byConfidence: Record<string, number> = { high: 0, medium: 0, low: 0 };

  results.forEach(result => {
    byLanguage[result.language] = (byLanguage[result.language] || 0) + 1;
    byConfidence[result.confidence]++;
  });

  return {
    total: results.length,
    byLanguage,
    byConfidence
  };
}