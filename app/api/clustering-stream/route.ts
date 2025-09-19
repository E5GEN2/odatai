import { NextRequest } from 'next/server';
import { performClustering, generateClusterSummaries } from '../../../utils/clustering';
import { Word2VecConfig, prepareDataForClustering } from '../../../utils/word2vec';
import { processYouTubeTitlesWithProgress } from '../../../utils/sentence-transformers';
import { kmeans } from 'ml-kmeans';
import { analyzeOptimalK } from '../../../utils/k-optimization';
import { detectLanguage } from '../../../utils/language-detection';

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const sendProgress = (stage: string, message: string, progress: number) => {
        console.log(`[PROGRESS] ${progress}% - ${stage}: ${message}`);
        const data = JSON.stringify({ stage, message, progress });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      const sendResult = (success: boolean, data: any) => {
        const result = JSON.stringify({ type: 'result', success, data });
        controller.enqueue(encoder.encode(`data: ${result}\n\n`));
        controller.close();
      };

      const sendError = (error: string) => {
        const errorData = JSON.stringify({ type: 'error', error });
        controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
        controller.close();
      };

      // Process the request
      (async () => {
        try {
          const body = await request.json();
          const { titles, word2vecConfig, clusteringConfig, huggingFaceApiKey } = body;

          console.log(`[START] Clustering request received:`);
          console.log(`[START] - Titles: ${titles?.length || 0}`);
          console.log(`[START] - Word2Vec approach: ${word2vecConfig?.approach}`);
          console.log(`[START] - Word2Vec model: ${word2vecConfig?.model}`);
          console.log(`[START] - Clustering K: ${clusteringConfig?.k}`);
          console.log(`[START] - Has API key: ${!!huggingFaceApiKey}`);

          if (!titles || !Array.isArray(titles) || titles.length === 0) {
            sendError('Invalid titles array provided');
            return;
          }

          if (titles.length < clusteringConfig.k) {
            sendError(`Need at least ${clusteringConfig.k} videos for ${clusteringConfig.k} clusters.`);
            return;
          }

          sendProgress('initialization', 'Starting clustering analysis...', 5);

          // Filter for English-only content
          sendProgress('initialization', 'Detecting languages and filtering content...', 8);

          const englishTitles: string[] = [];
          const filteredOutTitles: string[] = [];
          let languageStats = {
            english: 0,
            russian: 0,
            other: 0
          };

          titles.forEach(title => {
            const detection = detectLanguage(title);
            if (detection.isEnglish && detection.confidence > 0.5) {
              englishTitles.push(title);
              languageStats.english++;
            } else {
              filteredOutTitles.push(title);
              if (detection.detectedScript === 'cyrillic') {
                languageStats.russian++;
              } else {
                languageStats.other++;
              }
            }
          });

          sendProgress('initialization',
            `Filtered to ${englishTitles.length} English videos (removed ${filteredOutTitles.length} non-English)`,
            10
          );

          if (englishTitles.length < 2) {
            sendError(`Not enough English content to cluster. Found only ${englishTitles.length} English videos out of ${titles.length} total.`);
            return;
          }

          if (englishTitles.length < clusteringConfig.k) {
            sendError(`Need at least ${clusteringConfig.k} English videos for ${clusteringConfig.k} clusters. Found only ${englishTitles.length}.`);
            return;
          }

          let results;
          let summaries;
          let processedTexts;
          let kOptimizationAnalysis = null;

          // Use English-only titles for clustering
          const titlesToCluster = englishTitles;

          // Check if using Sentence Transformers
          console.log(`[EMBEDDING] Approach: ${word2vecConfig.approach}, Titles to cluster: ${titlesToCluster.length}`);
          if (word2vecConfig.approach === 'sentence-transformers') {
            console.log(`[EMBEDDING] Using sentence transformers with model: ${word2vecConfig.model}`);
            sendProgress('embeddings', `Loading sentence transformer model for ${titlesToCluster.length} English videos...`, 15);

            let embeddings;
            try {
              // Get embeddings with progress updates
              const embeddingResult = await processYouTubeTitlesWithProgress(titlesToCluster, {
                config: {
                  model: word2vecConfig.model,
                  apiKey: huggingFaceApiKey
                },
                onProgress: (batch: number, totalBatches: number, message: string) => {
                  const batchProgress = 20 + (batch / totalBatches) * 35; // 20% to 55%
                  sendProgress('embeddings', message, batchProgress);
                }
              });
              embeddings = embeddingResult.embeddings;

              if (!embeddings || embeddings.length === 0) {
                throw new Error('No embeddings were generated');
              }

              sendProgress('embeddings', `Successfully generated ${embeddings.length} embeddings`, 56);
            } catch (embeddingError: any) {
              console.error('Embedding generation failed:', embeddingError);
              sendError(`Failed to generate embeddings: ${embeddingError.message || 'Unknown error'}. Please check your internet connection and try again.`);
              return;
            }

            console.log(`[EMBEDDING] Got ${embeddings.length} embeddings, starting validation`);
            sendProgress('embeddings', 'Validating embedding dimensions...', 57);

            // Validate embedding dimensions
            const expectedDim = 384; // BGE model dimensions
            const actualDim = embeddings[0].length;
            if (actualDim !== expectedDim) {
              console.warn(`Warning: Expected ${expectedDim} dimensions, got ${actualDim}`);
            }

            sendProgress('embeddings', 'Checking for invalid values (NaN/Infinity)...', 58);

            // Check for invalid values
            let invalidCount = 0;
            for (let i = 0; i < Math.min(embeddings.length, 10); i++) {
              for (let j = 0; j < embeddings[i].length; j++) {
                if (!isFinite(embeddings[i][j])) {
                  invalidCount++;
                }
              }
            }

            sendProgress('embeddings', 'Computing embedding statistics and quality metrics...', 59);

            // Compute basic statistics
            const sampleSize = Math.min(embeddings.length, 100);
            let minVal = Infinity, maxVal = -Infinity, sumSq = 0;
            for (let i = 0; i < sampleSize; i++) {
              for (let j = 0; j < embeddings[i].length; j++) {
                const val = embeddings[i][j];
                minVal = Math.min(minVal, val);
                maxVal = Math.max(maxVal, val);
                sumSq += val * val;
              }
            }
            const avgMagnitude = Math.sqrt(sumSq / (sampleSize * actualDim));

            sendProgress('embeddings', `Quality check: ${actualDim}D vectors, range [${minVal.toFixed(3)}, ${maxVal.toFixed(3)}], avg magnitude ${avgMagnitude.toFixed(3)}`, 60);

            // Analyze optimal K if requested
            let finalK = clusteringConfig.k;

            if (clusteringConfig.k === -1) {
              console.log(`[K-OPT] Starting K optimization for ${embeddings.length} embeddings`);
              sendProgress('k-optimization', 'Analyzing optimal K using Elbow Method...', 62);

              const maxK = Math.max(10, Math.floor(embeddings.length * 0.1));
              kOptimizationAnalysis = analyzeOptimalK(embeddings, maxK, (k, maxK, message) => {
                // Calculate progress from 62% to 68% based on current K
                const progress = 62 + ((k - 2) / (maxK - 2)) * 6;
                sendProgress('k-optimization', message, Math.round(progress));
              });
              finalK = kOptimizationAnalysis.optimalK;

              sendProgress('k-optimization', `Optimal K determined: ${finalK} clusters (tested K=2 to K=${maxK})`, 68);
            }

            sendProgress('clustering', `Initializing K-means with ${finalK} clusters...`, 70);

            // Perform K-means directly on the embeddings
            const kmeansResult = kmeans(embeddings, finalK, {
              initialization: clusteringConfig.algorithm === 'kmeans++' ? 'kmeans++' : 'random',
              maxIterations: 100,
              tolerance: 1e-4
            });

            sendProgress('clustering', 'Computing cluster assignments...', 80);
            await new Promise(resolve => setTimeout(resolve, 200));

            sendProgress('clustering', 'Calculating cluster centroids...', 85);

            // Structure results similar to performClustering output
            const clusters: any[][] = Array.from({ length: finalK }, () => []);
            let totalInertia = 0;

            kmeansResult.clusters.forEach((clusterId: number, index: number) => {
              const distance = Math.sqrt(
                embeddings[index].reduce((sum, val, i) => {
                  const diff = val - kmeansResult.centroids[clusterId][i];
                  return sum + diff * diff;
                }, 0)
              );

              totalInertia += distance * distance;

              clusters[clusterId].push({
                clusterId,
                title: titlesToCluster[index],
                vector: embeddings[index],
                distance
              });
            });

            results = {
              clusters,
              centroids: kmeansResult.centroids,
              inertia: totalInertia,
              iterations: kmeansResult.iterations,
              convergenceTime: 0,
              statistics: {
                clusterSizes: clusters.map(c => c.length),
                avgCoverage: 100,
                totalVideos: titlesToCluster.length,
                processingTime: 0
              }
            };

            sendProgress('post-processing', 'Generating cluster summaries...', 90);

            // Create processed texts for visualization
            processedTexts = titlesToCluster.map((title, index) => ({
              original: title,
              tokens: title.split(' '),
              vector: embeddings[index],
              coverage: 100
            }));

            // Generate summaries
            summaries = generateClusterSummaries(results, processedTexts);

            sendProgress('post-processing', 'Extracting keywords and insights...', 95);
            await new Promise(resolve => setTimeout(resolve, 200));

          } else {
            // Use original Word2Vec approach with progress
            sendProgress('embeddings', 'Building vocabulary from video titles...', 25);

            const clusteringSettings = {
              k: clusteringConfig.k,
              algorithm: clusteringConfig.algorithm as 'kmeans' | 'kmeans++' | 'hierarchical',
              maxIterations: 100,
              tolerance: 1e-4
            };

            sendProgress('embeddings', 'Training Word2Vec model...', 40);

            // Perform clustering
            results = await performClustering(titles, word2vecConfig, clusteringSettings);

            sendProgress('clustering', 'Running clustering algorithm...', 75);

            // Generate summaries
            processedTexts = prepareDataForClustering(titles, word2vecConfig);
            summaries = generateClusterSummaries(results, processedTexts);

            sendProgress('post-processing', 'Finalizing results...', 90);
          }

          sendProgress('completed', `Analysis complete! Generated ${results.clusters.length} clusters.`, 100);

          // Send final results
          sendResult(true, {
            results,
            summaries,
            processedTexts,
            kOptimization: kOptimizationAnalysis
          });

        } catch (error: any) {
          console.error('Clustering stream error:', error);
          sendError(`Clustering failed: ${error.message || 'Unknown error'}`);
        }
      })();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}