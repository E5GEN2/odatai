// Export utilities for clustering data
export interface ClusterExportData {
  videoId: string;
  title: string;
  clusterId: number;
  clusterSize: number;
  canvasX: number;
  canvasY: number;
  distanceFromCentroid: number;
  embeddingDimensions: number;
  wordCoverage: number;
  topClusterWords: string;
  // Reduced embedding info (first few dimensions for debugging)
  embedding_dim1: number;
  embedding_dim2: number;
  embedding_dim3: number;
  embedding_dim4: number;
}

// Generate export data from clustering results
export function generateExportData(
  videos: { id: string; title: string }[],
  clusteringResults: any,
  clusterSummaries: any[],
  videoShapes: any[]
): ClusterExportData[] {
  const exportData: ClusterExportData[] = [];

  // Process each cluster
  clusteringResults.clusters.forEach((cluster: any[], clusterIndex: number) => {
    const clusterSummary = clusterSummaries[clusterIndex];
    const topWords = clusterSummary?.topWords?.join(', ') || '';

    cluster.forEach((clusterItem: any) => {
      // Find matching video and shape
      const matchingVideo = videos.find(v => v.title === clusterItem.title);
      const matchingShape = videoShapes.find(s => s.title === clusterItem.title);

      if (matchingVideo && matchingShape) {
        exportData.push({
          videoId: matchingVideo.id,
          title: clusterItem.title,
          clusterId: clusterIndex,
          clusterSize: cluster.length,
          canvasX: Math.round(matchingShape.position.x * 100) / 100, // 2 decimal places
          canvasY: Math.round(matchingShape.position.y * 100) / 100,
          distanceFromCentroid: Math.round(clusterItem.distance * 1000) / 1000, // 3 decimal places
          embeddingDimensions: clusterItem.vector?.length || 0,
          wordCoverage: 100, // Assuming Sentence Transformers (100% coverage)
          topClusterWords: topWords,
          // First 4 embedding dimensions for debugging
          embedding_dim1: Math.round((clusterItem.vector?.[0] || 0) * 1000) / 1000,
          embedding_dim2: Math.round((clusterItem.vector?.[1] || 0) * 1000) / 1000,
          embedding_dim3: Math.round((clusterItem.vector?.[2] || 0) * 1000) / 1000,
          embedding_dim4: Math.round((clusterItem.vector?.[3] || 0) * 1000) / 1000,
        });
      }
    });
  });

  // Sort by cluster ID, then by distance from centroid
  return exportData.sort((a, b) => {
    if (a.clusterId !== b.clusterId) {
      return a.clusterId - b.clusterId;
    }
    return a.distanceFromCentroid - b.distanceFromCentroid;
  });
}

// Convert data to CSV format
export function convertToCSV(data: ClusterExportData[]): string {
  if (data.length === 0) return '';

  // Headers
  const headers = [
    'Video ID',
    'Title',
    'Cluster ID',
    'Cluster Size',
    'Canvas X',
    'Canvas Y',
    'Distance from Centroid',
    'Embedding Dimensions',
    'Word Coverage (%)',
    'Top Cluster Words',
    'Embedding Dim 1',
    'Embedding Dim 2',
    'Embedding Dim 3',
    'Embedding Dim 4'
  ];

  // Escape CSV values
  const escapeCSV = (value: string | number): string => {
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  // Create CSV content
  const csvContent = [
    headers.join(','),
    ...data.map(row => [
      escapeCSV(row.videoId),
      escapeCSV(row.title),
      escapeCSV(row.clusterId),
      escapeCSV(row.clusterSize),
      escapeCSV(row.canvasX),
      escapeCSV(row.canvasY),
      escapeCSV(row.distanceFromCentroid),
      escapeCSV(row.embeddingDimensions),
      escapeCSV(row.wordCoverage),
      escapeCSV(row.topClusterWords),
      escapeCSV(row.embedding_dim1),
      escapeCSV(row.embedding_dim2),
      escapeCSV(row.embedding_dim3),
      escapeCSV(row.embedding_dim4)
    ].join(','))
  ].join('\n');

  return csvContent;
}

// Download CSV file
export function downloadCSV(data: ClusterExportData[], filename: string = 'clustering-analysis'): void {
  const csvContent = convertToCSV(data);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');

  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

// Copy to clipboard (first N lines)
export async function copyToClipboard(
  data: ClusterExportData[],
  numLines: number = 50,
  includeHeaders: boolean = true
): Promise<boolean> {
  try {
    const csvContent = convertToCSV(data);
    const lines = csvContent.split('\n');

    let contentToCopy: string[];

    if (includeHeaders) {
      // Include headers + N data lines
      contentToCopy = lines.slice(0, numLines + 1);
    } else {
      // Skip headers, take N data lines
      contentToCopy = lines.slice(1, numLines + 1);
    }

    const clipboardContent = contentToCopy.join('\n');
    await navigator.clipboard.writeText(clipboardContent);

    return true;
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    return false;
  }
}

// Generate summary statistics for export
export function generateExportSummary(data: ClusterExportData[]): {
  totalVideos: number;
  totalClusters: number;
  clusterSizes: Record<number, number>;
  avgDistanceFromCentroid: number;
  embeddingInfo: {
    dimensions: number;
    avgCoverage: number;
  };
} {
  const clusterSizes: Record<number, number> = {};
  let totalDistance = 0;
  let totalCoverage = 0;

  data.forEach(item => {
    clusterSizes[item.clusterId] = item.clusterSize;
    totalDistance += item.distanceFromCentroid;
    totalCoverage += item.wordCoverage;
  });

  return {
    totalVideos: data.length,
    totalClusters: Object.keys(clusterSizes).length,
    clusterSizes,
    avgDistanceFromCentroid: Math.round((totalDistance / data.length) * 1000) / 1000,
    embeddingInfo: {
      dimensions: data[0]?.embeddingDimensions || 0,
      avgCoverage: Math.round((totalCoverage / data.length) * 100) / 100
    }
  };
}

// Preview data for debugging (returns formatted string)
export function previewData(data: ClusterExportData[], numLines: number = 10): string {
  if (data.length === 0) return 'No data available';

  const preview = data.slice(0, numLines).map((item, index) => {
    return `${index + 1}. [Cluster ${item.clusterId}] "${item.title}"
   📍 Canvas: (${item.canvasX}, ${item.canvasY}) | Distance: ${item.distanceFromCentroid}
   🔸 Embedding: [${item.embedding_dim1}, ${item.embedding_dim2}, ${item.embedding_dim3}, ${item.embedding_dim4}...]`;
  }).join('\n\n');

  const summary = generateExportSummary(data);

  return `📊 CLUSTERING DATA PREVIEW (${numLines}/${data.length} items)
===============================================

${preview}

📈 SUMMARY:
• Total Videos: ${summary.totalVideos}
• Total Clusters: ${summary.totalClusters}
• Avg Distance from Centroid: ${summary.avgDistanceFromCentroid}
• Embedding Dimensions: ${summary.embeddingInfo.dimensions}D
• Word Coverage: ${summary.embeddingInfo.avgCoverage}%`;
}