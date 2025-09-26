// FastText Language Detection for YouTube titles
// Uses Facebook AI's fastText for accurate language identification

import FastText from 'fasttext.js';

// Initialize fastText model (will be loaded lazily)
let fastTextModel: any = null;

// Load fastText model
async function loadFastTextModel() {
  if (!fastTextModel) {
    fastTextModel = new FastText();
    await fastTextModel.loadModel();
  }
  return fastTextModel;
}

// Map fastText language codes to 2-letter ISO 639-1 codes
const FASTTEXT_TO_ISO_MAP: Record<string, string> = {
  '__label__en': 'en', // English
  '__label__es': 'es', // Spanish
  '__label__fr': 'fr', // French
  '__label__de': 'de', // German
  '__label__it': 'it', // Italian
  '__label__pt': 'pt', // Portuguese
  '__label__ru': 'ru', // Russian
  '__label__ja': 'ja', // Japanese
  '__label__ko': 'ko', // Korean
  '__label__zh': 'zh', // Chinese
  '__label__ar': 'ar', // Arabic
  '__label__hi': 'hi', // Hindi
  '__label__tr': 'tr', // Turkish
  '__label__nl': 'nl', // Dutch
  '__label__pl': 'pl', // Polish
  '__label__sv': 'sv', // Swedish
  '__label__da': 'da', // Danish
  '__label__no': 'no', // Norwegian
  '__label__fi': 'fi', // Finnish
  '__label__cs': 'cs', // Czech
  '__label__hu': 'hu', // Hungarian
  '__label__ro': 'ro', // Romanian
  '__label__bg': 'bg', // Bulgarian
  '__label__hr': 'hr', // Croatian
  '__label__sk': 'sk', // Slovak
  '__label__sl': 'sl', // Slovenian
  '__label__et': 'et', // Estonian
  '__label__lv': 'lv', // Latvian
  '__label__lt': 'lt', // Lithuanian
  '__label__el': 'el', // Greek
  '__label__he': 'he', // Hebrew
  '__label__th': 'th', // Thai
  '__label__vi': 'vi', // Vietnamese
  '__label__id': 'id', // Indonesian
  '__label__ms': 'ms', // Malay
  '__label__tl': 'tl', // Filipino
  '__label__fa': 'fa', // Persian
  '__label__ur': 'ur', // Urdu
  '__label__bn': 'bn', // Bengali
  '__label__ta': 'ta', // Tamil
  '__label__te': 'te', // Telugu
  '__label__mr': 'mr', // Marathi
  '__label__gu': 'gu', // Gujarati
  '__label__kn': 'kn', // Kannada
  '__label__ml': 'ml', // Malayalam
  '__label__pa': 'pa', // Punjabi
  '__label__uk': 'uk', // Ukrainian
  '__label__be': 'be', // Belarusian
  '__label__ka': 'ka', // Georgian
  '__label__hy': 'hy', // Armenian
  '__label__az': 'az', // Azerbaijani
  '__label__kk': 'kk', // Kazakh
  '__label__ky': 'ky', // Kyrgyz
  '__label__uz': 'uz', // Uzbek
  '__label__tg': 'tg', // Tajik
  '__label__mn': 'mn', // Mongolian
};

export interface LanguageDetectionResult {
  language: string; // 2-letter code
  confidence: 'high' | 'medium' | 'low';
  fastTextScore: number; // confidence score from fastText
}

export async function detectTitleLanguage(title: string): Promise<LanguageDetectionResult> {
  // Clean title - remove emojis and excessive punctuation but keep meaningful text
  const cleanTitle = title
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/gu, ' ') // Remove emojis
    .replace(/[|\\\/]/g, ' ') // Replace separators with spaces
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  // FastText needs at least some text to work with
  if (cleanTitle.length < 3) {
    return {
      language: '??',
      confidence: 'low',
      fastTextScore: 0
    };
  }

  try {
    // Load fastText model and detect language
    const model = await loadFastTextModel();
    const predictions = await model.predict(cleanTitle, 1);

    if (!predictions || predictions.length === 0) {
      return {
        language: '??',
        confidence: 'low',
        fastTextScore: 0
      };
    }

    const prediction = predictions[0];
    const fastTextLabel = prediction.label;
    const score = prediction.value;

    // Map fastText label to 2-letter ISO code
    const iso2Code = FASTTEXT_TO_ISO_MAP[fastTextLabel] || '??';

    // Determine confidence based on fastText score and text characteristics
    let confidence: 'high' | 'medium' | 'low' = 'low';
    if (score > 0.8 && cleanTitle.length > 15) {
      confidence = 'high';
    } else if (score > 0.5 && cleanTitle.length > 5) {
      confidence = 'medium';
    }

    return {
      language: iso2Code,
      confidence,
      fastTextScore: score
    };
  } catch (error) {
    console.error('FastText detection failed:', error);
    return {
      language: '??',
      confidence: 'low',
      fastTextScore: 0
    };
  }
}

// Batch detection for multiple titles
export async function detectLanguagesBatch(titles: string[]): Promise<LanguageDetectionResult[]> {
  const results: LanguageDetectionResult[] = [];

  // Load the model once for all detections
  await loadFastTextModel();

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