// K-means clustering utilities with Word2Vec integration
import { kmeans } from 'ml-kmeans';
import {
  Word2VecConfig,
  ProcessedText,
  prepareDataForClustering,
  cosineSimilarity
} from './word2vec';

export interface ClusteringConfig {
  k: number;
  algorithm: 'kmeans' | 'kmeans++' | 'hierarchical';
  maxIterations?: number;
  tolerance?: number;
}

export interface ClusterResult {
  clusterId: number;
  title: string;
  vector: number[];
  distance: number;
}

export interface ClusteringResults {
  clusters: ClusterResult[][];
  centroids: number[][];
  silhouetteScore?: number;
  inertia: number;
  iterations: number;
  convergenceTime: number;
  statistics: {
    clusterSizes: number[];
    avgCoverage: number;
    totalVideos: number;
    processingTime: number;
  };
}

export interface ClusterSummary {
  id: number;
  size: number;
  topWords: string[];
  avgDistance: number;
  examples: string[];
}

// Main clustering function
export async function performClustering(
  videoTitles: string[],
  word2vecConfig: Word2VecConfig,
  clusteringConfig: ClusteringConfig
): Promise<ClusteringResults> {
  const startTime = Date.now();

  // Step 1: Convert titles to vectors using Word2Vec
  console.log('Converting titles to vectors...');
  const processedTexts = prepareDataForClustering(videoTitles, word2vecConfig);

  // Extract vectors for clustering
  const vectors = processedTexts.map(pt => pt.vector);

  // Step 2: Perform K-means clustering
  console.log(`Running ${clusteringConfig.algorithm} clustering...`);
  const clusteringStartTime = Date.now();

  const result = kmeans(vectors, clusteringConfig.k, {
    initialization: clusteringConfig.algorithm === 'kmeans++' ? 'kmeans++' : 'random',
    maxIterations: clusteringConfig.maxIterations || 100,
    tolerance: clusteringConfig.tolerance || 1e-4
  });

  const clusteringTime = Date.now() - clusteringStartTime;

  // Step 3: Organize results
  const clusters: ClusterResult[][] = Array.from({ length: clusteringConfig.k }, () => []);
  let totalInertia = 0;

  result.clusters.forEach((clusterId: number, index: number) => {
    const distance = calculateDistanceToCentroid(
      vectors[index],
      result.centroids[clusterId]
    );

    // Add to total inertia (within-cluster sum of squares)
    totalInertia += distance * distance;

    clusters[clusterId].push({
      clusterId,
      title: videoTitles[index],
      vector: vectors[index],
      distance
    });
  });

  // Step 4: Calculate statistics
  const avgCoverage = processedTexts.reduce((sum, pt) => sum + pt.coverage, 0) / processedTexts.length;
  const clusterSizes = clusters.map(cluster => cluster.length);
  const totalProcessingTime = Date.now() - startTime;

  // Step 5: Calculate silhouette score (optional, computationally expensive)
  // const silhouetteScore = calculateSilhouetteScore(vectors, result.clusters);

  return {
    clusters,
    centroids: result.centroids,
    inertia: totalInertia,
    iterations: result.iterations,
    convergenceTime: clusteringTime,
    statistics: {
      clusterSizes,
      avgCoverage,
      totalVideos: videoTitles.length,
      processingTime: totalProcessingTime
    }
  };
}

// Calculate distance from point to centroid
function calculateDistanceToCentroid(point: number[], centroid: number[]): number {
  let sumSquaredDiffs = 0;
  for (let i = 0; i < point.length; i++) {
    const diff = point[i] - centroid[i];
    sumSquaredDiffs += diff * diff;
  }
  return Math.sqrt(sumSquaredDiffs);
}

// Generate cluster summaries with insights
export function generateClusterSummaries(
  clusteringResults: ClusteringResults,
  processedTexts: ProcessedText[]
): ClusterSummary[] {
  return clusteringResults.clusters.map((cluster, clusterId) => {
    const clusterTexts = cluster.map((item, index) => {
      const originalIndex = clusteringResults.clusters
        .slice(0, clusterId)
        .reduce((sum, c) => sum + c.length, 0) + index;
      return processedTexts[originalIndex];
    });

    // Calculate average distance
    const avgDistance = cluster.reduce((sum, item) => sum + item.distance, 0) / cluster.length;

    // Extract most common words from this cluster
    const wordCounts: Record<string, number> = {};
    clusterTexts.forEach(text => {
      text.tokens.forEach(token => {
        wordCounts[token] = (wordCounts[token] || 0) + 1;
      });
    });

    // Get top words
    const topWords = Object.entries(wordCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([word]) => word);

    // Get example titles (shortest ones for readability)
    const examples = cluster
      .sort((a, b) => a.title.length - b.title.length)
      .slice(0, 3)
      .map(item => item.title);

    return {
      id: clusterId,
      size: cluster.length,
      topWords,
      avgDistance,
      examples
    };
  });
}

// Calculate silhouette score for cluster quality assessment
export function calculateSilhouetteScore(
  vectors: number[][],
  clusterLabels: number[]
): number {
  const n = vectors.length;
  let totalScore = 0;

  for (let i = 0; i < n; i++) {
    const currentCluster = clusterLabels[i];

    // Calculate a(i): average distance to points in same cluster
    const sameClusterDistances: number[] = [];
    for (let j = 0; j < n; j++) {
      if (i !== j && clusterLabels[j] === currentCluster) {
        sameClusterDistances.push(euclideanDistance(vectors[i], vectors[j]));
      }
    }
    const a = sameClusterDistances.length > 0
      ? sameClusterDistances.reduce((sum, d) => sum + d, 0) / sameClusterDistances.length
      : 0;

    // Calculate b(i): minimum average distance to points in other clusters
    const clusterIds = [...new Set(clusterLabels)];
    let minAvgDistance = Infinity;

    for (const clusterId of clusterIds) {
      if (clusterId === currentCluster) continue;

      const otherClusterDistances: number[] = [];
      for (let j = 0; j < n; j++) {
        if (clusterLabels[j] === clusterId) {
          otherClusterDistances.push(euclideanDistance(vectors[i], vectors[j]));
        }
      }

      if (otherClusterDistances.length > 0) {
        const avgDistance = otherClusterDistances.reduce((sum, d) => sum + d, 0) / otherClusterDistances.length;
        minAvgDistance = Math.min(minAvgDistance, avgDistance);
      }
    }

    const b = minAvgDistance === Infinity ? 0 : minAvgDistance;

    // Calculate silhouette for this point
    const silhouette = Math.max(a, b) === 0 ? 0 : (b - a) / Math.max(a, b);
    totalScore += silhouette;
  }

  return totalScore / n;
}

// Helper function for Euclidean distance
function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += Math.pow(a[i] - b[i], 2);
  }
  return Math.sqrt(sum);
}

// Find optimal number of clusters using elbow method
export function findOptimalClusters(
  vectors: number[][],
  maxK: number = 10
): { k: number; inertias: number[]; elbowScore: number } {
  const inertias: number[] = [];

  for (let k = 2; k <= maxK; k++) {
    const result = kmeans(vectors, k, {
      initialization: 'kmeans++',
      maxIterations: 50
    });

    // Calculate inertia manually
    let totalInertia = 0;
    result.clusters.forEach((clusterId: number, index: number) => {
      const distance = calculateDistanceToCentroid(vectors[index], result.centroids[clusterId]);
      totalInertia += distance * distance;
    });

    inertias.push(totalInertia);
  }

  // Simple elbow detection (could be improved)
  let bestK = 2;
  let maxImprovement = 0;

  for (let i = 1; i < inertias.length - 1; i++) {
    const improvement = inertias[i-1] - inertias[i] - (inertias[i] - inertias[i+1]);
    if (improvement > maxImprovement) {
      maxImprovement = improvement;
      bestK = i + 2;
    }
  }

  return {
    k: bestK,
    inertias,
    elbowScore: maxImprovement
  };
}