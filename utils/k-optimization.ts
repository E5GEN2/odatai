// Simple manual implementation for K optimization analysis
// Using basic distance calculations without external ML libraries

export interface KOptimizationResult {
  k: number;
  score: number;
  method: 'elbow' | 'silhouette';
  confidence: 'low' | 'medium' | 'high';
}

export interface KAnalysisResult {
  optimalK: number;
  recommendations: KOptimizationResult[];
  elbowScores: { k: number; wcss: number; improvement: number }[];
  silhouetteScores: { k: number; score: number }[];
  reasoning: string;
}

// Simple euclidean distance calculation
function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

// Simple K-means implementation for analysis
function simpleKMeans(data: number[][], k: number): { clusters: number[][], centroids: number[][] } {
  const points = data.length;
  const dimensions = data[0].length;

  // Initialize centroids randomly
  const centroids: number[][] = [];
  for (let i = 0; i < k; i++) {
    const centroid: number[] = [];
    for (let j = 0; j < dimensions; j++) {
      centroid.push(Math.random());
    }
    centroids.push(centroid);
  }

  // Iterate to convergence (max 50 iterations)
  for (let iter = 0; iter < 50; iter++) {
    const clusters: number[][] = Array.from({ length: k }, () => []);

    // Assign points to nearest centroids
    for (let i = 0; i < points; i++) {
      let minDistance = Infinity;
      let closestCentroid = 0;

      for (let j = 0; j < k; j++) {
        const dist = euclideanDistance(data[i], centroids[j]);
        if (dist < minDistance) {
          minDistance = dist;
          closestCentroid = j;
        }
      }
      clusters[closestCentroid].push(i);
    }

    // Update centroids
    let changed = false;
    for (let i = 0; i < k; i++) {
      if (clusters[i].length === 0) continue;

      const newCentroid: number[] = new Array(dimensions).fill(0);
      for (const pointIndex of clusters[i]) {
        for (let j = 0; j < dimensions; j++) {
          newCentroid[j] += data[pointIndex][j];
        }
      }
      for (let j = 0; j < dimensions; j++) {
        newCentroid[j] /= clusters[i].length;
      }

      // Check if centroid changed significantly
      const distance = euclideanDistance(centroids[i], newCentroid);
      if (distance > 0.001) {
        changed = true;
      }
      centroids[i] = newCentroid;
    }

    if (!changed) break;
  }

  // Final assignment
  const finalClusters: number[][] = Array.from({ length: k }, () => []);
  for (let i = 0; i < points; i++) {
    let minDistance = Infinity;
    let closestCentroid = 0;

    for (let j = 0; j < k; j++) {
      const dist = euclideanDistance(data[i], centroids[j]);
      if (dist < minDistance) {
        minDistance = dist;
        closestCentroid = j;
      }
    }
    finalClusters[closestCentroid].push(i);
  }

  return { clusters: finalClusters, centroids };
}

// Calculate Within-Cluster Sum of Squares (WCSS) for Elbow Method
function calculateWCSS(data: number[][], clusters: number[][], centroids: number[][]): number {
  let wcss = 0;

  for (let i = 0; i < clusters.length; i++) {
    const centroid = centroids[i];
    for (const pointIndex of clusters[i]) {
      const point = data[pointIndex];
      const dist = euclideanDistance(point, centroid);
      wcss += dist * dist;
    }
  }

  return wcss;
}

// Calculate Silhouette Score
function calculateSilhouetteScore(data: number[][], clusters: number[][]): number {
  if (clusters.length < 2) return 0;

  const silhouetteScores: number[] = [];

  for (let clusterIndex = 0; clusterIndex < clusters.length; clusterIndex++) {
    const cluster = clusters[clusterIndex];

    for (const pointIndex of cluster) {
      const point = data[pointIndex];

      // Calculate a(i) - average distance to points in same cluster
      let aScore = 0;
      if (cluster.length > 1) {
        for (const otherPointIndex of cluster) {
          if (otherPointIndex !== pointIndex) {
            aScore += euclideanDistance(point, data[otherPointIndex]);
          }
        }
        aScore /= (cluster.length - 1);
      }

      // Calculate b(i) - minimum average distance to points in other clusters
      let bScore = Infinity;
      for (let otherClusterIndex = 0; otherClusterIndex < clusters.length; otherClusterIndex++) {
        if (otherClusterIndex !== clusterIndex) {
          const otherCluster = clusters[otherClusterIndex];
          let avgDistance = 0;
          for (const otherPointIndex of otherCluster) {
            avgDistance += euclideanDistance(point, data[otherPointIndex]);
          }
          avgDistance /= otherCluster.length;
          bScore = Math.min(bScore, avgDistance);
        }
      }

      // Silhouette score for this point
      const silhouette = bScore === Infinity ? 0 : (bScore - aScore) / Math.max(aScore, bScore);
      silhouetteScores.push(silhouette);
    }
  }

  return silhouetteScores.reduce((sum, score) => sum + score, 0) / silhouetteScores.length;
}

// Find optimal K using Elbow Method
export function findOptimalKElbow(data: number[][], maxK: number = 10): KOptimizationResult[] {
  const minK = 2;
  const actualMaxK = Math.min(maxK, Math.floor(data.length / 2));
  const results: { k: number; wcss: number; improvement: number }[] = [];

  for (let k = minK; k <= actualMaxK; k++) {
    try {
      const result = simpleKMeans(data, k);
      const wcss = calculateWCSS(data, result.clusters, result.centroids);

      // Calculate improvement from previous K
      let improvement = 0;
      if (results.length > 0) {
        const previousWCSS = results[results.length - 1].wcss;
        improvement = (previousWCSS - wcss) / previousWCSS;
      }

      results.push({ k, wcss, improvement });
    } catch (error) {
      console.warn(`Failed to calculate WCSS for k=${k}:`, error);
    }
  }

  // Find elbow point (point where improvement starts to diminish significantly)
  const recommendations: KOptimizationResult[] = [];

  for (let i = 1; i < results.length - 1; i++) {
    const current = results[i];
    const next = results[i + 1];

    // If improvement drops significantly, this might be the elbow
    if (current.improvement > 0.05 && next.improvement < current.improvement * 0.5) {
      recommendations.push({
        k: current.k,
        score: current.improvement,
        method: 'elbow',
        confidence: current.improvement > 0.1 ? 'high' : current.improvement > 0.05 ? 'medium' : 'low'
      });
    }
  }

  return recommendations;
}

// Find optimal K using Silhouette Analysis
export function findOptimalKSilhouette(data: number[][], maxK: number = 10): KOptimizationResult[] {
  const minK = 2;
  const actualMaxK = Math.min(maxK, Math.floor(data.length / 2));
  const results: { k: number; score: number }[] = [];

  for (let k = minK; k <= actualMaxK; k++) {
    try {
      const result = simpleKMeans(data, k);
      const silhouetteScore = calculateSilhouetteScore(data, result.clusters);
      results.push({ k, score: silhouetteScore });
    } catch (error) {
      console.warn(`Failed to calculate Silhouette score for k=${k}:`, error);
    }
  }

  // Find K values with highest silhouette scores
  const sortedResults = results.sort((a, b) => b.score - a.score);
  const bestScore = sortedResults[0]?.score || 0;

  const recommendations: KOptimizationResult[] = [];

  for (const result of sortedResults.slice(0, 3)) { // Top 3 candidates
    const confidence = result.score > 0.5 ? 'high' : result.score > 0.3 ? 'medium' : 'low';
    recommendations.push({
      k: result.k,
      score: result.score,
      method: 'silhouette',
      confidence
    });
  }

  return recommendations;
}

// Comprehensive K analysis combining both methods
export function analyzeOptimalK(data: number[][], maxK: number = 30): KAnalysisResult {
  if (data.length < 4) {
    return {
      optimalK: 2,
      recommendations: [],
      elbowScores: [],
      silhouetteScores: [],
      reasoning: 'Insufficient data points for meaningful clustering analysis. Using default k=2.'
    };
  }

  const elbowResults = findOptimalKElbow(data, maxK);
  const silhouetteResults = findOptimalKSilhouette(data, maxK);

  // Get detailed scores for visualization
  const elbowScores: { k: number; wcss: number; improvement: number }[] = [];
  const silhouetteScores: { k: number; score: number }[] = [];

  const minK = 2;
  const actualMaxK = Math.min(maxK, Math.floor(data.length / 2));

  for (let k = minK; k <= actualMaxK; k++) {
    try {
      const result = simpleKMeans(data, k);
      const wcss = calculateWCSS(data, result.clusters, result.centroids);
      const silhouette = calculateSilhouetteScore(data, result.clusters);

      let improvement = 0;
      if (elbowScores.length > 0) {
        const previousWCSS = elbowScores[elbowScores.length - 1].wcss;
        improvement = (previousWCSS - wcss) / previousWCSS;
      }

      elbowScores.push({ k, wcss, improvement });
      silhouetteScores.push({ k, score: silhouette });
    } catch (error) {
      console.warn(`Failed to analyze k=${k}:`, error);
    }
  }

  // Combine recommendations and find consensus
  const allRecommendations = [...elbowResults, ...silhouetteResults];
  const kCounts = new Map<number, { count: number; totalScore: number; methods: string[] }>();

  for (const rec of allRecommendations) {
    const existing = kCounts.get(rec.k) || { count: 0, totalScore: 0, methods: [] };
    existing.count++;
    existing.totalScore += rec.score;
    existing.methods.push(rec.method);
    kCounts.set(rec.k, existing);
  }

  // Find K with highest consensus
  let optimalK = 3; // default fallback
  let bestConsensus = 0;

  for (const [k, data] of kCounts.entries()) {
    const consensus = data.count + (data.totalScore / data.count);
    if (consensus > bestConsensus) {
      bestConsensus = consensus;
      optimalK = k;
    }
  }

  // If no strong consensus, use silhouette winner
  if (bestConsensus === 0 && silhouetteResults.length > 0) {
    optimalK = silhouetteResults[0].k;
  }

  // Generate reasoning
  let reasoning = `Analyzed K values from 2 to ${actualMaxK} using Elbow Method and Silhouette Analysis. `;

  if (allRecommendations.length === 0) {
    reasoning += `No clear optimal K found. Recommending k=${optimalK} as a balanced choice.`;
  } else {
    const bestMethod = kCounts.get(optimalK)?.methods[0] || 'analysis';
    reasoning += `Optimal K=${optimalK} identified through ${bestMethod} method. `;

    if ((kCounts.get(optimalK)?.count || 0) > 1) {
      reasoning += `This value showed strong consensus across multiple methods.`;
    }
  }

  return {
    optimalK,
    recommendations: allRecommendations,
    elbowScores,
    silhouetteScores,
    reasoning
  };
}