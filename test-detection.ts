// Test language detection with sample titles
import { detectLanguage } from './utils/language-detection';

const sampleTitles = [
  "Is pulling out an effective way to prevent pregnancy? Is precum safe?!",
  "The Best Bossa Nova Cover 2025 🍒🎧Relax & Unwind Jazz in Summer Mood",
  "3,890,000 THB ($113,000) Brand New Apartment in Chiang Mai, Thailand",
  "iPhone 15 Pro Max Review 2024",
  "КАРАКАС - самый 'опасный' город мира/ВЕНЕСУЭЛА",
  "Tutorial: How to Build a Website",
  "Minecraft Gameplay Episode 1",
  "Best Gaming PC Build 2024",
  "TikTok Compilation #shorts",
  "React Tutorial for Beginners",
  "🔥 AMAZING Moments in Football",
  "Vlog Day 1 - Thailand Trip",
  "ASMR Sleep Sounds 10 Hours",
  "Unboxing PlayStation 5",
  "Fortnite Battle Royale Win",
  "YouTube Shorts Compilation",
  "How To Make Money Online",
  "Top 10 Movies 2024",
  "Music Video - Official",
  "Live Stream Gaming"
];

console.log('Testing language detection:\n');
sampleTitles.forEach(title => {
  const result = detectLanguage(title);
  const status = result.isEnglish && result.confidence > 0.5 ? '✅' : '❌';
  console.log(`${status} "${title}"`);
  console.log(`   English: ${result.isEnglish}, Confidence: ${result.confidence.toFixed(2)}, Script: ${result.detectedScript}`);
  console.log('');
});

// Count results
const results = sampleTitles.map(title => {
  const result = detectLanguage(title);
  return result.isEnglish && result.confidence > 0.5;
});
const passed = results.filter(r => r).length;
console.log(`\nSummary: ${passed}/${sampleTitles.length} titles passed as English`);
console.log(`Failed: ${sampleTitles.length - passed} titles`);