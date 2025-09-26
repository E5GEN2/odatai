// VS Code Language Detection for YouTube titles
// Uses VS Code's language detection library (based on fastText)

import { ModelOperations } from '@vscode/vscode-languagedetection';

// Initialize language detection model (will be loaded lazily)
let languageDetector: ModelOperations | null = null;

// Load language detection model
async function loadLanguageDetector() {
  if (!languageDetector) {
    languageDetector = new ModelOperations();
  }
  return languageDetector;
}

export interface LanguageDetectionResult {
  language: string; // 2-letter code
  confidence: 'high' | 'medium' | 'low';
  detectionScore: number; // confidence score from detector
}

export async function detectTitleLanguage(title: string): Promise<LanguageDetectionResult> {
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
    // Load language detector and detect language
    const detector = await loadLanguageDetector();
    const result = await detector.runModel(cleanTitle);

    if (!result || result.length === 0) {
      return {
        language: '??',
        confidence: 'low',
        detectionScore: 0
      };
    }

    // Get the top prediction
    const topPrediction = result[0];
    const languageCode = topPrediction.languageId;
    const score = topPrediction.confidence;

    // Convert to 2-letter ISO code (VS Code already returns ISO codes)
    const iso2Code = languageCode.length === 2 ? languageCode : '??';

    // Determine confidence based on score and text characteristics
    let confidence: 'high' | 'medium' | 'low' = 'low';
    if (score > 0.8 && cleanTitle.length > 15) {
      confidence = 'high';
    } else if (score > 0.5 && cleanTitle.length > 5) {
      confidence = 'medium';
    }

    return {
      language: iso2Code,
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
export async function detectLanguagesBatch(titles: string[]): Promise<LanguageDetectionResult[]> {
  const results: LanguageDetectionResult[] = [];

  // Load the model once for all detections
  await loadLanguageDetector();

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