// Franc-min Language Detection for YouTube titles
// Uses franc-min for reliable language detection

import { franc } from 'franc-min';

// Map 3-letter ISO 639-3 codes from franc to 2-letter ISO 639-1 codes
const ISO_CODE_MAP: Record<string, string> = {
  'eng': 'en', // English
  'rus': 'ru', // Russian
  'spa': 'es', // Spanish
  'fra': 'fr', // French
  'deu': 'de', // German
  'ita': 'it', // Italian
  'por': 'pt', // Portuguese
  'nld': 'nl', // Dutch
  'pol': 'pl', // Polish
  'ukr': 'uk', // Ukrainian
  'jpn': 'ja', // Japanese
  'kor': 'ko', // Korean
  'cmn': 'zh', // Chinese (Mandarin)
  'ara': 'ar', // Arabic
  'tur': 'tr', // Turkish
  'hin': 'hi', // Hindi
  'vie': 'vi', // Vietnamese
  'tha': 'th', // Thai
  'ind': 'id', // Indonesian
  'swe': 'sv', // Swedish
  'dan': 'da', // Danish
  'nor': 'no', // Norwegian
  'fin': 'fi', // Finnish
  'ces': 'cs', // Czech
  'hun': 'hu', // Hungarian
  'ron': 'ro', // Romanian
  'bul': 'bg', // Bulgarian
  'srp': 'sr', // Serbian
  'hrv': 'hr', // Croatian
  'slk': 'sk', // Slovak
  'slv': 'sl', // Slovenian
  'lit': 'lt', // Lithuanian
  'lav': 'lv', // Latvian
  'est': 'et', // Estonian
  'kat': 'ka', // Georgian
  'hye': 'hy', // Armenian
  'aze': 'az', // Azerbaijani
  'kaz': 'kk', // Kazakh
  'uzb': 'uz', // Uzbek
  'heb': 'he', // Hebrew
  'ell': 'el', // Greek
  'ben': 'bn', // Bengali
  'tel': 'te', // Telugu
  'tam': 'ta', // Tamil
  'mar': 'mr', // Marathi
  'urd': 'ur', // Urdu
  'fas': 'fa', // Persian
  'pus': 'ps', // Pashto
  'msa': 'ms', // Malay
  'fil': 'tl', // Filipino
  'und': '??', // Undetermined
};

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

  // Franc needs at least some text to work with
  if (cleanTitle.length < 3) {
    return {
      language: '??',
      confidence: 'low',
      detectionScore: 0
    };
  }

  try {
    // Detect language using franc
    const detected = franc(cleanTitle, { minLength: 3 });

    // Map to 2-letter code
    const iso2Code = ISO_CODE_MAP[detected] || '??';

    // Determine confidence based on text length and content quality
    let confidence: 'high' | 'medium' | 'low' = 'medium';
    let detectionScore = 0.5;

    if (cleanTitle.length < 10) {
      confidence = 'low';
      detectionScore = 0.3;
    } else if (cleanTitle.length > 30 && /\s/.test(cleanTitle)) {
      confidence = 'high';
      detectionScore = 0.8;
    }

    // If franc couldn't detect (returns 'und'), mark as unknown
    if (detected === 'und' || iso2Code === '??') {
      confidence = 'low';
      detectionScore = 0;
    }

    return {
      language: iso2Code,
      confidence,
      detectionScore
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