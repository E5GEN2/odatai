'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { ProcessedVideo, performPCA } from '../utils/dimensionality-reduction';
import ExportControls from './ExportControls';

interface FullscreenCanvasProps {
  videos: { id: string; title: string }[];
  clusteringResults: any;
  clusterSummaries: any[];
  isOpen: boolean;
  onClose: () => void;
}

interface VideoShape extends ProcessedVideo {
  isDragging: boolean;
  radius: number;
  color: string;
}

const CLUSTER_COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
];

export default function FullscreenCanvas({
  videos,
  clusteringResults,
  clusterSummaries,
  isOpen,
  onClose
}: FullscreenCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [videoShapes, setVideoShapes] = useState<VideoShape[]>([]);
  const [hoveredVideo, setHoveredVideo] = useState<VideoShape | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [draggedVideo, setDraggedVideo] = useState<VideoShape | null>(null);
  const [isCanvasDragging, setIsCanvasDragging] = useState(false);
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [canvasSize, setCanvasSize] = useState({ width: 1920, height: 1080 });

  // Update canvas size based on window size
  useEffect(() => {
    const updateCanvasSize = () => {
      setCanvasSize({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    if (isOpen) {
      updateCanvasSize();
      window.addEventListener('resize', updateCanvasSize);

      // Prevent body scroll when fullscreen is open
      document.body.style.overflow = 'hidden';

      return () => {
        window.removeEventListener('resize', updateCanvasSize);
        document.body.style.overflow = 'unset';
      };
    } else {
      document.body.style.overflow = 'unset';
    }
  }, [isOpen]);

  // Initialize video shapes
  useEffect(() => {
    if (!clusteringResults || !videos.length || !isOpen) return;

    const shapes: VideoShape[] = [];

    clusteringResults.clusters.forEach((cluster: any[], clusterIndex: number) => {
      cluster.forEach((clusterItem: any) => {
        const matchingVideo = videos.find(v => v.title === clusterItem.title);
        if (matchingVideo) {
          shapes.push({
            id: matchingVideo.id,
            title: clusterItem.title,
            vector: clusterItem.vector || new Array(8).fill(0),
            clusterId: clusterIndex,
            position: { x: 0, y: 0 },
            isDragging: false,
            radius: 8,
            color: CLUSTER_COLORS[clusterIndex % CLUSTER_COLORS.length]
          });
        }
      });
    });

    // Position videos using PCA with fullscreen dimensions
    if (shapes.length > 0) {
      const vectors = shapes.map(s => s.vector);
      const positions2D = performPCAForFullscreen(vectors, canvasSize);

      shapes.forEach((shape, index) => {
        shape.position = positions2D[index] || { x: canvasSize.width / 2, y: canvasSize.height / 2 };
      });
    }

    setVideoShapes(shapes);

    // Reset view when opening
    setCanvasOffset({ x: 0, y: 0 });
    setZoom(1);
  }, [clusteringResults, videos, isOpen, canvasSize]);

  // PCA adapted for fullscreen dimensions
  const performPCAForFullscreen = (vectors: number[][], size: { width: number; height: number }) => {
    if (vectors.length === 0) return [];

    const numSamples = vectors.length;
    const numFeatures = vectors[0].length;

    // Calculate mean
    const mean = new Array(numFeatures).fill(0);
    for (const vector of vectors) {
      for (let i = 0; i < numFeatures; i++) {
        mean[i] += vector[i];
      }
    }
    for (let i = 0; i < numFeatures; i++) {
      mean[i] /= numSamples;
    }

    // Center data
    const centeredData = vectors.map(vector =>
      vector.map((value, i) => value - mean[i])
    );

    // Project to 2D (simplified PCA)
    const projectedPoints = centeredData.map(dataPoint => ({
      x: dataPoint[0] || 0,
      y: dataPoint[1] || 0
    }));

    // Normalize to fullscreen coordinates
    const xValues = projectedPoints.map(p => p.x);
    const yValues = projectedPoints.map(p => p.y);
    const xMin = Math.min(...xValues);
    const xMax = Math.max(...xValues);
    const yMin = Math.min(...yValues);
    const yMax = Math.max(...yValues);

    const xRange = xMax - xMin || 1;
    const yRange = yMax - yMin || 1;
    const padding = 100;

    return projectedPoints.map(point => ({
      x: ((point.x - xMin) / xRange) * (size.width - 2 * padding) + padding,
      y: ((point.y - yMin) / yRange) * (size.height - 2 * padding) + padding
    }));
  };

  // Drawing function
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Save transformation state
    ctx.save();

    // Apply canvas transformations
    ctx.translate(canvasOffset.x, canvasOffset.y);
    ctx.scale(zoom, zoom);

    // Draw subtle cluster backgrounds
    if (clusterSummaries.length > 0 && videoShapes.length > 0) {
      clusterSummaries.forEach((cluster, index) => {
        const clusterVideos = videoShapes.filter(v => v.clusterId === index);
        if (clusterVideos.length === 0) return;

        const xCoords = clusterVideos.map(v => v.position.x);
        const yCoords = clusterVideos.map(v => v.position.y);
        const minX = Math.min(...xCoords) - 60;
        const maxX = Math.max(...xCoords) + 60;
        const minY = Math.min(...yCoords) - 60;
        const maxY = Math.max(...yCoords) + 60;

        ctx.fillStyle = CLUSTER_COLORS[index % CLUSTER_COLORS.length] + '08';
        ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
      });
    }

    // Draw video shapes
    videoShapes.forEach(video => {
      ctx.beginPath();
      ctx.arc(video.position.x, video.position.y, video.radius, 0, 2 * Math.PI);

      ctx.fillStyle = video.color;
      ctx.fill();

      ctx.strokeStyle = video.isDragging ? '#FFFFFF' : video.color;
      ctx.lineWidth = video.isDragging ? 3 : 2;
      ctx.stroke();

      // Highlight if hovered
      if (hoveredVideo?.id === video.id) {
        ctx.beginPath();
        ctx.arc(video.position.x, video.position.y, video.radius + 5, 0, 2 * Math.PI);
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    });

    ctx.restore();
  }, [videoShapes, hoveredVideo, clusterSummaries, canvasOffset, zoom]);

  // Redraw when needed
  useEffect(() => {
    draw();
  }, [draw]);

  // Coordinate transformation
  const screenToCanvas = (screenX: number, screenY: number) => ({
    x: (screenX - canvasOffset.x) / zoom,
    y: (screenY - canvasOffset.y) / zoom
  });

  // Mouse handlers
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const canvasCoords = screenToCanvas(screenX, screenY);

    setMousePos({ x: e.clientX, y: e.clientY });

    // Handle canvas panning
    if (isCanvasDragging && !draggedVideo) {
      const deltaX = screenX - lastPanPoint.x;
      const deltaY = screenY - lastPanPoint.y;
      setCanvasOffset(prev => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY
      }));
      setLastPanPoint({ x: screenX, y: screenY });
      return;
    }

    // Handle video dragging
    if (isDragging && draggedVideo) {
      setVideoShapes(shapes =>
        shapes.map(shape =>
          shape.id === draggedVideo.id
            ? { ...shape, position: { x: canvasCoords.x, y: canvasCoords.y } }
            : shape
        )
      );
      return;
    }

    // Check for hover
    const hoveredShape = videoShapes.find(shape => {
      const distance = Math.sqrt(
        Math.pow(canvasCoords.x - shape.position.x, 2) + Math.pow(canvasCoords.y - shape.position.y, 2)
      );
      return distance <= shape.radius + 8;
    });

    setHoveredVideo(hoveredShape || null);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    if (hoveredVideo) {
      setIsDragging(true);
      setDraggedVideo(hoveredVideo);
      setVideoShapes(shapes =>
        shapes.map(shape =>
          shape.id === hoveredVideo.id
            ? { ...shape, isDragging: true }
            : shape
        )
      );
    } else {
      setIsCanvasDragging(true);
      setLastPanPoint({ x: screenX, y: screenY });
    }
  };

  const handleMouseUp = () => {
    if (draggedVideo) {
      setVideoShapes(shapes =>
        shapes.map(shape =>
          shape.id === draggedVideo.id
            ? { ...shape, isDragging: false }
            : shape
        )
      );
    }

    setIsDragging(false);
    setDraggedVideo(null);
    setIsCanvasDragging(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prevZoom => Math.max(0.3, Math.min(5, prevZoom * zoomFactor)));
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'r') {
        setZoom(1);
        setCanvasOffset({ x: 0, y: 0 });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* Top Controls Bar */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-black/80 backdrop-blur-sm border-b border-gray-800 p-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <h3 className="text-xl font-semibold text-white flex items-center gap-2">
              <span>🎨</span>
              Fullscreen Cluster Visualization
            </h3>
            <div className="text-sm text-gray-400">
              {videoShapes.length} videos • {clusterSummaries.length} clusters
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setZoom(1)}
                className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded border border-gray-600 transition-colors"
              >
                Reset Zoom
              </button>
              <button
                onClick={() => setCanvasOffset({ x: 0, y: 0 })}
                className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded border border-gray-600 transition-colors"
              >
                Center
              </button>
              <span className="text-sm text-gray-400">
                {Math.round(zoom * 100)}%
              </span>
            </div>

            <button
              onClick={onClose}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded border border-red-500 transition-colors flex items-center gap-2"
            >
              ✕ Exit Fullscreen
            </button>
          </div>
        </div>
      </div>

      {/* Main Canvas */}
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        className={`absolute inset-0 ${
          hoveredVideo
            ? 'cursor-pointer'
            : isCanvasDragging
              ? 'cursor-grabbing'
              : 'cursor-grab'
        }`}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{ marginTop: '72px' }} // Account for top bar
      />

      {/* Tooltip */}
      {hoveredVideo && (
        <div
          className="fixed z-20 bg-black/90 text-white px-4 py-3 rounded-lg border border-gray-600 max-w-md pointer-events-none shadow-lg"
          style={{
            left: mousePos.x + 15,
            top: mousePos.y - 10,
            transform: 'translateY(-100%)'
          }}
        >
          <div className="font-medium text-sm">{hoveredVideo.title}</div>
          <div className="text-xs text-gray-400 mt-1">
            Cluster {hoveredVideo.clusterId + 1} • {hoveredVideo.color}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-black/80 backdrop-blur-sm border border-gray-800 rounded-lg p-4">
        <h4 className="text-white font-medium mb-2">Clusters</h4>
        <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
          {clusterSummaries.map((cluster, index) => (
            <div key={index} className="flex items-center gap-2 text-xs">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: CLUSTER_COLORS[index % CLUSTER_COLORS.length] }}
              />
              <span className="text-gray-300">
                {cluster.size} videos
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Export Controls */}
      <ExportControls
        videos={videos}
        clusteringResults={clusteringResults}
        clusterSummaries={clusterSummaries}
        videoShapes={videoShapes}
        isFullscreen={true}
      />

      {/* Help */}
      <div className="absolute bottom-4 right-4 bg-black/80 backdrop-blur-sm border border-gray-800 rounded-lg p-4">
        <h4 className="text-white font-medium mb-2">Controls</h4>
        <div className="text-xs text-gray-400 space-y-1">
          <div>• Drag empty space to pan</div>
          <div>• Scroll to zoom</div>
          <div>• Drag circles to move videos</div>
          <div>• Press ESC or R to reset</div>
        </div>
      </div>
    </div>
  );
}