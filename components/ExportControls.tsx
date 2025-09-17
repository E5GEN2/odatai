'use client';

import React, { useState, useMemo } from 'react';
import {
  generateExportData,
  downloadCSV,
  copyToClipboard,
  previewData,
  generateExportSummary,
  ClusterExportData
} from '../utils/export-clustering';

interface ExportControlsProps {
  videos: { id: string; title: string }[];
  clusteringResults: any;
  clusterSummaries: any[];
  videoShapes: any[];
  isFullscreen?: boolean;
}

export default function ExportControls({
  videos,
  clusteringResults,
  clusterSummaries,
  videoShapes,
  isFullscreen = false
}: ExportControlsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copyLines, setCopyLines] = useState(50);
  const [showPreview, setShowPreview] = useState(false);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);

  // Generate export data
  const exportData: ClusterExportData[] = useMemo(() => {
    if (!clusteringResults || !videos.length || !videoShapes.length) return [];

    return generateExportData(videos, clusteringResults, clusterSummaries, videoShapes);
  }, [videos, clusteringResults, clusterSummaries, videoShapes]);

  const summary = useMemo(() => {
    return exportData.length > 0 ? generateExportSummary(exportData) : null;
  }, [exportData]);

  const handleDownloadCSV = () => {
    if (exportData.length === 0) return;

    const filename = `clustering-analysis-${summary?.totalVideos}videos-${summary?.totalClusters}clusters`;
    downloadCSV(exportData, filename);
  };

  const handleCopyToClipboard = async (numLines: number) => {
    if (exportData.length === 0) return;

    const success = await copyToClipboard(exportData, numLines, true);

    if (success) {
      setCopySuccess(`✅ Copied ${Math.min(numLines, exportData.length)} rows + headers`);
      setTimeout(() => setCopySuccess(null), 3000);
    } else {
      setCopySuccess('❌ Failed to copy');
      setTimeout(() => setCopySuccess(null), 3000);
    }
  };

  if (exportData.length === 0) {
    return null;
  }

  return (
    <div className={`${isFullscreen ? 'absolute top-20 right-4 z-10' : ''}`}>
      <div className={`bg-black/80 backdrop-blur-sm border border-gray-800 rounded-lg ${isFullscreen ? 'w-80' : 'w-full'}`}>
        {/* Header */}
        <div className="p-3 border-b border-gray-700">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center justify-between w-full text-white hover:text-gray-300 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">📊</span>
              <span className="font-medium">Export Data</span>
              {summary && (
                <span className="text-xs text-gray-400">
                  ({summary.totalVideos} videos, {summary.totalClusters} clusters)
                </span>
              )}
            </div>
            <span className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </button>
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="p-4 space-y-4">
            {/* Quick Actions */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-300">Quick Actions</h4>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleDownloadCSV}
                  className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-xs rounded transition-colors flex items-center gap-1"
                >
                  <span>💾</span>
                  Download CSV
                </button>

                <button
                  onClick={() => handleCopyToClipboard(copyLines)}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors flex items-center gap-1"
                >
                  <span>📋</span>
                  Copy {copyLines} rows
                </button>
              </div>

              {/* Copy Success Message */}
              {copySuccess && (
                <div className="text-xs text-center p-2 bg-gray-800 rounded">
                  {copySuccess}
                </div>
              )}
            </div>

            {/* Copy Lines Control */}
            <div className="space-y-2">
              <label className="text-xs text-gray-400">Copy N lines to clipboard:</label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="10"
                  max={Math.min(exportData.length, 500)}
                  step="10"
                  value={copyLines}
                  onChange={(e) => setCopyLines(parseInt(e.target.value))}
                  className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-xs text-gray-300 min-w-[3rem]">{copyLines}</span>
              </div>

              <div className="flex gap-1">
                {[25, 50, 100, 200].map(num => (
                  <button
                    key={num}
                    onClick={() => {
                      setCopyLines(Math.min(num, exportData.length));
                      handleCopyToClipboard(Math.min(num, exportData.length));
                    }}
                    className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                    disabled={num > exportData.length}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            {/* Data Preview */}
            <div className="space-y-2">
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="text-xs text-gray-400 hover:text-gray-300 transition-colors flex items-center gap-1"
              >
                <span>{showPreview ? '👁️' : '👁️‍🗨️'}</span>
                {showPreview ? 'Hide' : 'Show'} Preview
              </button>

              {showPreview && (
                <div className="text-xs bg-gray-900 p-3 rounded border border-gray-700 max-h-60 overflow-y-auto">
                  <pre className="whitespace-pre-wrap text-gray-300 font-mono">
                    {previewData(exportData, 5)}
                  </pre>
                </div>
              )}
            </div>

            {/* Data Structure Info */}
            <div className="text-xs text-gray-500 border-t border-gray-700 pt-3">
              <div className="space-y-1">
                <div><strong>CSV includes:</strong></div>
                <div>• Video ID & Title</div>
                <div>• Cluster ID & Size</div>
                <div>• Canvas Coordinates (X, Y)</div>
                <div>• Distance from Centroid</div>
                <div>• Embedding Dimensions & First 4 Values</div>
                <div>• Word Coverage & Top Cluster Keywords</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}