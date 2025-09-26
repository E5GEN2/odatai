// Improved language detection for YouTube titles
// Returns proper 2-letter ISO 639-1 language codes

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
  iso3Code: string; // 3-letter code from franc
}

export function detectTitleLanguage(title: string): LanguageDetectionResult {
  // Clean title - remove emojis and excessive punctuation but keep meaningful text
  const cleanTitle = title
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/gu, ' ') // Remove emojis
    .replace(/[|\\\/]/g, ' ') // Replace separators with spaces
    .trim();

  // Franc needs at least some text to work with
  if (cleanTitle.length < 3) {
    return {
      language: '??',
      confidence: 'low',
      iso3Code: 'und'
    };
  }

  // Detect language using franc
  const detected = franc(cleanTitle, { minLength: 3 });

  // Determine confidence based on text length and complexity
  let confidence: 'high' | 'medium' | 'low' = 'medium';
  if (cleanTitle.length < 10) {
    confidence = 'low';
  } else if (cleanTitle.length > 30 && /\s/.test(cleanTitle)) {
    confidence = 'high';
  }

  // Map to 2-letter code
  const iso2Code = ISO_CODE_MAP[detected] || '??';

  return {
    language: iso2Code,
    confidence,
    iso3Code: detected
  };
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