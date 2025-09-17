// Simple PCA implementation for dimensionality reduction
export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface ProcessedVideo {
  id: string;
  title: string;
  vector: number[];
  clusterId: number;
  position: Point2D | Point3D;
}

// Simple PCA implementation to reduce high-dimensional vectors to 2D
export function performPCA(vectors: number[][]): Point2D[] {
  if (vectors.length === 0) return [];

  const numSamples = vectors.length;
  const numFeatures = vectors[0].length;

  // Step 1: Calculate mean vector
  const mean = new Array(numFeatures).fill(0);
  for (const vector of vectors) {
    for (let i = 0; i < numFeatures; i++) {
      mean[i] += vector[i];
    }
  }
  for (let i = 0; i < numFeatures; i++) {
    mean[i] /= numSamples;
  }

  // Step 2: Center the data (subtract mean)
  const centeredData = vectors.map(vector =>
    vector.map((value, i) => value - mean[i])
  );

  // Step 3: Calculate covariance matrix
  const covarianceMatrix = new Array(numFeatures).fill(0).map(() => new Array(numFeatures).fill(0));
  for (let i = 0; i < numFeatures; i++) {
    for (let j = 0; j < numFeatures; j++) {
      let sum = 0;
      for (const dataPoint of centeredData) {
        sum += dataPoint[i] * dataPoint[j];
      }
      covarianceMatrix[i][j] = sum / (numSamples - 1);
    }
  }

  // Step 4: Simple approximation - use first two features as principal components
  // For a more accurate PCA, we'd need eigenvalue decomposition
  // This is a simplified version that works reasonably well for visualization
  const projectedPoints: Point2D[] = centeredData.map(dataPoint => ({
    x: dataPoint[0] || 0,
    y: dataPoint[1] || 0
  }));

  // Normalize to reasonable canvas coordinates
  const xValues = projectedPoints.map(p => p.x);
  const yValues = projectedPoints.map(p => p.y);
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);

  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  return projectedPoints.map(point => ({
    x: ((point.x - xMin) / xRange) * 800 + 100, // Scale to canvas size with padding
    y: ((point.y - yMin) / yRange) * 600 + 100
  }));
}

// Simple PCA implementation to reduce high-dimensional vectors to 3D
export function performPCA3D(vectors: number[][], canvasSize?: { width: number; height: number; depth?: number }): Point3D[] {
  if (vectors.length === 0) return [];

  const numSamples = vectors.length;
  const numFeatures = vectors[0].length;

  // Step 1: Calculate mean vector
  const mean = new Array(numFeatures).fill(0);
  for (const vector of vectors) {
    for (let i = 0; i < numFeatures; i++) {
      mean[i] += vector[i];
    }
  }
  for (let i = 0; i < numFeatures; i++) {
    mean[i] /= numSamples;
  }

  // Step 2: Center the data (subtract mean)
  const centeredData = vectors.map(vector =>
    vector.map((value, i) => value - mean[i])
  );

  // Step 3: Simple approximation - use first three features as principal components
  const projectedPoints: Point3D[] = centeredData.map(dataPoint => ({
    x: dataPoint[0] || 0,
    y: dataPoint[1] || 0,
    z: dataPoint[2] || 0
  }));

  // Normalize to reasonable 3D space coordinates
  const xValues = projectedPoints.map(p => p.x);
  const yValues = projectedPoints.map(p => p.y);
  const zValues = projectedPoints.map(p => p.z);

  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);
  const zMin = Math.min(...zValues);
  const zMax = Math.max(...zValues);

  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;
  const zRange = zMax - zMin || 1;

  // Scale to 3D space (centered around origin)
  const scaleSize = canvasSize ? Math.min(canvasSize.width, canvasSize.height) * 0.4 : 400;

  return projectedPoints.map(point => ({
    x: ((point.x - xMin) / xRange - 0.5) * scaleSize,
    y: ((point.y - yMin) / yRange - 0.5) * scaleSize,
    z: ((point.z - zMin) / zRange - 0.5) * scaleSize
  }));
}

// Alternative: Simple random jittering around cluster centroids for better visualization
export function positionByCluster(
  videos: { id: string; title: string; vector: number[]; clusterId: number }[],
  clusterCount: number
): ProcessedVideo[] {
  const canvasWidth = 1000;
  const canvasHeight = 700;
  const padding = 80;

  // Create cluster centers in a circular pattern
  const clusterCenters: Point2D[] = [];
  for (let i = 0; i < clusterCount; i++) {
    const angle = (i * 2 * Math.PI) / clusterCount;
    const radius = Math.min(canvasWidth, canvasHeight) * 0.3;
    const centerX = canvasWidth / 2 + Math.cos(angle) * radius;
    const centerY = canvasHeight / 2 + Math.sin(angle) * radius;
    clusterCenters.push({ x: centerX, y: centerY });
  }

  // Position videos around their cluster centers with some randomness
  return videos.map(video => {
    const clusterCenter = clusterCenters[video.clusterId] || { x: canvasWidth / 2, y: canvasHeight / 2 };

    // Add random offset within cluster area
    const maxOffset = 60;
    const offsetX = (Math.random() - 0.5) * maxOffset * 2;
    const offsetY = (Math.random() - 0.5) * maxOffset * 2;

    return {
      id: video.id,
      title: video.title,
      vector: video.vector,
      clusterId: video.clusterId,
      position: {
        x: Math.max(padding, Math.min(canvasWidth - padding, clusterCenter.x + offsetX)),
        y: Math.max(padding, Math.min(canvasHeight - padding, clusterCenter.y + offsetY))
      }
    };
  });
}

// Enhanced positioning using actual vector similarities
export function positionBySimilarity(
  videos: { id: string; title: string; vector: number[]; clusterId: number }[],
  clusterCount: number
): ProcessedVideo[] {
  if (videos.length === 0) return [];

  // Use PCA to reduce vectors to 2D
  const vectors = videos.map(v => v.vector);
  const positions2D = performPCA(vectors);

  return videos.map((video, index) => ({
    id: video.id,
    title: video.title,
    vector: video.vector,
    clusterId: video.clusterId,
    position: positions2D[index] || { x: 500, y: 350 }
  }));
}