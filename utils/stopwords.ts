// Comprehensive stopwords list for better cluster keywords extraction

export const ENGLISH_STOPWORDS = new Set([
  // Articles
  'a', 'an', 'the',

  // Pronouns
  'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your',
  'yours', 'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she',
  'her', 'hers', 'herself', 'it', 'its', 'itself', 'they', 'them', 'their',
  'theirs', 'themselves', 'what', 'which', 'who', 'whom', 'this', 'that',
  'these', 'those',

  // Common verbs
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
  'had', 'having', 'do', 'does', 'did', 'doing', 'will', 'would', 'should',
  'could', 'ought', 'may', 'might', 'must', 'can', 'need', 'dare', 'shall',

  // Prepositions
  'in', 'on', 'at', 'by', 'for', 'with', 'about', 'against', 'between',
  'into', 'through', 'during', 'before', 'after', 'above', 'below', 'to',
  'from', 'up', 'down', 'out', 'off', 'over', 'under', 'again', 'further',

  // Conjunctions
  'and', 'but', 'if', 'or', 'because', 'as', 'until', 'while', 'of', 'then',
  'once', 'than', 'so', 'therefore', 'however', 'although', 'though', 'yet',

  // Common adverbs
  'when', 'where', 'why', 'how', 'here', 'there', 'then', 'now', 'just',
  'very', 'too', 'also', 'not', 'no', 'nor', 'only', 'same', 'so', 'some',
  'still', 'such', 'both', 'each', 'few', 'more', 'most', 'other', 'any',
  'all', 'own',

  // Question words
  'who', 'what', 'where', 'when', 'why', 'how', 'which', 'whom', 'whose',

  // Other common words
  'yes', 'no', 'maybe', 'please', 'thanks', 'sorry', 'well', 'oh', 'okay',
  'ok', 'yeah', 'yep', 'nope', 'hi', 'hello', 'bye', 'goodbye',

  // Single letters (often appear in tokenization)
  'b', 'c', 'd', 'e', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'n', 'o', 'p',
  'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'
]);

// Punctuation and symbols to filter out
export const PUNCTUATION_SYMBOLS = new Set([
  '.', ',', '!', '?', ';', ':', '"', "'", '`', '-', '_', '=', '+',
  '/', '\\', '|', '@', '#', '$', '%', '^', '&', '*', '(', ')',
  '[', ']', '{', '}', '<', '>', '~', '•', '–', '—', '"', '"',
  "'", "'", '…', '°', '¿', '¡', '§', '¶', '†', '‡', '©', '®',
  '™', '№', '⁄', '€', '£', '¥', '¢', '₹', '₽', '¤'
]);

// Filter out stopwords and punctuation from text
export function removeStopwords(text: string): string[] {
  const words = text.toLowerCase()
    .split(/\s+/)
    .map(word => word.replace(/[^\w\s]/g, '')) // Remove punctuation
    .filter(word => word.length > 1) // Remove single chars
    .filter(word => !ENGLISH_STOPWORDS.has(word))
    .filter(word => !PUNCTUATION_SYMBOLS.has(word))
    .filter(word => !/^\d+$/.test(word)); // Remove pure numbers

  return words;
}

// Get meaningful keywords from a list of texts
export function extractKeywords(texts: string[], topN: number = 10): string[] {
  const wordFrequency = new Map<string, number>();

  texts.forEach(text => {
    const words = removeStopwords(text);
    words.forEach(word => {
      wordFrequency.set(word, (wordFrequency.get(word) || 0) + 1);
    });
  });

  // Sort by frequency and return top N
  return Array.from(wordFrequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word]) => word);
}

// Check if a word is a stopword
export function isStopword(word: string): boolean {
  return ENGLISH_STOPWORDS.has(word.toLowerCase()) ||
         PUNCTUATION_SYMBOLS.has(word) ||
         word.length <= 1 ||
         /^\d+$/.test(word);
}