'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { ProcessedVideo, positionBySimilarity, performPCA } from '../utils/dimensionality-reduction';
import FullscreenCanvas from './FullscreenCanvas';
import ExportControls from './ExportControls';

interface ClusteringCanvasProps {
  videos: { id: string; title: string }[];
  clusteringResults: any;
  clusterSummaries: any[];
}

interface VideoShape extends ProcessedVideo {
  isDragging: boolean;
  radius: number;
  color: string;
}

const CLUSTER_COLORS = [
  '#3B82F6', // blue
  '#EF4444', // red
  '#10B981', // green
  '#F59E0B', // yellow
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#84CC16', // lime
  '#F97316', // orange
  '#6366F1', // indigo
];

export default function ClusteringCanvas({ videos, clusteringResults, clusterSummaries }: ClusteringCanvasProps) {
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
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);

  // Initialize video shapes with positions based on embeddings
  useEffect(() => {
    if (!clusteringResults || !videos.length) return;

    console.log('Initializing video shapes...', { videosCount: videos.length, clustersCount: clusteringResults.clusters.length });

    // Create one shape for each video
    const shapes: VideoShape[] = [];

    // Process each cluster to get individual videos
    clusteringResults.clusters.forEach((cluster: any[], clusterIndex: number) => {
      cluster.forEach((clusterItem: any) => {
        // Find the corresponding video from the videos array
        const matchingVideo = videos.find(v => v.title === clusterItem.title);
        if (matchingVideo) {
          shapes.push({
            id: matchingVideo.id,
            title: clusterItem.title,
            vector: clusterItem.vector || new Array(8).fill(0),
            clusterId: clusterIndex,
            position: { x: 0, y: 0 }, // Will be set below
            isDragging: false,
            radius: 6,
            color: CLUSTER_COLORS[clusterIndex % CLUSTER_COLORS.length]
          });
        }
      });
    });

    // Position videos based on their vector similarities using PCA
    if (shapes.length > 0) {
      const vectors = shapes.map(s => s.vector);
      const positions2D = performPCA(vectors);

      shapes.forEach((shape, index) => {
        shape.position = positions2D[index] || { x: 500, y: 350 };
      });
    }

    console.log('Created video shapes:', shapes.length);
    setVideoShapes(shapes);
  }, [clusteringResults, videos]);

  // Draw the canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Save the current transformation state
    ctx.save();

    // Apply canvas transformations (pan and zoom)
    ctx.translate(canvasOffset.x, canvasOffset.y);
    ctx.scale(zoom, zoom);

    // Draw cluster background areas (optional, can make it lighter)
    if (clusterSummaries.length > 0 && videoShapes.length > 0) {
      clusterSummaries.forEach((cluster, index) => {
        const clusterVideos = videoShapes.filter(v => v.clusterId === index);
        if (clusterVideos.length === 0) return;

        // Calculate cluster bounds
        const xCoords = clusterVideos.map(v => v.position.x);
        const yCoords = clusterVideos.map(v => v.position.y);
        const minX = Math.min(...xCoords) - 50;
        const maxX = Math.max(...xCoords) + 50;
        const minY = Math.min(...yCoords) - 50;
        const maxY = Math.max(...yCoords) + 50;

        // Draw very subtle cluster background
        ctx.fillStyle = CLUSTER_COLORS[index % CLUSTER_COLORS.length] + '08';
        ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
      });
    }

    // Draw individual video shapes (one per video)
    videoShapes.forEach(video => {
      // Draw main circle
      ctx.beginPath();
      ctx.arc(video.position.x, video.position.y, video.radius, 0, 2 * Math.PI);

      // Fill
      ctx.fillStyle = video.color;
      ctx.fill();

      // Border
      ctx.strokeStyle = video.isDragging ? '#FFFFFF' : video.color;
      ctx.lineWidth = video.isDragging ? 2 : 1;
      ctx.stroke();

      // Highlight if hovered
      if (hoveredVideo?.id === video.id) {
        ctx.beginPath();
        ctx.arc(video.position.x, video.position.y, video.radius + 3, 0, 2 * Math.PI);
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });

    // Restore the transformation state
    ctx.restore();
  }, [videoShapes, hoveredVideo, clusterSummaries, canvasOffset, zoom]);

  // Redraw when shapes change
  useEffect(() => {
    draw();
  }, [draw]);

  // Helper function to convert screen coordinates to canvas coordinates
  const screenToCanvas = (screenX: number, screenY: number) => {
    return {
      x: (screenX - canvasOffset.x) / zoom,
      y: (screenY - canvasOffset.y) / zoom
    };
  };

  // Mouse event handlers
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
      return distance <= shape.radius + 4;
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
      // Start dragging a video
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
      // Start panning the canvas
      setIsCanvasDragging(true);
      setLastPanPoint({ x: screenX, y: screenY });
    }
  };

  const handleMouseUp = () => {
    // End video dragging
    if (draggedVideo) {
      setVideoShapes(shapes =>
        shapes.map(shape =>
          shape.id === draggedVideo.id
            ? { ...shape, isDragging: false }
            : shape
        )
      );
    }

    // End canvas panning
    setIsDragging(false);
    setDraggedVideo(null);
    setIsCanvasDragging(false);
  };

  const handleMouseLeave = () => {
    setHoveredVideo(null);
    handleMouseUp();
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prevZoom => Math.max(0.5, Math.min(3, prevZoom * zoomFactor)));
  };

  if (!clusteringResults) {
    return (
      <div className="backdrop-blur-xl bg-black/30 rounded-2xl border border-gray-800 p-8 text-center">
        <div className="text-gray-500">
          <span className="text-4xl mb-4 block">🎨</span>
          <p className="text-lg">Interactive clustering visualization will appear here</p>
          <p className="text-sm mt-2">Run clustering analysis to see videos positioned by semantic similarity</p>
        </div>
      </div>
    );
  }

  return (
    <div className="backdrop-blur-xl bg-black/30 rounded-2xl border border-gray-800 p-6">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl">🎨</span>
        <h4 className="text-lg font-semibold text-white">Interactive Cluster Visualization</h4>
      </div>

      <div className="flex justify-between items-center mb-4">
        <p className="text-gray-400 text-sm">
          Videos positioned by semantic similarity. Hover to see titles, drag shapes to reposition, click+drag canvas to pan, scroll to zoom.
        </p>

        <button
          onClick={() => setIsFullscreenOpen(true)}
          className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all duration-300 font-medium text-sm flex items-center gap-2"
        >
          <span>⛶</span>
          Enter Fullscreen
        </button>
      </div>

      <div className="relative bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
        <canvas
          ref={canvasRef}
          width={1000}
          height={700}
          className={`block ${
            hoveredVideo
              ? 'cursor-pointer'
              : isCanvasDragging
                ? 'cursor-grabbing'
                : 'cursor-grab'
          }`}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onWheel={handleWheel}
        />

        {/* Tooltip */}
        {hoveredVideo && (
          <div
            className="fixed z-50 bg-black/90 text-white px-3 py-2 rounded-lg border border-gray-700 max-w-xs pointer-events-none"
            style={{
              left: mousePos.x + 10,
              top: mousePos.y - 10,
              transform: 'translateY(-100%)'
            }}
          >
            <div className="text-sm font-medium">{hoveredVideo.title}</div>
            <div className="text-xs text-gray-400 mt-1">
              Cluster {hoveredVideo.clusterId + 1} • {hoveredVideo.color}
            </div>
          </div>
        )}
      </div>

      {/* Controls and Legend */}
      <div className="mt-4 flex justify-between items-center">
        {/* Canvas Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setZoom(1)}
            className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-white text-xs rounded border border-gray-600 transition-colors"
          >
            Reset Zoom
          </button>
          <button
            onClick={() => setCanvasOffset({ x: 0, y: 0 })}
            className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-white text-xs rounded border border-gray-600 transition-colors"
          >
            Center
          </button>
          <span className="text-xs text-gray-400">
            Zoom: {Math.round(zoom * 100)}%
          </span>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3">
          {clusterSummaries.map((cluster, index) => (
            <div key={index} className="flex items-center gap-2 text-xs">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: CLUSTER_COLORS[index % CLUSTER_COLORS.length] }}
              />
              <span className="text-gray-300">
                Cluster {index + 1} ({cluster.size} videos)
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Export Controls */}
      <div className="mt-4">
        <ExportControls
          videos={videos}
          clusteringResults={clusteringResults}
          clusterSummaries={clusterSummaries}
          videoShapes={videoShapes}
        />
      </div>

      {/* Fullscreen Canvas Modal */}
      <FullscreenCanvas
        videos={videos}
        clusteringResults={clusteringResults}
        clusterSummaries={clusterSummaries}
        isOpen={isFullscreenOpen}
        onClose={() => setIsFullscreenOpen(false)}
      />
    </div>
  );
}