'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { ProcessedVideo, positionBySimilarity } from '../utils/dimensionality-reduction';

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

  // Initialize video shapes with positions based on embeddings
  useEffect(() => {
    if (!clusteringResults || !videos.length) return;

    // Extract cluster data and create positioned videos
    const videosWithClusters = videos.map((video, index) => {
      // Find which cluster this video belongs to
      let clusterId = 0;
      for (let i = 0; i < clusteringResults.clusters.length; i++) {
        if (clusteringResults.clusters[i].some((item: any) => item.title === video.title)) {
          clusterId = i;
          break;
        }
      }

      // Get the vector from clustering results
      const clusterItem = clusteringResults.clusters[clusterId]?.find((item: any) => item.title === video.title);
      const vector = clusterItem?.vector || new Array(8).fill(0);

      return {
        id: video.id,
        title: video.title,
        vector,
        clusterId
      };
    });

    // Position videos based on their vector similarities
    const positionedVideos = positionBySimilarity(videosWithClusters, clusteringResults.clusters.length);

    // Convert to VideoShape objects with visual properties
    const shapes: VideoShape[] = positionedVideos.map(video => ({
      ...video,
      isDragging: false,
      radius: 8,
      color: CLUSTER_COLORS[video.clusterId % CLUSTER_COLORS.length]
    }));

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

    // Draw cluster background areas
    if (clusterSummaries.length > 0) {
      clusterSummaries.forEach((cluster, index) => {
        const clusterVideos = videoShapes.filter(v => v.clusterId === index);
        if (clusterVideos.length === 0) return;

        // Calculate cluster bounds
        const xCoords = clusterVideos.map(v => v.position.x);
        const yCoords = clusterVideos.map(v => v.position.y);
        const minX = Math.min(...xCoords) - 30;
        const maxX = Math.max(...xCoords) + 30;
        const minY = Math.min(...yCoords) - 30;
        const maxY = Math.max(...yCoords) + 30;

        // Draw cluster background
        ctx.fillStyle = CLUSTER_COLORS[index % CLUSTER_COLORS.length] + '10';
        ctx.strokeStyle = CLUSTER_COLORS[index % CLUSTER_COLORS.length] + '30';
        ctx.lineWidth = 2;
        ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
        ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);

        // Draw cluster label
        ctx.fillStyle = CLUSTER_COLORS[index % CLUSTER_COLORS.length];
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(`Cluster ${index + 1}`, minX + 5, minY + 15);
      });
    }

    // Draw video shapes
    videoShapes.forEach(video => {
      ctx.beginPath();
      ctx.arc(video.position.x, video.position.y, video.radius, 0, 2 * Math.PI);

      // Fill
      ctx.fillStyle = video.color;
      ctx.fill();

      // Border
      ctx.strokeStyle = video.isDragging ? '#FFFFFF' : video.color;
      ctx.lineWidth = video.isDragging ? 3 : 2;
      ctx.stroke();

      // Highlight if hovered
      if (hoveredVideo?.id === video.id) {
        ctx.beginPath();
        ctx.arc(video.position.x, video.position.y, video.radius + 4, 0, 2 * Math.PI);
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });
  }, [videoShapes, hoveredVideo, clusterSummaries]);

  // Redraw when shapes change
  useEffect(() => {
    draw();
  }, [draw]);

  // Mouse event handlers
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setMousePos({ x: e.clientX, y: e.clientY });

    if (isDragging && draggedVideo) {
      // Update dragged video position
      setVideoShapes(shapes =>
        shapes.map(shape =>
          shape.id === draggedVideo.id
            ? { ...shape, position: { x, y } }
            : shape
        )
      );
      return;
    }

    // Check for hover
    const hoveredShape = videoShapes.find(shape => {
      const distance = Math.sqrt(
        Math.pow(x - shape.position.x, 2) + Math.pow(y - shape.position.y, 2)
      );
      return distance <= shape.radius + 4;
    });

    setHoveredVideo(hoveredShape || null);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!hoveredVideo) return;

    setIsDragging(true);
    setDraggedVideo(hoveredVideo);
    setVideoShapes(shapes =>
      shapes.map(shape =>
        shape.id === hoveredVideo.id
          ? { ...shape, isDragging: true }
          : shape
      )
    );
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
  };

  const handleMouseLeave = () => {
    setHoveredVideo(null);
    handleMouseUp();
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

      <p className="text-gray-400 text-sm mb-4">
        Videos positioned by semantic similarity. Hover to see titles, drag to reposition.
      </p>

      <div className="relative bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
        <canvas
          ref={canvasRef}
          width={1000}
          height={700}
          className="block cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
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

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-3">
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
  );
}