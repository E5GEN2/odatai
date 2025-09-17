'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { performPCA3D, Point3D } from '../utils/dimensionality-reduction';

interface Clustering3DProps {
  videos: { id: string; title: string }[];
  clusteringResults: any;
  clusterSummaries: any[];
  isOpen: boolean;
  onClose: () => void;
}

interface VideoShape3D {
  id: string;
  title: string;
  vector: number[];
  clusterId: number;
  position: Point3D;
  mesh: THREE.Mesh;
  color: string;
}

const CLUSTER_COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
];

export default function Clustering3D({
  videos,
  clusteringResults,
  clusterSummaries,
  isOpen,
  onClose
}: Clustering3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const mouseRef = useRef({ x: 0, y: 0 });
  const raycasterRef = useRef<THREE.Raycaster | null>(null);
  const mouseVector = useRef(new THREE.Vector2());

  const [videoShapes3D, setVideoShapes3D] = useState<VideoShape3D[]>([]);
  const [hoveredVideo, setHoveredVideo] = useState<VideoShape3D | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isRotating, setIsRotating] = useState(true);
  const [cameraDistance, setCameraDistance] = useState(1000);

  // Initialize 3D scene
  const initScene = useCallback(() => {
    if (!mountRef.current || !isOpen) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    // Initialize raycaster
    if (!raycasterRef.current) {
      raycasterRef.current = new THREE.Raycaster();
    }

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(75, width / height, 1, 5000);
    camera.position.set(cameraDistance, cameraDistance * 0.5, cameraDistance);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance"
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;

    // Clear any existing canvas
    if (mountRef.current.firstChild) {
      mountRef.current.removeChild(mountRef.current.firstChild);
    }
    mountRef.current.appendChild(renderer.domElement);

    console.log('Renderer initialized:', { width, height, pixelRatio: window.devicePixelRatio });

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.3);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(200, 200, 200);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    const pointLight = new THREE.PointLight(0x4040ff, 0.3, 1000);
    pointLight.position.set(-200, -200, -200);
    scene.add(pointLight);

    // Add grid helper for reference
    const gridHelper = new THREE.GridHelper(1000, 20);
    gridHelper.material.opacity = 0.1;
    gridHelper.material.transparent = true;
    scene.add(gridHelper);

    // Add axis helper
    const axesHelper = new THREE.AxesHelper(100);
    scene.add(axesHelper);

    // Add a test sphere at origin to verify rendering
    const testGeometry = new THREE.SphereGeometry(20, 32, 32);
    const testMaterial = new THREE.MeshPhongMaterial({ color: 0xff0000 });
    const testSphere = new THREE.Mesh(testGeometry, testMaterial);
    testSphere.position.set(0, 0, 0);
    scene.add(testSphere);
    console.log('Added test sphere at origin');

    return { scene, camera, renderer };
  }, [isOpen, cameraDistance]);

  // Initialize video shapes in 3D
  const initVideoShapes = useCallback(() => {
    if (!clusteringResults || !videos.length || !sceneRef.current) return;

    console.log('Initializing 3D video shapes...');

    // Clear existing shapes
    videoShapes3D.forEach(shape => {
      if (shape.mesh.parent) {
        sceneRef.current!.remove(shape.mesh);
      }
    });

    const shapes: VideoShape3D[] = [];

    // Process each cluster to get individual videos
    clusteringResults.clusters.forEach((cluster: any[], clusterIndex: number) => {
      cluster.forEach((clusterItem: any) => {
        const matchingVideo = videos.find(v => v.title === clusterItem.title);
        if (matchingVideo) {
          shapes.push({
            id: matchingVideo.id,
            title: clusterItem.title,
            vector: clusterItem.vector || new Array(8).fill(0),
            clusterId: clusterIndex,
            position: { x: 0, y: 0, z: 0 }, // Will be set below
            mesh: new THREE.Mesh(), // Will be created below
            color: CLUSTER_COLORS[clusterIndex % CLUSTER_COLORS.length]
          });
        }
      });
    });

    // Position videos using 3D PCA
    if (shapes.length > 0) {
      const vectors = shapes.map(s => s.vector);
      console.log('3D PCA input vectors:', vectors.length, 'vectors of dimension', vectors[0]?.length);
      const positions3D = performPCA3D(vectors, { width: window.innerWidth, height: window.innerHeight });
      console.log('3D PCA output positions:', positions3D.slice(0, 3));

      shapes.forEach((shape, index) => {
        shape.position = positions3D[index] || { x: 0, y: 0, z: 0 };

        // Create 3D mesh (sphere)
        const geometry = new THREE.SphereGeometry(8, 16, 16);
        const material = new THREE.MeshPhongMaterial({
          color: shape.color,
          shininess: 100,
          transparent: true,
          opacity: 0.8
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(shape.position.x, shape.position.y, shape.position.z);
        mesh.userData = { videoShape: shape };

        console.log('Created mesh at position:', shape.position, 'for video:', shape.title);

        // Add glow effect
        const glowGeometry = new THREE.SphereGeometry(12, 16, 16);
        const glowMaterial = new THREE.MeshBasicMaterial({
          color: shape.color,
          transparent: true,
          opacity: 0.1
        });
        const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
        glowMesh.position.set(shape.position.x, shape.position.y, shape.position.z);

        shape.mesh = mesh;

        sceneRef.current!.add(mesh);
        sceneRef.current!.add(glowMesh);
        console.log('Added mesh to scene. Scene children count:', sceneRef.current!.children.length);
      });
    }

    console.log('Created 3D video shapes:', shapes.length);
    setVideoShapes3D(shapes);
  }, [clusteringResults, videos, videoShapes3D]);

  // Animation loop
  const animate = useCallback(() => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;

    // Auto-rotate camera if enabled
    if (isRotating) {
      const time = Date.now() * 0.0005;
      cameraRef.current.position.x = Math.cos(time) * cameraDistance;
      cameraRef.current.position.z = Math.sin(time) * cameraDistance;
      cameraRef.current.lookAt(0, 0, 0);
    }

    try {
      // Render scene
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    } catch (error) {
      console.error('Rendering error:', error);
      return;
    }

    animationRef.current = requestAnimationFrame(animate);
  }, [isRotating, cameraDistance]);

  // Mouse interaction
  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!mountRef.current || !cameraRef.current) return;

    const rect = mountRef.current.getBoundingClientRect();
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    setMousePos({ x: event.clientX, y: event.clientY });

    // Raycast for hover detection
    if (raycasterRef.current && cameraRef.current) {
      mouseVector.current.set(mouseRef.current.x, mouseRef.current.y);
      raycasterRef.current.setFromCamera(mouseVector.current, cameraRef.current);

      const intersects = raycasterRef.current.intersectObjects(
        videoShapes3D.map(shape => shape.mesh).filter(mesh => mesh.parent)
      );

      if (intersects.length > 0) {
        const intersectedObject = intersects[0].object;
        const videoShape = intersectedObject.userData.videoShape;
        setHoveredVideo(videoShape);

        // Highlight hovered video
        videoShapes3D.forEach(shape => {
          if (shape.mesh.material instanceof THREE.MeshPhongMaterial) {
            shape.mesh.material.emissive.setHex(
              shape.id === videoShape.id ? 0x333333 : 0x000000
            );
          }
        });
      } else {
        setHoveredVideo(null);
        // Remove all highlights
        videoShapes3D.forEach(shape => {
          if (shape.mesh.material instanceof THREE.MeshPhongMaterial) {
            shape.mesh.material.emissive.setHex(0x000000);
          }
        });
      }
    }
  };

  // Initialize scene when opened
  useEffect(() => {
    if (isOpen) {
      const sceneObjects = initScene();
      if (sceneObjects) {
        initVideoShapes();
        animate();
      }

      // Prevent body scroll
      document.body.style.overflow = 'hidden';

      return () => {
        document.body.style.overflow = 'unset';
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
      };
    }
  }, [isOpen, initScene, initVideoShapes, animate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (rendererRef.current && mountRef.current) {
        mountRef.current.removeChild(rendererRef.current.domElement);
      }
    };
  }, []);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (!rendererRef.current || !cameraRef.current || !isOpen) return;

      const width = window.innerWidth;
      const height = window.innerHeight;

      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
    };

    if (isOpen) {
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, [isOpen]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case ' ':
          e.preventDefault();
          setIsRotating(!isRotating);
          break;
        case 'r':
        case 'R':
          setCameraDistance(1000);
          if (cameraRef.current) {
            cameraRef.current.position.set(1000, 500, 1000);
            cameraRef.current.lookAt(0, 0, 0);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isRotating]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* Controls */}
      <div className="absolute top-4 left-4 right-4 z-10 flex justify-between items-start">
        <div className="bg-black/80 backdrop-blur-sm border border-gray-800 rounded-lg p-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2 mb-2">
            <span>🎆</span>
            3D Cluster Visualization
          </h3>
          <div className="text-sm text-gray-400">
            {videoShapes3D.length} videos • {clusterSummaries.length} clusters in 3D space
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="bg-black/80 backdrop-blur-sm border border-gray-800 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={() => setIsRotating(!isRotating)}
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  isRotating
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300'
                }`}
              >
                {isRotating ? 'Stop Rotation' : 'Auto Rotate'}
              </button>

              <button
                onClick={() => {
                  setCameraDistance(1000);
                  if (cameraRef.current) {
                    cameraRef.current.position.set(1000, 500, 1000);
                    cameraRef.current.lookAt(0, 0, 0);
                  }
                }}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors"
              >
                Reset View
              </button>
            </div>

            <div className="text-xs text-gray-400">
              <div>• Mouse: Look around</div>
              <div>• Scroll: Zoom in/out</div>
              <div>• Space: Toggle rotation</div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
          >
            ✕ Exit 3D
          </button>
        </div>
      </div>

      {/* 3D Canvas */}
      <div
        ref={mountRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onMouseMove={handleMouseMove}
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
            Cluster {hoveredVideo.clusterId + 1} • 3D Position: (
            {Math.round(hoveredVideo.position.x)},
            {Math.round(hoveredVideo.position.y)},
            {Math.round(hoveredVideo.position.z)})
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-black/80 backdrop-blur-sm border border-gray-800 rounded-lg p-4 max-w-xs">
        <h4 className="text-white font-medium mb-2">3D Clusters</h4>
        <div className="grid grid-cols-2 gap-1 text-xs max-h-32 overflow-y-auto">
          {clusterSummaries.map((cluster, index) => (
            <div key={index} className="flex items-center gap-2">
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
    </div>
  );
}