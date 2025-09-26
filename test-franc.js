// Test fastText detection
const fastText = require('fasttext');

console.log('FastText object:', Object.keys(fastText));

const testTitles = [
  'Red Alert 3 Intro (Russian)',
  'Привет мир, это тест на русском языке',
  'Hello world, this is a test in English',
  'Hola mundo, esto es una prueba en español',
  'Bonjour le monde, ceci est un test en français',
  'こんにちは世界、これは日本語のテストです',
  'How to start a YouTube channel in 2024',
  'Minecraft but every time I die the video gets faster',
  'Top 10 programming languages to learn'
];

async function testFastText() {
  console.log('Testing fastText detection:\n');

  try {
    console.log('Creating FastText classifier...');

    const classifier = new fastText.Classifier();

    // Try to load language detection model
    console.log('Loading language identification model...');
    await classifier.loadModel('lid.176.bin');

    for (const title of testTitles) {
      console.log(`Title: "${title}"`);

      try {
        const predictions = await classifier.predict(title, 1);

        if (predictions && predictions.length > 0) {
          const prediction = predictions[0];
          const language = prediction.label.replace('__label__', '');
          console.log(`Detected: ${language} (confidence: ${prediction.value})`);
        } else {
          console.log('No prediction');
        }
      } catch (err) {
        console.log('Detection failed:', err.message);
      }

      console.log('---');
    }
  } catch (error) {
    console.error('FastText error:', error.message);
    console.log('This probably means the model file needs to be downloaded first.');
    console.log('You can download it from: https://dl.fbaipublicfiles.com/fasttext/supervised-models/lid.176.bin');
  }
}

testFastText();