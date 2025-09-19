import { NextRequest, NextResponse } from 'next/server';
import { performClustering, generateClusterSummaries } from '../../../utils/clustering';
import { Word2VecConfig, prepareDataForClustering } from '../../../utils/word2vec';
import { processYouTubeTitles } from '../../../utils/sentence-transformers';
import { kmeans } from 'ml-kmeans';
import { analyzeOptimalK } from '../../../utils/k-optimization';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { titles, word2vecConfig, clusteringConfig } = body;

    if (!titles || !Array.isArray(titles) || titles.length === 0) {
      return NextResponse.json(
        { error: 'Invalid titles array provided' },
        { status: 400 }
      );
    }

    if (titles.length < clusteringConfig.k) {
      return NextResponse.json(
        { error: `Need at least ${clusteringConfig.k} videos for ${clusteringConfig.k} clusters.` },
        { status: 400 }
      );
    }

    console.log('Starting clustering with config:', { word2vecConfig, clusteringConfig });

    let results;
    let summaries;
    let processedTexts;
    let kOptimizationAnalysis = null;

    // Check if using Sentence Transformers
    if (word2vecConfig.approach === 'sentence-transformers') {
      console.log('Using Sentence Transformers for embeddings...');

      // Get embeddings from Sentence Transformers
      const { embeddings } = await processYouTubeTitles(titles);

      // Analyze optimal K if requested (when k is auto or -1)
      let finalK = clusteringConfig.k;

      if (clusteringConfig.k === -1 || clusteringConfig.k === 'auto') {
        console.log('Analyzing optimal K value...');
        kOptimizationAnalysis = analyzeOptimalK(embeddings, Math.min(10, Math.floor(embeddings.length / 3)));
        finalK = kOptimizationAnalysis.optimalK;
        console.log(`Optimal K analysis complete. Recommended K: ${finalK}`);
      }

      // Perform K-means directly on the embeddings
      const kmeansResult = kmeans(embeddings, finalK, {
        initialization: clusteringConfig.algorithm === 'kmeans++' ? 'kmeans++' : 'random',
        maxIterations: 100,
        tolerance: 1e-4
      });

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
          title: titles[index],
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
          avgCoverage: 100, // Sentence transformers always have full coverage
          totalVideos: titles.length,
          processingTime: 0
        }
      };

      // Create processed texts for visualization
      processedTexts = titles.map((title, index) => ({
        original: title,
        tokens: title.split(' '),
        vector: embeddings[index],
        coverage: 100
      }));

      // Generate summaries
      summaries = generateClusterSummaries(results, processedTexts);

    } else {
      // Use original Word2Vec approach
      const clusteringSettings = {
        k: clusteringConfig.k,
        algorithm: clusteringConfig.algorithm as 'kmeans' | 'kmeans++' | 'hierarchical',
        maxIterations: 100,
        tolerance: 1e-4
      };

      // Perform clustering
      results = await performClustering(titles, word2vecConfig, clusteringSettings);

      // Generate summaries
      processedTexts = prepareDataForClustering(titles, word2vecConfig);
      summaries = generateClusterSummaries(results, processedTexts);
    }

    console.log('Clustering completed:', {
      clusters: results.clusters.length,
      totalVideos: results.statistics.totalVideos,
      processingTime: results.statistics.processingTime
    });

    return NextResponse.json({
      success: true,
      results,
      summaries,
      processedTexts, // Include processed texts for visualization
      kOptimization: kOptimizationAnalysis // Include K optimization analysis if performed
    });

  } catch (error: any) {
    console.error('Clustering API error:', error);
    return NextResponse.json(
      { error: `Clustering failed: ${error.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}