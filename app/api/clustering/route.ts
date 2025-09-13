import { NextRequest, NextResponse } from 'next/server';
import { performClustering, generateClusterSummaries } from '../../../utils/clustering';
import { Word2VecConfig, prepareDataForClustering } from '../../../utils/word2vec';

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

    // Configure clustering settings
    const clusteringSettings = {
      k: clusteringConfig.k,
      algorithm: clusteringConfig.algorithm as 'kmeans' | 'kmeans++' | 'hierarchical',
      maxIterations: 100,
      tolerance: 1e-4
    };

    // Perform clustering
    const results = await performClustering(titles, word2vecConfig, clusteringSettings);

    // Generate summaries
    const processedTexts = prepareDataForClustering(titles, word2vecConfig);
    const summaries = generateClusterSummaries(results, processedTexts);

    console.log('Clustering completed:', {
      clusters: results.clusters.length,
      totalVideos: results.statistics.totalVideos,
      processingTime: results.statistics.processingTime
    });

    return NextResponse.json({
      success: true,
      results,
      summaries,
      processedTexts // Include processed texts for visualization
    });

  } catch (error: any) {
    console.error('Clustering API error:', error);
    return NextResponse.json(
      { error: `Clustering failed: ${error.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}