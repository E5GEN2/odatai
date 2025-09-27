// Smart Language Detection for YouTube titles
// Free solution optimized for YouTube content

export interface LanguageDetectionResult {
  language: string; // 2-letter code
  confidence: 'high' | 'medium' | 'low';
  detectionScore: number; // confidence score from detector
}

// Common language patterns for YouTube content
const LANGUAGE_PATTERNS = {
  // Cyrillic scripts
  ru: /[\u0400-\u04FF]/,
  uk: /[\u0400-\u04FF]/,
  bg: /[\u0400-\u04FF]/,
  sr: /[\u0400-\u04FF]/,

  // CJK scripts
  zh: /[\u4E00-\u9FFF]/,
  ja: /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/,
  ko: /[\uAC00-\uD7AF]/,

  // Arabic script
  ar: /[\u0600-\u06FF]/,
  fa: /[\u0600-\u06FF]/,
  ur: /[\u0600-\u06FF]/,

  // Thai
  th: /[\u0E00-\u0E7F]/,

  // Hebrew
  he: /[\u0590-\u05FF]/,

  // Hindi/Devanagari
  hi: /[\u0900-\u097F]/,
};

// Common English words that appear in YouTube titles
const ENGLISH_INDICATORS = [
  'the', 'and', 'for', 'with', 'how', 'to', 'in', 'on', 'at', 'of', 'is', 'are', 'was', 'were',
  'best', 'top', 'new', 'first', 'last', 'full', 'vs', 'review', 'trailer', 'gameplay',
  'tutorial', 'guide', 'tips', 'tricks', 'hack', 'mod', 'update', 'news', 'reaction',
  'compilation', 'highlights', 'moments', 'funny', 'epic', 'fail', 'win', 'challenge'
];

// Common Spanish words
const SPANISH_INDICATORS = [
  'el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'en', 'con', 'por', 'para', 'como',
  'que', 'qué', 'mi', 'tu', 'su', 'este', 'esta', 'estos', 'estas', 'mejor', 'nuevo', 'nueva'
];

// Common French words
const FRENCH_INDICATORS = [
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'dans', 'avec', 'pour', 'sur', 'comme',
  'que', 'qui', 'mon', 'ton', 'son', 'ce', 'cette', 'ces', 'meilleur', 'nouveau', 'nouvelle'
];

export function detectTitleLanguage(title: string): LanguageDetectionResult {
  const cleanTitle = title
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/gu, ' ')
    .replace(/[|\\\/\(\)\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  if (cleanTitle.length < 3) {
    return { language: 'en', confidence: 'low', detectionScore: 0.3 };
  }

  // 1. Check for obvious non-Latin scripts (highest confidence)
  for (const [lang, pattern] of Object.entries(LANGUAGE_PATTERNS)) {
    if (pattern.test(title)) {
      // Special handling for Cyrillic - default to Russian unless specific indicators
      if (lang === 'ru' && pattern === LANGUAGE_PATTERNS.ru) {
        return { language: 'ru', confidence: 'high', detectionScore: 0.95 };
      }
      return { language: lang, confidence: 'high', detectionScore: 0.9 };
    }
  }

  // 2. Word-based detection for Latin scripts
  const words = cleanTitle.split(/\s+/).filter(w => w.length > 1);
  const totalWords = words.length;

  if (totalWords === 0) {
    return { language: 'en', confidence: 'low', detectionScore: 0.3 };
  }

  // Count language indicators
  const englishCount = words.filter(w => ENGLISH_INDICATORS.includes(w)).length;
  const spanishCount = words.filter(w => SPANISH_INDICATORS.includes(w)).length;
  const frenchCount = words.filter(w => FRENCH_INDICATORS.includes(w)).length;

  const englishRatio = englishCount / totalWords;
  const spanishRatio = spanishCount / totalWords;
  const frenchRatio = frenchCount / totalWords;

  // 3. Language-specific character patterns
  const accentedChars = (cleanTitle.match(/[àáâãäåæçèéêëìíîïñòóôõöøùúûüý]/g) || []).length;
  const accentRatio = accentedChars / cleanTitle.length;

  // 4. Decision logic
  if (englishRatio > 0.2) {
    return { language: 'en', confidence: 'high', detectionScore: 0.8 + englishRatio };
  }

  if (spanishRatio > 0.15) {
    return { language: 'es', confidence: 'medium', detectionScore: 0.7 + spanishRatio };
  }

  if (frenchRatio > 0.15) {
    return { language: 'fr', confidence: 'medium', detectionScore: 0.7 + frenchRatio };
  }

  // Heavy accent usage suggests Romance language
  if (accentRatio > 0.1) {
    if (spanishRatio > frenchRatio) {
      return { language: 'es', confidence: 'low', detectionScore: 0.5 };
    } else {
      return { language: 'fr', confidence: 'low', detectionScore: 0.5 };
    }
  }

  // Default to English for YouTube (most common)
  return { language: 'en', confidence: 'low', detectionScore: 0.4 };
}

// Batch detection for multiple titles
export function detectLanguagesBatch(titles: string[]): LanguageDetectionResult[] {
  return titles.map(title => detectTitleLanguage(title));
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