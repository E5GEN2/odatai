// Simple language detection for filtering non-English content
// Uses character-based heuristics for basic detection

export interface LanguageDetectionResult {
  isEnglish: boolean;
  confidence: number;
  detectedScript: 'latin' | 'cyrillic' | 'cjk' | 'arabic' | 'other';
  nonLatinRatio: number;
}

// Character ranges for different scripts
const SCRIPT_RANGES = {
  cyrillic: /[\u0400-\u04FF]/g,  // Russian, Ukrainian, etc.
  cjk: /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/g,  // Chinese, Japanese, Korean
  arabic: /[\u0600-\u06FF\u0750-\u077F]/g,  // Arabic script
  thai: /[\u0E00-\u0E7F]/g,  // Thai script
  devanagari: /[\u0900-\u097F]/g,  // Hindi, etc.
  hebrew: /[\u0590-\u05FF]/g,  // Hebrew script
};

// Common English words for validation
const COMMON_ENGLISH_WORDS = new Set([
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
  'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
  'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
  'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their',
  'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go',
  'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know',
  'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them',
  'see', 'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over',
  'think', 'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work',
  'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these',
  'give', 'day', 'most', 'us', 'is', 'was', 'are', 'been', 'has', 'had',
  'were', 'said', 'did', 'having', 'may', 'here'
]);

export function detectLanguage(text: string): LanguageDetectionResult {
  // Clean the text (remove emojis, numbers, punctuation for analysis)
  const cleanText = text.toLowerCase().replace(/[0-9\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/gu, '');

  // Count non-Latin characters
  let nonLatinCount = 0;
  let detectedScript: 'latin' | 'cyrillic' | 'cjk' | 'arabic' | 'other' = 'latin';

  // Check for Cyrillic
  const cyrillicMatches = cleanText.match(SCRIPT_RANGES.cyrillic);
  if (cyrillicMatches && cyrillicMatches.length > 0) {
    nonLatinCount += cyrillicMatches.length;
    detectedScript = 'cyrillic';
  }

  // Check for CJK (Chinese, Japanese, Korean)
  const cjkMatches = cleanText.match(SCRIPT_RANGES.cjk);
  if (cjkMatches && cjkMatches.length > 0) {
    nonLatinCount += cjkMatches.length;
    if (cjkMatches.length > (cyrillicMatches?.length || 0)) {
      detectedScript = 'cjk';
    }
  }

  // Check for Arabic
  const arabicMatches = cleanText.match(SCRIPT_RANGES.arabic);
  if (arabicMatches && arabicMatches.length > 0) {
    nonLatinCount += arabicMatches.length;
    if (arabicMatches.length > (cyrillicMatches?.length || 0) && arabicMatches.length > (cjkMatches?.length || 0)) {
      detectedScript = 'arabic';
    }
  }

  // Check for Thai
  const thaiMatches = cleanText.match(SCRIPT_RANGES.thai);
  if (thaiMatches) nonLatinCount += thaiMatches.length;

  // Calculate non-Latin ratio
  const totalChars = cleanText.replace(/[^a-zA-Z\u0400-\u04FF\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF\u0600-\u06FF]/g, '').length;
  const nonLatinRatio = totalChars > 0 ? nonLatinCount / totalChars : 0;

  // If significant non-Latin characters, it's not English
  if (nonLatinRatio > 0.3) {
    return {
      isEnglish: false,
      confidence: 1 - nonLatinRatio,
      detectedScript,
      nonLatinRatio
    };
  }

  // Check for English words
  const words = cleanText.split(/\s+/).filter(w => w.length > 1);
  const englishWordCount = words.filter(word => COMMON_ENGLISH_WORDS.has(word)).length;
  const englishWordRatio = words.length > 0 ? englishWordCount / words.length : 0;

  // Determine if English based on multiple factors
  // If it's mostly Latin script with no/few non-Latin characters, likely English
  // Lower the English word requirement since many YouTube titles use brand names, game names, etc.
  const isEnglish = (englishWordRatio > 0.05 || (nonLatinRatio < 0.05 && words.length > 0)) && nonLatinRatio < 0.2;
  const confidence = nonLatinRatio < 0.05
    ? Math.max(0.6, Math.min(1, englishWordRatio * 3)) // High confidence for pure Latin text
    : Math.min(1, (englishWordRatio * 2) * (1 - nonLatinRatio));

  return {
    isEnglish,
    confidence,
    detectedScript: nonLatinRatio > 0 ? detectedScript : 'latin',
    nonLatinRatio
  };
}

// Batch language detection with statistics
export function detectLanguageBatch(texts: string[]): {
  results: LanguageDetectionResult[];
  englishTexts: string[];
  nonEnglishTexts: string[];
  statistics: {
    totalCount: number;
    englishCount: number;
    nonEnglishCount: number;
    scriptCounts: Record<string, number>;
  };
} {
  const results: LanguageDetectionResult[] = [];
  const englishTexts: string[] = [];
  const nonEnglishTexts: string[] = [];
  const scriptCounts: Record<string, number> = {};

  texts.forEach(text => {
    const result = detectLanguage(text);
    results.push(result);

    if (result.isEnglish) {
      englishTexts.push(text);
    } else {
      nonEnglishTexts.push(text);
    }

    scriptCounts[result.detectedScript] = (scriptCounts[result.detectedScript] || 0) + 1;
  });

  return {
    results,
    englishTexts,
    nonEnglishTexts,
    statistics: {
      totalCount: texts.length,
      englishCount: englishTexts.length,
      nonEnglishCount: nonEnglishTexts.length,
      scriptCounts
    }
  };
}

// Filter videos by language
export function filterEnglishVideos(videos: Array<{ title: string; [key: string]: any }>): {
  englishVideos: Array<{ title: string; [key: string]: any }>;
  filteredOutVideos: Array<{ title: string; [key: string]: any }>;
  statistics: {
    original: number;
    kept: number;
    filtered: number;
    percentageKept: number;
  };
} {
  const englishVideos: Array<{ title: string; [key: string]: any }> = [];
  const filteredOutVideos: Array<{ title: string; [key: string]: any }> = [];

  videos.forEach(video => {
    const detection = detectLanguage(video.title);
    if (detection.isEnglish) {
      englishVideos.push(video);
    } else {
      filteredOutVideos.push(video);
    }
  });

  const original = videos.length;
  const kept = englishVideos.length;
  const filtered = filteredOutVideos.length;

  return {
    englishVideos,
    filteredOutVideos,
    statistics: {
      original,
      kept,
      filtered,
      percentageKept: original > 0 ? Math.round((kept / original) * 100) : 100
    }
  };
}