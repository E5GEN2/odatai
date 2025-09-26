// Google Cloud Translate Language Detection for YouTube titles
// Uses Google's industry-leading language detection

import { Translate } from '@google-cloud/translate/build/src/v2';

export interface LanguageDetectionResult {
  language: string; // 2-letter code
  confidence: 'high' | 'medium' | 'low';
  detectionScore: number; // confidence score from detector
}

// Initialize Google Translate client (will use environment variables for auth)
let translateClient: Translate | null = null;

function getTranslateClient(): Translate {
  if (!translateClient) {
    translateClient = new Translate();
  }
  return translateClient;
}

export async function detectTitleLanguage(title: string): Promise<LanguageDetectionResult> {
  // Clean title - remove emojis and excessive punctuation but keep meaningful text
  const cleanTitle = title
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/gu, ' ') // Remove emojis
    .replace(/[|\\\/]/g, ' ') // Replace separators with spaces
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  // Very short titles default to English
  if (cleanTitle.length < 3) {
    return {
      language: 'en',
      confidence: 'low',
      detectionScore: 0.3
    };
  }

  try {
    const translate = getTranslateClient();

    // Use Google Cloud Translate to detect language
    const [detection] = await translate.detect(cleanTitle);

    if (!detection || !detection.language) {
      return {
        language: 'en',
        confidence: 'low',
        detectionScore: 0.3
      };
    }

    const language = detection.language;
    const confidence = detection.confidence || 0.5;

    // Convert confidence to our categories
    let confidenceLevel: 'high' | 'medium' | 'low' = 'medium';
    if (confidence > 0.8) {
      confidenceLevel = 'high';
    } else if (confidence < 0.5) {
      confidenceLevel = 'low';
    }

    return {
      language,
      confidence: confidenceLevel,
      detectionScore: confidence
    };
  } catch (error) {
    console.error('Google Translate language detection failed:', error);

    // Fallback to simple heuristics
    return simpleLanguageDetection(cleanTitle);
  }
}

// Simple fallback detection using character patterns
function simpleLanguageDetection(text: string): LanguageDetectionResult {
  // Cyrillic script detection
  const cyrillicRatio = (text.match(/[\u0400-\u04FF]/g) || []).length / text.length;
  if (cyrillicRatio > 0.3) {
    return {
      language: 'ru',
      confidence: 'high',
      detectionScore: 0.9
    };
  }

  // CJK detection
  const cjkRatio = (text.match(/[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]/g) || []).length / text.length;
  if (cjkRatio > 0.3) {
    // Simple heuristic: if it has hiragana/katakana, it's Japanese
    if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) {
      return {
        language: 'ja',
        confidence: 'high',
        detectionScore: 0.9
      };
    }
    return {
      language: 'zh',
      confidence: 'medium',
      detectionScore: 0.7
    };
  }

  // Arabic script
  const arabicRatio = (text.match(/[\u0600-\u06FF]/g) || []).length / text.length;
  if (arabicRatio > 0.3) {
    return {
      language: 'ar',
      confidence: 'high',
      detectionScore: 0.9
    };
  }

  // Default to English
  return {
    language: 'en',
    confidence: 'low',
    detectionScore: 0.3
  };
}

// Batch detection for multiple titles
export async function detectLanguagesBatch(titles: string[]): Promise<LanguageDetectionResult[]> {
  const results: LanguageDetectionResult[] = [];

  for (const title of titles) {
    const result = await detectTitleLanguage(title);
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