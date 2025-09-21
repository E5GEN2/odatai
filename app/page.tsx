'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { ClusteringResults, ClusterSummary } from '../utils/clustering';
import { Word2VecConfig } from '../utils/word2vec';
import ClusteringCanvas from '../components/ClusteringCanvas';

interface VideoData {
  id: string;
  title: string;
  url: string;
  channel: string;
  duration: string;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<'database' | 'data-mining' | 'analyze' | 'explorer'>('database');
  const [inputText, setInputText] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [huggingFaceApiKey, setHuggingFaceApiKey] = useState('');
  const [googleApiKey, setGoogleApiKey] = useState('');
  const [videos, setVideos] = useState<VideoData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showHuggingFaceApiKey, setShowHuggingFaceApiKey] = useState(false);
  const [showGoogleApiKey, setShowGoogleApiKey] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [progress, setProgress] = useState<{current: number, total: number} | null>(null);
  const [appendMode, setAppendMode] = useState(false);

  // Clustering state
  const [clusteringResults, setClusteringResults] = useState<ClusteringResults | null>(null);
  const [clusterSummaries, setClusterSummaries] = useState<ClusterSummary[]>([]);
  const [isClusteringLoading, setIsClusteringLoading] = useState(false);
  const [clusteringError, setClusteringError] = useState('');
  const [clusteringProgress, setClusteringProgress] = useState<{
    stage: string;
    message: string;
    progress?: number;
  } | null>(null);
  const [clusteringConfig, setClusteringConfig] = useState({
    k: 5,
    algorithm: 'kmeans++',
    word2vecApproach: 'sentence-transformers',
    sentenceTransformerModel: 'BAAI/bge-small-en-v1.5',
    dimensions: 384,
    aggregation: 'mean',
    removeStopwords: true,
    stemWords: true,
    lowercase: true,
    handleUnknown: false,
    googleBatchSize: 25,
    googleBatchDelay: 1000
  });
  const [kOptimizationResults, setKOptimizationResults] = useState<any>(null);
  const [processedTexts, setProcessedTexts] = useState<any[]>([]);
  const [selectedCluster, setSelectedCluster] = useState<{
    id: number;
    summary: any;
    videos: VideoData[];
  } | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [loadingThumbnails, setLoadingThumbnails] = useState(false);
  const [thumbnailProgress, setThumbnailProgress] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [similarVideos, setSimilarVideos] = useState<{
    query: VideoData;
    results: Array<{
      video: VideoData;
      similarity: number;
      clusterId: number;
    }>;
  } | null>(null);
  const [showSimilarityModal, setShowSimilarityModal] = useState(false);

  // ClickHouse Database state
  const [clickhouseConfig, setClickhouseConfig] = useState({
    host: '',
    username: 'default',
    password: '',
    database: 'default'
  });
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'connected' | 'error'>('idle');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [saveProgress, setSaveProgress] = useState<{
    isActive: boolean;
    message: string;
    current: number;
    total: number;
    error?: string;
  }>({
    isActive: false,
    message: '',
    current: 0,
    total: 0
  });

  // Explorer tab state
  const [explorerData, setExplorerData] = useState<any[]>([]);
  const [explorerLoading, setExplorerLoading] = useState(false);
  const [explorerError, setExplorerError] = useState('');
  const [explorerFilter, setExplorerFilter] = useState('');
  const [explorerSort, setExplorerSort] = useState<{field: string, direction: 'asc' | 'desc'}>({field: 'added_at', direction: 'desc'});

  // Load saved API keys from localStorage on component mount
  useEffect(() => {
    const savedHuggingFaceKey = localStorage.getItem('huggingface_api_key');
    const savedGoogleKey = localStorage.getItem('google_api_key');

    if (savedHuggingFaceKey) {
      setHuggingFaceApiKey(savedHuggingFaceKey);
    }
    if (savedGoogleKey) {
      setGoogleApiKey(savedGoogleKey);
    }
  }, []);

  const extractVideoId = (url: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /youtube\.com\/v\/([^&\n?#]+)/,
      /youtube\.com\/shorts\/([^&\n?#]+)/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  };

  // Cosine similarity calculation
  const cosineSimilarity = (a: number[], b: number[]): number => {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  };

  // Find similar videos using embeddings
  const findSimilarVideos = (targetVideo: VideoData) => {
    console.log('findSimilarVideos called with:', targetVideo.title);
    console.log('clusteringResults:', !!clusteringResults);
    console.log('processedTexts:', processedTexts?.length);

    if (!clusteringResults || !processedTexts) {
      console.warn('No clustering results available for similarity search');
      return;
    }

    // Find the target video's embedding by matching the title in processedTexts
    // Note: processedTexts only contains English videos that were actually clustered
    let targetEmbedding = null;
    let targetProcessedIndex = -1;

    for (let i = 0; i < processedTexts.length; i++) {
      if (processedTexts[i].original === targetVideo.title) {
        targetEmbedding = processedTexts[i].vector;
        targetProcessedIndex = i;
        break;
      }
    }

    if (!targetEmbedding) {
      console.warn('No embedding found for target video. This video may not have been included in clustering (possibly filtered out as non-English)');
      alert('This video was not included in the clustering analysis (possibly filtered out as non-English content). Similarity search is only available for videos that were actually clustered.');
      return;
    }

    console.log('Found target embedding at index:', targetProcessedIndex);

    // Calculate similarity with all other videos
    const similarities: Array<{
      video: VideoData;
      similarity: number;
      clusterId: number;
    }> = [];

    processedTexts.forEach((processed, index) => {
      if (index !== targetProcessedIndex && processed.vector) {
        const similarity = cosineSimilarity(targetEmbedding, processed.vector);

        // Find the video in the original videos array by title
        const video = videos.find(v => v.title === processed.original);
        if (!video) return; // Skip if video not found

        // Find which cluster this video belongs to
        let clusterId = -1;
        clusteringResults.clusters.forEach((cluster, cId) => {
          if (cluster.some((item: any) => item.title === video.title)) {
            clusterId = cId;
          }
        });

        similarities.push({
          video,
          similarity,
          clusterId
        });
      }
    });

    // Sort by similarity (highest first) and take top 20
    const topSimilar = similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 20);

    setSimilarVideos({
      query: targetVideo,
      results: topSimilar
    });
    setShowSimilarityModal(true);
  };

  const formatDuration = (duration: string): string => {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return duration;

    const hours = match[1] ? parseInt(match[1]) : 0;
    const minutes = match[2] ? parseInt(match[2]) : 0;
    const seconds = match[3] ? parseInt(match[3]) : 0;

    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0) parts.push(`${seconds}s`);

    return parts.join(' ') || '0s';
  };

  const fetchThumbnails = async (videos: VideoData[]) => {
    if (!apiKey.trim()) {
      console.warn('YouTube API key not available for thumbnail fetching');
      return;
    }

    setLoadingThumbnails(true);
    setThumbnailProgress(`Extracting video IDs...`);

    try {
      // Extract video IDs from URLs
      const videoIds = videos
        .map(video => extractVideoId(video.url))
        .filter((id): id is string => id !== null);

      if (videoIds.length === 0) {
        setLoadingThumbnails(false);
        setThumbnailProgress(null);
        return;
      }

      setThumbnailProgress(`Loading thumbnails for ${videoIds.length} videos...`);

      const response = await fetch('/api/youtube-thumbnails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoIds,
          apiKey: apiKey.trim()
        })
      });

      if (response.ok) {
        const data = await response.json();
        const thumbnailCount = Object.keys(data.thumbnails || {}).length;
        setThumbnails(data.thumbnails || {});
        setThumbnailProgress(null);

        if (thumbnailCount > 0) {
          console.log(`Successfully loaded ${thumbnailCount} thumbnails`);
        }
      } else {
        console.error('Failed to fetch thumbnails:', await response.text());
        setThumbnailProgress(null);
      }
    } catch (error) {
      console.error('Error fetching thumbnails:', error);
      setThumbnailProgress(null);
    } finally {
      setLoadingThumbnails(false);
    }
  };

  const fetchVideoData = async (append: boolean = false) => {
    setLoading(true);
    setError('');
    if (!append) {
      setVideos([]);
    }
    setProgress(null);

    if (!apiKey.trim()) {
      setError('Please enter your YouTube API key');
      setLoading(false);
      return;
    }

    const lines = inputText.trim().split('\n').filter(line => line.trim());
    const videoIds: { id: string; originalUrl: string }[] = [];
    const existingVideoIds = new Set(videos.map(v => v.id));

    for (const line of lines) {
      const videoId = extractVideoId(line.trim());
      if (videoId && (!append || !existingVideoIds.has(videoId))) {
        videoIds.push({ id: videoId, originalUrl: line.trim() });
      }
    }

    if (videoIds.length === 0) {
      if (append) {
        setError('No new valid YouTube URLs found (duplicates filtered out)');
      } else {
        setError('No valid YouTube URLs found');
      }
      setLoading(false);
      return;
    }

    try {
      const url = `https://www.googleapis.com/youtube/v3/videos`;
      const batchSize = 50; // YouTube API limit
      const allVideoData: VideoData[] = append ? [...videos] : [];

      const totalBatches = Math.ceil(videoIds.length / batchSize);
      console.log(`Processing ${videoIds.length} video IDs in ${totalBatches} batches of ${batchSize}`);

      // Process in batches of 50
      for (let i = 0; i < videoIds.length; i += batchSize) {
        const currentBatch = Math.floor(i/batchSize) + 1;
        setProgress({ current: currentBatch, total: totalBatches });

        const batch = videoIds.slice(i, i + batchSize);
        const params = {
          part: 'snippet,contentDetails',
          id: batch.map(v => v.id).join(','),
          key: apiKey
        };

        console.log(`Processing batch ${currentBatch}/${totalBatches}`);

        const response = await axios.get(url, { params });

        const batchVideoData: VideoData[] = response.data.items.map((item: any) => {
          const originalVideo = batch.find(v => v.id === item.id);
          return {
            id: item.id,
            title: item.snippet.title,
            url: originalVideo?.originalUrl || `https://youtube.com/watch?v=${item.id}`,
            channel: item.snippet.channelTitle,
            duration: formatDuration(item.contentDetails.duration)
          };
        });

        allVideoData.push(...batchVideoData);

        // Update UI with current progress
        setVideos([...allVideoData]);

        // Small delay between batches to avoid rate limiting
        if (i + batchSize < videoIds.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      setVideos(allVideoData);

      // Save API key to localStorage for convenience (optional)
      if (typeof window !== 'undefined') {
        localStorage.setItem('youtube_api_key', apiKey);
      }
    } catch (err: any) {
      console.error('Error fetching video data:', err);
      if (err.response?.status === 403) {
        setError('API key invalid or quota exceeded. Please check your YouTube API key.');
      } else if (err.response?.status === 400) {
        setError('Invalid API key format. Please check your YouTube API key.');
      } else if (err.message === 'Network Error' || !err.response) {
        setError('Network error. This might be a CORS issue. Try refreshing the page or check your internet connection.');
      } else {
        setError(`Failed to fetch video data: ${err.response?.data?.error?.message || err.message || 'Unknown error'}`);
      }
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  const clearAll = () => {
    setInputText('');
    setVideos([]);
    setError('');
    setProgress(null);
    setAppendMode(false);
  };

  const removeDuplicates = () => {
    if (videos.length === 0) return;

    const uniqueVideos = new Map<string, VideoData>();
    let duplicatesCount = 0;

    // Keep only the first occurrence of each video ID
    videos.forEach(video => {
      if (!uniqueVideos.has(video.id)) {
        uniqueVideos.set(video.id, video);
      } else {
        duplicatesCount++;
      }
    });

    const uniqueVideoArray = Array.from(uniqueVideos.values());
    setVideos(uniqueVideoArray);

    // Show a message about removed duplicates
    if (duplicatesCount > 0) {
      setError(`✅ Removed ${duplicatesCount} duplicate video${duplicatesCount !== 1 ? 's' : ''}. ${uniqueVideoArray.length} unique videos remaining.`);
      setTimeout(() => setError(''), 3000);
    } else {
      setError('✅ No duplicates found. All videos are unique.');
      setTimeout(() => setError(''), 3000);
    }
  };

  const exportToCSV = () => {
    if (videos.length === 0) return;

    const csvContent = [
      ['Title', 'Channel', 'Duration', 'URL'].join(','),
      ...videos.map(video =>
        [
          `"${video.title.replace(/"/g, '""')}"`,
          `"${video.channel.replace(/"/g, '""')}"`,
          video.duration,
          video.url
        ].join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'youtube-videos.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleClusterClick = (clusterId: number) => {
    if (!clusteringResults || !clusterSummaries) return;

    // Get videos for this cluster
    const clusterVideos: VideoData[] = [];
    clusteringResults.clusters[clusterId]?.forEach((clusterItem: any) => {
      const matchingVideo = videos.find(v => v.title === clusterItem.title);
      if (matchingVideo) {
        clusterVideos.push(matchingVideo);
      }
    });

    setSelectedCluster({
      id: clusterId,
      summary: clusterSummaries[clusterId],
      videos: clusterVideos
    });

    // Clear any existing thumbnails when switching clusters
    setThumbnails({});
  };

  const handleBackToAnalyze = () => {
    setSelectedCluster(null);
    setThumbnails({}); // Clear thumbnails when going back
    setThumbnailProgress(null); // Clear progress message
  };

  // Run K-means clustering with real-time progress
  const runClustering = async () => {
    if (videos.length === 0) {
      setClusteringError('No video data available. Please fetch videos first.');
      return;
    }

    if (videos.length < clusteringConfig.k) {
      setClusteringError(`Need at least ${clusteringConfig.k} videos for ${clusteringConfig.k} clusters.`);
      return;
    }

    setIsClusteringLoading(true);
    setClusteringError('');
    setClusteringResults(null);
    // Don't clear processedTexts - we might want to use existing embeddings
    setClusteringProgress({
      stage: 'initialization',
      message: 'Connecting to clustering service...',
      progress: 1
    });

    try {
      const titles = videos.map(video => video.title);

      // Configure Word2Vec
      const word2vecConfig: Word2VecConfig = {
        approach: clusteringConfig.word2vecApproach as 'pretrained' | 'custom' | 'hybrid',
        model: clusteringConfig.sentenceTransformerModel,
        dimensions: clusteringConfig.dimensions,
        aggregation: clusteringConfig.aggregation as 'mean' | 'sum' | 'max' | 'tfidf',
        removeStopwords: clusteringConfig.removeStopwords,
        stemWords: clusteringConfig.stemWords,
        lowercase: clusteringConfig.lowercase,
        handleUnknown: clusteringConfig.handleUnknown
      };

      // Check if we should use pre-existing embeddings (either explicitly selected or automatically detected)
      const hasPreExistingEmbeddings =
        (clusteringConfig.word2vecApproach === 'database') ||
        (processedTexts.length > 0 && processedTexts.every(item => item.vector && item.vector.length > 0));

      // Validate that database embeddings are available when database approach is selected
      if (clusteringConfig.word2vecApproach === 'database') {
        if (processedTexts.length === 0 || !processedTexts.every(item => item.vector && item.vector.length > 0)) {
          setClusteringError('Database embeddings not available. Please import videos with embeddings first.');
          setIsClusteringLoading(false);
          return;
        }
      }

      console.log('Starting clustering with streaming progress:', {
        word2vecConfig,
        clusteringConfig,
        hasPreExistingEmbeddings,
        preExistingCount: processedTexts.length
      });

      if (hasPreExistingEmbeddings) {
        setClusteringProgress({
          stage: 'initialization',
          message: `Using ${processedTexts.length} pre-existing embeddings from database...`,
          progress: 5
        });
      }

      // Use streaming API for real-time progress updates
      const response = await fetch('/api/clustering-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          titles,
          word2vecConfig,
          clusteringConfig,
          huggingFaceApiKey: huggingFaceApiKey.trim() || undefined,
          googleApiKey: googleApiKey.trim() || undefined,
          preExistingEmbeddings: hasPreExistingEmbeddings ? processedTexts : undefined
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('Failed to get response reader');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        // Decode the chunk and add to buffer
        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'error') {
                throw new Error(data.error);
              } else if (data.type === 'result') {
                // Final result received
                if (data.success) {
                  setClusteringResults(data.data.results);
                  setClusterSummaries(data.data.summaries);
                  setKOptimizationResults(data.data.kOptimization);
                  setProcessedTexts(data.data.processedTexts || []);

                  console.log('Clustering completed via stream:', {
                    clusters: data.data.results.clusters.length,
                    totalVideos: data.data.results.statistics.totalVideos,
                    processingTime: data.data.results.statistics.processingTime,
                    kOptimization: data.data.kOptimization
                  });

                  // Clear progress after a brief delay
                  setTimeout(() => setClusteringProgress(null), 3000);
                } else {
                  throw new Error(data.data.error || 'Clustering failed');
                }
              } else {
                // Progress update
                setClusteringProgress({
                  stage: data.stage,
                  message: data.message,
                  progress: data.progress
                });
              }
            } catch (parseError) {
              console.warn('Failed to parse SSE data:', line, parseError);
            }
          }
        }
      }

    } catch (err: any) {
      console.error('Clustering error:', err);
      const errorMessage = err.message || 'Unknown error';
      setClusteringError(`Clustering failed: ${errorMessage}`);
      setClusteringProgress(null);
    } finally {
      setIsClusteringLoading(false);
    }
  };

  // Load API keys and ClickHouse config from localStorage on mount
  useEffect(() => {
    const savedYouTubeKey = localStorage.getItem('youtube_api_key');
    if (savedYouTubeKey) {
      setApiKey(savedYouTubeKey);
    }

    const savedHuggingFaceKey = localStorage.getItem('huggingface_api_key');
    if (savedHuggingFaceKey) {
      setHuggingFaceApiKey(savedHuggingFaceKey);
    }

    const savedClickHouseConfig = localStorage.getItem('clickhouse_config');
    if (savedClickHouseConfig) {
      try {
        const config = JSON.parse(savedClickHouseConfig);
        setClickhouseConfig(config);
      } catch (e) {
        console.error('Failed to parse saved ClickHouse config:', e);
      }
    }
  }, []);

  // Save ClickHouse config to localStorage when it changes
  useEffect(() => {
    if (clickhouseConfig.host || clickhouseConfig.password) {
      localStorage.setItem('clickhouse_config', JSON.stringify(clickhouseConfig));
    }
  }, [clickhouseConfig]);

  // Import URLs from ClickHouse database
  const importUrlsFromDatabase = async () => {
    if (!isConnected) {
      alert('Please connect to your ClickHouse database first in the Database tab.');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('/api/clickhouse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'get_urls',
          config: clickhouseConfig,
          data: { limit: 1000 }
        }),
      });

      const result = await response.json();

      console.log('Import URLs result:', result);

      if (result.success) {
        if (result.urls && result.urls.length > 0) {
          const urlsText = result.urls.map((item: any) => item.url).join('\n');
          setInputText(urlsText);
          const sourceInfo = result.source ? ` from ${result.source}` : '';
          alert(`✅ Successfully imported ${result.urls.length} URLs${sourceInfo}${result.totalInDb ? ` (${result.totalInDb} total in DB)` : ''}.\n\nYou can now fetch their titles.`);
        } else {
          alert(`📄 Database is empty - no URLs found.\n\n${result.message || 'The URLs table exists but contains no data.'}\n\nPlease add some URLs first or check your database connection.`);
        }
      } else {
        alert(`❌ Failed to import URLs from database.\n\nError: ${result.error}\n\nPlease check your database connection and try again.`);
      }
    } catch (error: any) {
      console.error('Import failed:', error);
      alert(`Import failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Import complete video records with embeddings from ClickHouse database
  const importVideosFromDatabase = async () => {
    if (!isConnected) {
      alert('Please connect to your ClickHouse database first in the Database tab.');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('/api/clickhouse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'get_videos_with_embeddings',
          config: clickhouseConfig,
          data: { limit: 1000 }
        }),
      });

      const result = await response.json();

      console.log('Import videos result:', result);

      if (result.success) {
        if (result.videos && result.videos.length > 0) {
          // Convert the database videos to our frontend format
          const importedVideos = result.videos.map((dbVideo: any) => ({
            id: dbVideo.id,
            url: dbVideo.url,
            title: dbVideo.title || 'No Title',
            thumbnail: dbVideo.thumbnail || '',
            duration: dbVideo.duration || 'Unknown',
            viewCount: dbVideo.view_count || 0,
            likeCount: dbVideo.like_count || 0,
            commentCount: dbVideo.comment_count || 0,
            publishedAt: dbVideo.published_at || '',
            channelId: dbVideo.channel_id || '',
            channelTitle: dbVideo.channel_title || 'Unknown Channel',
            description: dbVideo.description || '',
            tags: dbVideo.tags || [],
            categoryId: dbVideo.category_id || '',
            // Include embedding data for potential use
            embedding: dbVideo.embedding || [],
            embeddingModel: dbVideo.embedding_model || '',
            embeddingDimensions: dbVideo.embedding_dimensions || 0,
            processedForClustering: dbVideo.processed_for_clustering || false,
            languageDetected: dbVideo.language_detected || '',
            languageConfidence: dbVideo.language_confidence || 0
          }));

          // Set the videos state
          setVideos(importedVideos);

          // If we have embedding data, we can also set processed texts for clustering
          const processedTextsData = importedVideos
            .filter((video: any) => video.embedding.length > 0)
            .map((video: any) => ({
              original: video.title,
              tokens: video.title.split(' '),
              vector: video.embedding,
              coverage: 100
            }));

          if (processedTextsData.length > 0) {
            setProcessedTexts(processedTextsData);
            console.log(`Imported ${processedTextsData.length} videos with embeddings ready for clustering`);
          }

          alert(`✅ Successfully imported ${importedVideos.length} videos from database.\n\n${processedTextsData.length} videos have embeddings ready for clustering.\n\nYou can now proceed with analysis or clustering.`);
        } else {
          alert(`📄 Database is empty - no videos found.\n\n${result.message || 'The videos table exists but contains no data.'}\n\nPlease add some videos first or check your database connection.`);
        }
      } else {
        alert(`❌ Failed to import videos from database.\n\nError: ${result.error}\n\nPlease check your database connection and try again.`);
      }
    } catch (error: any) {
      console.error('Import videos failed:', error);
      alert(`Import videos failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Save analysis results and videos with embeddings to ClickHouse database
  const saveAnalysisResults = async () => {
    if (!isConnected) {
      alert('Please connect to your ClickHouse database first in the Database tab.');
      return;
    }

    if (!clusteringResults || !clusterSummaries) {
      alert('No analysis results to save. Please run clustering analysis first.');
      return;
    }

    try {
      // Prepare videos with embeddings data
      const videosWithEmbeddings = videos.map((video, index) => {
        const processedText = processedTexts[index];
        const embedding = processedText?.vector || [];

        return {
          ...video,
          embedding: embedding,
          embedding_model: clusteringConfig.word2vecApproach === 'sentence-transformers'
            ? clusteringConfig.sentenceTransformerModel
            : clusteringConfig.word2vecApproach === 'google-gemini'
            ? 'text-embedding-004'
            : clusteringConfig.word2vecApproach === 'google-gemini-1536'
            ? 'gemini-embedding-001'
            : clusteringConfig.word2vecApproach === 'google-gemini-3072'
            ? 'gemini-embedding-001'
            : 'word2vec',
          embedding_dimensions: embedding.length || 0,
          embedding_generated_at: new Date().toISOString(),
          processed_for_clustering: true,
          language_detected: 'en', // You could integrate language detection here
          language_confidence: 0.95 // Default confidence for English content
        };
      }).filter(video => video.embedding.length > 0); // Only save videos with embeddings

      // Save videos with embeddings first
      if (videosWithEmbeddings.length > 0) {
        const videoResponse = await fetch('/api/clickhouse', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'save_complete_videos',
            config: clickhouseConfig,
            data: { videos: videosWithEmbeddings }
          }),
        });

        const videoResult = await videoResponse.json();
        if (!videoResult.success) {
          throw new Error(`Failed to save videos with embeddings: ${videoResult.error}`);
        }
      }

      // Save analysis results
      const analysisData = {
        videoCount: videos.length,
        clusterCount: clusteringResults.clusters.length,
        embeddingModel: clusteringConfig.word2vecApproach === 'sentence-transformers'
          ? clusteringConfig.sentenceTransformerModel
          : clusteringConfig.word2vecApproach === 'google-gemini'
          ? 'text-embedding-004'
          : clusteringConfig.word2vecApproach === 'google-gemini-1536'
          ? 'gemini-embedding-001'
          : clusteringConfig.word2vecApproach === 'google-gemini-3072'
          ? 'gemini-embedding-001'
          : 'word2vec',
        clusteringAlgorithm: clusteringConfig.algorithm,
        clusteringResults,
        clusterSummaries,
        videos,
        processedTexts,
        configuration: {
          clusteringConfig
        },
        kOptimization: kOptimizationResults
      };

      const response = await fetch('/api/clickhouse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'save_results',
          config: clickhouseConfig,
          data: { results: analysisData }
        }),
      });

      const result = await response.json();

      if (result.success) {
        alert(`✅ Successfully saved complete analysis to database!\n\n📊 Analysis Results: Session ID ${result.sessionId}\n🎬 Videos with Embeddings: ${videosWithEmbeddings.length} videos\n🤖 Model: ${clusteringConfig.sentenceTransformerModel || 'word2vec'}\n📏 Dimensions: ${videosWithEmbeddings[0]?.embedding_dimensions || 'N/A'}`);
      } else {
        alert(`Failed to save analysis results: ${result.error}`);
      }
    } catch (error: any) {
      console.error('Save failed:', error);
      alert(`Save failed: ${error.message}`);
    }
  };

  // Save current video data to ClickHouse database
  const saveVideosToDatabase = async () => {
    if (!isConnected) {
      alert('Please connect to your ClickHouse database first in the Database tab.');
      return;
    }

    if (videos.length === 0) {
      alert('No video data to save. Please fetch some videos first.');
      return;
    }

    // Initialize progress
    setSaveProgress({
      isActive: true,
      message: 'Preparing to save videos...',
      current: 0,
      total: videos.length,
      error: undefined
    });

    try {
      // Show progress for table creation
      setSaveProgress(prev => ({
        ...prev,
        message: 'Ensuring database tables exist...',
        current: 10
      }));

      // Batch videos if there are many
      const batchSize = 100;
      let savedCount = 0;

      for (let i = 0; i < videos.length; i += batchSize) {
        const batch = videos.slice(i, Math.min(i + batchSize, videos.length));

        setSaveProgress(prev => ({
          ...prev,
          message: `Saving batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(videos.length / batchSize)}...`,
          current: i + batch.length
        }));

        const response = await fetch('/api/clickhouse', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'save_videos',
            config: clickhouseConfig,
            data: { videos: batch }
          }),
        });

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || 'Save failed');
        }

        savedCount += batch.length;

        // Small delay between batches to avoid overwhelming the database
        if (i + batchSize < videos.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Success
      setSaveProgress(prev => ({
        ...prev,
        message: `✅ Successfully saved ${savedCount} videos to database!`,
        current: savedCount
      }));

      // Close modal after 2 seconds
      setTimeout(() => {
        setSaveProgress({
          isActive: false,
          message: '',
          current: 0,
          total: 0
        });
      }, 2000);

    } catch (error: any) {
      console.error('Save failed:', error);
      setSaveProgress(prev => ({
        ...prev,
        error: error.message || 'Save failed',
        message: `❌ Error: ${error.message || 'Save failed'}`
      }));

      // Close modal after 3 seconds on error
      setTimeout(() => {
        setSaveProgress({
          isActive: false,
          message: '',
          current: 0,
          total: 0
        });
      }, 3000);
    }
  };

  // Test ClickHouse connection
  const testClickHouseConnection = async () => {
    setConnectionStatus('testing');
    setConnectionError(null);

    try {
      const response = await fetch('/api/clickhouse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'test',
          config: clickhouseConfig
        }),
      });

      const result = await response.json();

      if (result.success) {
        setConnectionStatus('connected');
        setIsConnected(true);
      } else {
        setConnectionStatus('error');
        setConnectionError(result.error || 'Connection failed');
        setIsConnected(false);
      }
    } catch (error: any) {
      setConnectionStatus('error');
      setConnectionError(error.message || 'Connection failed');
      setIsConnected(false);
    }
  };

  // Load explorer data from database
  const loadExplorerData = async (offset: number = 0, search: string = '', sort: string = 'added_at', sortDirection: string = 'desc') => {
    if (!isConnected) {
      setExplorerError('Please connect to your ClickHouse database first in the Database tab.');
      return;
    }

    setExplorerLoading(true);
    setExplorerError('');

    try {
      const response = await fetch('/api/clickhouse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'get_all_videos',
          config: clickhouseConfig,
          data: {
            limit: 50,
            offset,
            search,
            sort,
            sortDirection
          }
        }),
      });

      const result = await response.json();
      if (result.success) {
        if (offset === 0) {
          setExplorerData(result.videos);
        } else {
          setExplorerData(prev => [...prev, ...result.videos]);
        }
      } else {
        setExplorerError(result.error || 'Failed to load data');
      }
    } catch (error: any) {
      setExplorerError(error.message || 'Failed to load data');
    } finally {
      setExplorerLoading(false);
    }
  };

  // Handle search in explorer
  const handleExplorerSearch = (searchTerm: string) => {
    setExplorerFilter(searchTerm);
    loadExplorerData(0, searchTerm, explorerSort.field, explorerSort.direction);
  };

  // Handle sort in explorer
  const handleExplorerSort = (field: string) => {
    const newDirection = explorerSort.field === field && explorerSort.direction === 'desc' ? 'asc' : 'desc';
    setExplorerSort({ field, direction: newDirection });
    loadExplorerData(0, explorerFilter, field, newDirection);
  };

  const renderDatabaseTab = () => (
    <div className="space-y-8">
      <div className="text-center mb-8">
        <h2 className="text-4xl font-bold text-white mb-4">
          🗄️ ClickHouse Database Management
        </h2>
        <p className="text-gray-400 text-lg max-w-3xl mx-auto leading-relaxed">
          Connect to your ClickHouse database to import URLs for data mining and save analysis results.
          Automatically prevents duplicate entries and maintains data integrity.
        </p>
      </div>

      {/* Connection Status */}
      <div className="bg-black/30 rounded-xl p-6 border border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-white">Connection Status</h3>
          <div className={`px-3 py-1 rounded-full text-sm font-semibold ${
            connectionStatus === 'connected' ? 'bg-green-600/20 text-green-400' :
            connectionStatus === 'error' ? 'bg-red-600/20 text-red-400' :
            connectionStatus === 'testing' ? 'bg-yellow-600/20 text-yellow-400' :
            'bg-gray-600/20 text-gray-400'
          }`}>
            {connectionStatus === 'connected' ? '✅ Connected' :
             connectionStatus === 'error' ? '❌ Error' :
             connectionStatus === 'testing' ? '🔄 Testing...' :
             '⚪ Not Connected'}
          </div>
        </div>

        {connectionError && (
          <div className="bg-red-600/10 border border-red-600/30 rounded-lg p-3 mb-4">
            <p className="text-red-400 text-sm">{connectionError}</p>
          </div>
        )}
      </div>

      {/* Connection Configuration */}
      <div className="bg-black/30 rounded-xl p-6 border border-gray-800">
        <h3 className="text-xl font-semibold text-white mb-4">ClickHouse Configuration</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Host URL
            </label>
            <input
              type="text"
              value={clickhouseConfig.host}
              onChange={(e) => setClickhouseConfig(prev => ({ ...prev, host: e.target.value }))}
              placeholder="e.g., https://trn0d6m9sp.germanywestcentral.azure.clickhouse.cloud:8443"
              className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Database Name
            </label>
            <input
              type="text"
              value={clickhouseConfig.database}
              onChange={(e) => setClickhouseConfig(prev => ({ ...prev, database: e.target.value }))}
              placeholder="default"
              className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Username
            </label>
            <input
              type="text"
              value={clickhouseConfig.username}
              onChange={(e) => setClickhouseConfig(prev => ({ ...prev, username: e.target.value }))}
              placeholder="default"
              className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Password
            </label>
            <input
              type="password"
              value={clickhouseConfig.password}
              onChange={(e) => setClickhouseConfig(prev => ({ ...prev, password: e.target.value }))}
              placeholder="Enter your password"
              className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div className="flex gap-4">
          <button
            onClick={testClickHouseConnection}
            disabled={connectionStatus === 'testing' || !clickhouseConfig.host || !clickhouseConfig.password}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
            title={
              !clickhouseConfig.host ? 'Please enter host URL' :
              !clickhouseConfig.password ? 'Please enter password' :
              connectionStatus === 'testing' ? 'Testing in progress...' :
              'Click to test connection'
            }
          >
            {connectionStatus === 'testing' ? 'Testing Connection...' : 'Test Connection'}
          </button>

          {isConnected && (
            <button
              onClick={() => {
                setConnectionStatus('idle');
                setIsConnected(false);
                setConnectionError(null);
              }}
              className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-xl transition-colors"
            >
              Disconnect
            </button>
          )}
        </div>

        {/* Debug info - remove in production */}
        <div className="mt-4 p-2 bg-black/60 rounded text-xs text-gray-500">
          <p>Debug Info:</p>
          <p>• Host filled: {clickhouseConfig.host ? '✓' : '✗'} ({clickhouseConfig.host.length} chars)</p>
          <p>• Password filled: {clickhouseConfig.password ? '✓' : '✗'} ({clickhouseConfig.password.length} chars)</p>
          <p>• Status: {connectionStatus}</p>
        </div>

        {/* Example curl command */}
        <div className="mt-6 p-4 bg-black/40 rounded-lg border border-gray-700">
          <h4 className="text-sm font-semibold text-gray-300 mb-2">Example Configuration:</h4>
          <p className="text-xs text-gray-400 mb-2">
            Based on your provided curl command:
          </p>
          <code className="text-xs text-green-400 bg-black/60 p-2 rounded block">
            curl --user 'default:S_4k5q3d98KIc' --data-binary 'SELECT 1' https://trn0d6m9sp.germanywestcentral.azure.clickhouse.cloud:8443
          </code>
          <div className="mt-2 text-xs text-gray-500">
            <p>• Host: https://trn0d6m9sp.germanywestcentral.azure.clickhouse.cloud:8443</p>
            <p>• Username: default</p>
            <p>• Password: S_4k5q3d98KIc</p>
          </div>
        </div>
      </div>

      {/* Database Operations */}
      {isConnected && (
        <div className="bg-black/30 rounded-xl p-6 border border-gray-800">
          <h3 className="text-xl font-semibold text-white mb-4">Database Operations</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-black/40 rounded-lg p-4 border border-gray-700">
              <h4 className="text-lg font-semibold text-white mb-2">📥 Import URLs</h4>
              <p className="text-gray-400 text-sm mb-4">
                Load YouTube URLs from your database into the Data Mining tab for analysis.
              </p>
              <button
                onClick={() => setActiveTab('data-mining')}
                className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
              >
                Go to Data Mining Tab
              </button>
            </div>

            <div className="bg-black/40 rounded-lg p-4 border border-gray-700">
              <h4 className="text-lg font-semibold text-white mb-2">💾 Save Results</h4>
              <p className="text-gray-400 text-sm mb-4">
                Export analysis results, clustering data, and video metadata to your database.
              </p>
              <button
                onClick={() => setActiveTab('analyze')}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
              >
                Go to Analysis Tab
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderDataMiningTab = () => (
    <>
      {/* API Key Input */}
      <div className="mb-8">
        <label className="block text-sm font-medium text-gray-300 mb-3">
          🔑 YouTube API Key
        </label>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <input
              type={showApiKey ? "text" : "password"}
              className="w-full px-5 py-4 bg-black/50 backdrop-blur-md border border-gray-800 rounded-2xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300"
              placeholder="Enter your YouTube Data API v3 key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
          <button
            onClick={() => setShowApiKey(!showApiKey)}
            className="px-6 py-4 bg-black/50 backdrop-blur-md border border-gray-800 text-white rounded-2xl hover:bg-gray-900/50 hover:border-gray-700 transition-all duration-300 font-medium"
          >
            {showApiKey ? '👁️' : '👁️‍🗨️'}
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Get your API key from{' '}
          <a
            href="https://console.cloud.google.com/apis/credentials"
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-400 hover:text-purple-300 underline transition-colors"
          >
            Google Cloud Console
          </a>
        </p>
      </div>

      {/* URL Input */}
      <div className="mb-8">
        <label className="block text-sm font-medium text-gray-300 mb-3">
          📺 YouTube URLs (one per line)
        </label>
        {videos.length > 0 && (
          <div className="mb-3 p-3 bg-emerald-950/30 border border-emerald-800/30 rounded-xl">
            <p className="text-emerald-400 text-sm flex items-center gap-2">
              <span>💡</span>
              You have {videos.length} video{videos.length !== 1 ? 's' : ''} loaded. Use "Add More" to append new videos or "Fetch Titles" to start fresh.
            </p>
          </div>
        )}
        <textarea
          className="w-full h-44 px-5 py-4 bg-black/50 backdrop-blur-md border border-gray-800 rounded-2xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300 resize-none font-mono text-sm"
          placeholder="https://www.youtube.com/watch?v=dQw4w9WgXcQ
https://youtu.be/dQw4w9WgXcQ
https://www.youtube.com/shorts/abc123"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
        />
      </div>

      {/* Error/Success Display */}
      {error && (
        <div className={`mb-6 p-4 backdrop-blur-md rounded-2xl ${
          error.startsWith('✅')
            ? 'bg-green-950/50 border border-green-900/50'
            : 'bg-red-950/50 border border-red-900/50 animate-shake'
        }`}>
          <p className={`flex items-center gap-2 ${
            error.startsWith('✅') ? 'text-green-400' : 'text-red-400'
          }`}>
            {!error.startsWith('✅') && <span className="text-xl">⚠️</span>}
            {error}
          </p>
        </div>
      )}

      {/* Progress Bar */}
      {progress && (
        <div className="mb-6">
          <div className="flex justify-between text-sm text-gray-400 mb-2">
            <span>Processing batches...</span>
            <span>{progress.current} / {progress.total}</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2">
            <div
              className="bg-gradient-to-r from-purple-600 to-cyan-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Database Operations */}
      {isConnected && (
        <div className="mb-6 p-4 bg-emerald-950/20 border border-emerald-800/30 rounded-xl">
          <h3 className="text-emerald-400 font-semibold mb-3 flex items-center gap-2">
            <span>🗄️</span>
            Database Operations
          </h3>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={importUrlsFromDatabase}
              disabled={loading}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              📥 Import URLs from DB
            </button>
            <button
              onClick={importVideosFromDatabase}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              🎬 Import Videos with Embeddings
            </button>
            {videos.length > 0 && (
              <button
                onClick={saveVideosToDatabase}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                💾 Save Videos to DB
              </button>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-4 mb-8">
        <button
          onClick={() => fetchVideoData(false)}
          disabled={loading || !inputText.trim() || !apiKey.trim()}
          className={`px-8 py-4 rounded-2xl font-semibold transition-all duration-300 transform hover:scale-105 ${
            loading || !inputText.trim() || !apiKey.trim()
              ? 'bg-gray-800/50 text-gray-600 cursor-not-allowed'
              : 'bg-gradient-to-r from-purple-600 to-cyan-600 text-white hover:from-purple-700 hover:to-cyan-700 shadow-lg hover:shadow-purple-500/25'
          }`}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              {progress ? `Batch ${progress.current}/${progress.total}` : 'Fetching...'}
            </span>
          ) : (
            '🚀 Fetch Titles'
          )}
        </button>
        {videos.length > 0 && (
          <button
            onClick={() => fetchVideoData(true)}
            disabled={loading || !inputText.trim() || !apiKey.trim()}
            className={`px-8 py-4 rounded-2xl font-semibold transition-all duration-300 transform hover:scale-105 ${
              loading || !inputText.trim() || !apiKey.trim()
                ? 'bg-gray-800/50 text-gray-600 cursor-not-allowed'
                : 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700 shadow-lg hover:shadow-emerald-500/25'
            }`}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Appending...
              </span>
            ) : (
              '➕ Add More'
            )}
          </button>
        )}
        <button
          onClick={clearAll}
          className="px-8 py-4 bg-black/50 backdrop-blur-md border border-gray-800 text-white rounded-2xl hover:bg-gray-900/50 hover:border-gray-700 transition-all duration-300 font-semibold transform hover:scale-105"
        >
          🗑️ Clear All
        </button>
        {videos.length > 0 && (
          <>
            <button
              onClick={removeDuplicates}
              className="px-8 py-4 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-2xl hover:from-amber-700 hover:to-orange-700 transition-all duration-300 font-semibold transform hover:scale-105 shadow-lg hover:shadow-amber-500/25"
            >
              🧹 Remove Duplicates
            </button>
            <button
              onClick={exportToCSV}
              className="px-8 py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-2xl hover:from-green-700 hover:to-emerald-700 transition-all duration-300 font-semibold transform hover:scale-105 shadow-lg hover:shadow-green-500/25"
            >
              📊 Export CSV
            </button>
          </>
        )}
      </div>

      {/* Results Table */}
      {videos.length > 0 && (
        <div className="animate-fade-in">
          <div className="backdrop-blur-xl bg-black/30 rounded-2xl border border-gray-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">#</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Title</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Channel</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Duration</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {videos.map((video, index) => (
                    <tr
                      key={video.id}
                      className="hover:bg-gray-900/30 transition-colors duration-200 animate-fade-in"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {index + 1}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-200 font-medium max-w-xs truncate">
                          {video.title}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-400">
                          {video.channel}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-purple-950/50 text-purple-300 border border-purple-800/50">
                          {video.duration}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <a
                            href={video.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-xs font-semibold rounded-xl hover:from-cyan-700 hover:to-blue-700 transition-all duration-300 transform hover:scale-105"
                          >
                            Watch
                          </a>
                          <button
                            onClick={() => copyToClipboard(video.title, index)}
                            className="inline-flex items-center px-3 py-2 bg-gray-800/50 text-white text-xs font-semibold rounded-xl hover:bg-gray-700/50 transition-all duration-300 border border-gray-700"
                          >
                            {copiedIndex === index ? '✓' : '📋'}
                          </button>
                          <button
                            onClick={() => findSimilarVideos(video)}
                            className="inline-flex items-center px-3 py-2 bg-purple-800/50 text-white text-xs font-semibold rounded-xl hover:bg-purple-700/50 transition-all duration-300 border border-purple-700"
                            title="Find similar videos using AI embeddings"
                          >
                            🔍 Similar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mt-4 text-center text-gray-500 text-sm">
            Found {videos.length} video{videos.length !== 1 ? 's' : ''}
            {(() => {
              const uniqueIds = new Set(videos.map(v => v.id));
              const duplicateCount = videos.length - uniqueIds.size;
              return duplicateCount > 0 ? (
                <span className="text-amber-400 ml-2">
                  ({duplicateCount} duplicate{duplicateCount !== 1 ? 's' : ''} detected)
                </span>
              ) : null;
            })()}
          </div>
        </div>
      )}
    </>
  );

  const renderClusterDetailView = () => {
    if (!selectedCluster) return null;

    return (
      <div className="space-y-6">
        {/* Header with Back Button */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={handleBackToAnalyze}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
          >
            <span>←</span>
            Back to Analysis
          </button>
          <div>
            <h3 className="text-2xl font-semibold text-white">
              Cluster {selectedCluster.id + 1} Details
            </h3>
            <p className="text-gray-400">
              {selectedCluster.videos.length} video{selectedCluster.videos.length !== 1 ? 's' : ''} in this cluster
            </p>
          </div>
        </div>

        {/* Cluster Summary */}
        <div className="backdrop-blur-xl bg-black/30 rounded-2xl border border-gray-800 p-6">
          <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <span>📊</span>
            Cluster Summary
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h5 className="text-sm font-medium text-gray-300 mb-2">Top Keywords</h5>
              <div className="flex flex-wrap gap-2">
                {selectedCluster.summary.topWords?.map((word: string, index: number) => (
                  <span key={index} className="text-xs px-3 py-1 bg-purple-600/20 text-purple-300 rounded-full border border-purple-600/30">
                    {word}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <h5 className="text-sm font-medium text-gray-300 mb-2">Cluster Stats</h5>
              <div className="space-y-1 text-sm text-gray-400">
                <div>Videos: {selectedCluster.summary.size}</div>
                <div>Keywords: {selectedCluster.summary.topWords?.length || 0}</div>
                <div>Examples: {selectedCluster.summary.examples?.length || 0}</div>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <h5 className="text-sm font-medium text-gray-300 mb-2">Example Titles</h5>
            <div className="space-y-1">
              {selectedCluster.summary.examples?.map((example: string, index: number) => (
                <div key={index} className="text-sm text-gray-400 italic">
                  • {example}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Videos Table */}
        <div className="backdrop-blur-xl bg-black/30 rounded-2xl border border-gray-800 overflow-hidden">
          <div className="p-6 border-b border-gray-800 flex justify-between items-center">
            <h4 className="text-lg font-semibold text-white flex items-center gap-2">
              <span>📺</span>
              Videos in Cluster {selectedCluster.id + 1}
            </h4>

            <div className="flex items-center gap-3">
              {/* View Mode Toggle */}
              <div className="flex bg-gray-800 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('table')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'table'
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  📊 Table
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  🎬 Grid
                </button>
              </div>

              <button
                onClick={() => fetchThumbnails(selectedCluster.videos)}
                disabled={loadingThumbnails || !apiKey.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm rounded-lg flex items-center gap-2 transition-colors duration-200"
              >
                {loadingThumbnails ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    {thumbnailProgress || 'Loading...'}
                  </>
                ) : (
                  <>
                    <span>🖼️</span>
                    Load Thumbnails
                  </>
                )}
              </button>
            </div>
          </div>

          {viewMode === 'table' ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-900/50">
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">#</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Thumbnail</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Title</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Channel</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Duration</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {selectedCluster.videos.map((video, index) => (
                    <tr
                      key={video.id}
                      className="hover:bg-gray-900/30 transition-colors duration-200"
                    >
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {index + 1}
                      </td>
                      <td className="px-6 py-4">
                        {(() => {
                          const videoId = extractVideoId(video.url);
                          const thumbnailUrl = videoId ? thumbnails[videoId] : null;

                          if (loadingThumbnails) {
                            return (
                              <div className="w-20 h-12 bg-gray-800 rounded animate-pulse flex items-center justify-center">
                                <span className="text-xs text-gray-500">...</span>
                              </div>
                            );
                          }

                          return thumbnailUrl ? (
                            <img
                              src={thumbnailUrl}
                              alt={`Thumbnail for ${video.title}`}
                              className="w-20 h-12 object-cover rounded border border-gray-700"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="w-20 h-12 bg-gray-800 rounded flex items-center justify-center">
                              <span className="text-xs text-gray-500">No thumb</span>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-200 font-medium max-w-md">
                          {video.title}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-400">
                          {video.channel}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-purple-950/50 text-purple-300 border border-purple-800/50">
                          {video.duration}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <a
                            href={video.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-xs font-semibold rounded-xl hover:from-cyan-700 hover:to-blue-700 transition-all duration-300 transform hover:scale-105"
                          >
                            Watch
                          </a>
                          <button
                            onClick={() => copyToClipboard(video.title, index)}
                            className="inline-flex items-center px-3 py-2 bg-gray-800/50 text-white text-xs font-semibold rounded-xl hover:bg-gray-700/50 transition-all duration-300 border border-gray-700"
                          >
                            {copiedIndex === index ? '✓' : '📋'}
                          </button>
                          <button
                            onClick={() => findSimilarVideos(video)}
                            className="inline-flex items-center px-3 py-2 bg-purple-800/50 text-white text-xs font-semibold rounded-xl hover:bg-purple-700/50 transition-all duration-300 border border-purple-700"
                            title="Find similar videos using AI embeddings"
                          >
                            🔍 Similar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* YouTube-style Grid View */
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {selectedCluster.videos.map((video, index) => {
                  const videoId = extractVideoId(video.url);
                  const thumbnailUrl = videoId ? thumbnails[videoId] : null;

                  return (
                    <div
                      key={video.id}
                      className="group bg-transparent hover:bg-gray-900/20 rounded-xl transition-all duration-200 p-2 hover:scale-[1.02] cursor-pointer"
                      onClick={() => window.open(video.url, '_blank')}
                    >
                      {/* Thumbnail */}
                      <div className="relative aspect-video bg-gray-800 rounded-lg overflow-hidden mb-3">
                        {loadingThumbnails ? (
                          <div className="w-full h-full bg-gray-800 animate-pulse flex items-center justify-center">
                            <div className="text-gray-500 text-sm">Loading...</div>
                          </div>
                        ) : thumbnailUrl ? (
                          <img
                            src={thumbnailUrl}
                            alt={`Thumbnail for ${video.title}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                            <div className="text-gray-500 text-sm">No thumbnail</div>
                          </div>
                        )}

                        {/* Duration Badge */}
                        <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded">
                          {video.duration}
                        </div>
                      </div>

                      {/* Video Info */}
                      <div className="flex gap-3">
                        {/* Channel Avatar Placeholder */}
                        <div className="w-9 h-9 bg-gray-700 rounded-full flex-shrink-0 flex items-center justify-center">
                          <span className="text-xs text-gray-400">{video.channel?.charAt(0) || '?'}</span>
                        </div>

                        <div className="flex-1 min-w-0">
                          {/* Title */}
                          <h3 className="text-white text-sm font-medium leading-5 mb-1 group-hover:text-blue-400 transition-colors overflow-hidden" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                            {video.title}
                          </h3>

                          {/* Channel Name */}
                          <p className="text-gray-400 text-xs mb-1 truncate">
                            {video.channel}
                          </p>

                          {/* Actions */}
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(video.title, index);
                              }}
                              className="inline-flex items-center px-2 py-1 bg-gray-800/50 text-white text-xs rounded hover:bg-gray-700/50 transition-colors"
                            >
                              {copiedIndex === index ? '✓ Copied' : '📋 Copy'}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                findSimilarVideos(video);
                              }}
                              className="inline-flex items-center px-2 py-1 bg-purple-800/50 text-white text-xs rounded hover:bg-purple-700/50 transition-colors"
                              title="Find similar videos using AI embeddings"
                            >
                              🔍 Similar
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Additional Actions */}
        <div className="flex justify-center gap-4">
          <button
            onClick={() => {
              const csvContent = [
                ['Title', 'Channel', 'Duration', 'URL'].join(','),
                ...selectedCluster.videos.map(video =>
                  [
                    `"${video.title.replace(/"/g, '""')}"`,
                    `"${video.channel.replace(/"/g, '""')}"`,
                    video.duration,
                    video.url
                  ].join(',')
                )
              ].join('\n');

              const blob = new Blob([csvContent], { type: 'text/csv' });
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `cluster-${selectedCluster.id + 1}-videos.csv`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              window.URL.revokeObjectURL(url);
            }}
            className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:from-green-700 hover:to-emerald-700 transition-all duration-300 font-medium"
          >
            📊 Export Cluster CSV
          </button>

          <button
            onClick={handleBackToAnalyze}
            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl hover:from-purple-700 hover:to-blue-700 transition-all duration-300 font-medium"
          >
            🔍 Back to All Clusters
          </button>
        </div>
      </div>
    );
  };

  const renderExplorerTab = () => {
    return (
      <div className="space-y-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-cyan-950/30 to-teal-950/30 border border-cyan-800/30 rounded-2xl p-6">
          <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-3">
            🔍 Database Explorer
          </h2>
          <p className="text-gray-400">
            Explore all videos stored in your database with URLs, titles, thumbnails, embeddings and metadata.
          </p>
        </div>

        {/* Connection Check */}
        {!isConnected ? (
          <div className="bg-yellow-950/30 border border-yellow-800/30 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">⚠️</span>
              <h3 className="text-xl font-semibold text-yellow-400">Database Not Connected</h3>
            </div>
            <p className="text-gray-400 mb-4">
              Please connect to your ClickHouse database first to explore the data.
            </p>
            <button
              onClick={() => setActiveTab('database')}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-colors"
            >
              Go to Database Tab
            </button>
          </div>
        ) : (
          <>
            {/* Search and Controls */}
            <div className="bg-black/30 rounded-xl p-6 border border-gray-800">
              <div className="flex flex-col md:flex-row gap-4 mb-4">
                <div className="flex-1">
                  <input
                    type="text"
                    placeholder="Search by title, URL, or channel..."
                    value={explorerFilter}
                    onChange={(e) => handleExplorerSearch(e.target.value)}
                    className="w-full px-4 py-3 bg-black/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
                <button
                  onClick={() => loadExplorerData()}
                  disabled={explorerLoading}
                  className="px-6 py-3 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 text-white font-semibold rounded-lg transition-colors"
                >
                  {explorerLoading ? 'Loading...' : 'Refresh Data'}
                </button>
              </div>

              {/* Load Initial Data Button */}
              {explorerData.length === 0 && !explorerLoading && !explorerError && (
                <div className="text-center">
                  <button
                    onClick={() => loadExplorerData()}
                    className="px-8 py-4 bg-gradient-to-r from-cyan-600 to-teal-600 text-white font-semibold rounded-xl hover:from-cyan-700 hover:to-teal-700 transition-all"
                  >
                    🔍 Load Database Data
                  </button>
                </div>
              )}
            </div>

            {/* Error Display */}
            {explorerError && (
              <div className="bg-red-950/30 border border-red-800/30 rounded-xl p-4">
                <p className="text-red-400 flex items-center gap-2">
                  <span>⚠️</span>
                  {explorerError}
                </p>
              </div>
            )}

            {/* Loading State */}
            {explorerLoading && (
              <div className="bg-black/30 rounded-xl p-8 border border-gray-800 text-center">
                <div className="animate-spin w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                <p className="text-gray-400">Loading database records...</p>
              </div>
            )}

            {/* Data Table */}
            {explorerData.length > 0 && (
              <div className="bg-black/30 rounded-xl border border-gray-800 overflow-hidden">
                <div className="p-4 bg-gray-900/50 border-b border-gray-700">
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    📊 Database Records ({explorerData.length} total)
                  </h3>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-900/70">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                          <button
                            onClick={() => handleExplorerSort('added_at')}
                            className="flex items-center gap-1 hover:text-white transition-colors"
                          >
                            Added
                            {explorerSort.field === 'added_at' && (
                              <span>{explorerSort.direction === 'desc' ? '↓' : '↑'}</span>
                            )}
                          </button>
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                          Video
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                          <button
                            onClick={() => handleExplorerSort('title')}
                            className="flex items-center gap-1 hover:text-white transition-colors"
                          >
                            Title
                            {explorerSort.field === 'title' && (
                              <span>{explorerSort.direction === 'desc' ? '↓' : '↑'}</span>
                            )}
                          </button>
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                          Channel
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider text-center">
                          Embeddings
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                          <button
                            onClick={() => handleExplorerSort('views')}
                            className="flex items-center gap-1 hover:text-white transition-colors"
                          >
                            Views
                            {explorerSort.field === 'views' && (
                              <span>{explorerSort.direction === 'desc' ? '↓' : '↑'}</span>
                            )}
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {explorerData.map((video, index) => (
                        <tr key={video.video_id || index} className="hover:bg-gray-900/30 transition-colors">
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-400">
                            {video.added_at ? new Date(video.added_at).toLocaleDateString() : 'N/A'}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              {video.thumbnail_url && (
                                <img
                                  src={video.thumbnail_url}
                                  alt="Thumbnail"
                                  className="w-16 h-12 object-cover rounded border border-gray-700"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                              )}
                              <a
                                href={video.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-cyan-400 hover:text-cyan-300 text-sm underline transition-colors"
                                title={video.url}
                              >
                                📺 Open
                              </a>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-white max-w-xs">
                            <div className="truncate" title={video.title}>
                              {video.title || 'No title'}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-300 max-w-xs">
                            <div className="truncate" title={video.channel_name}>
                              {video.channel_name || 'Unknown'}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-center">
                            <div className="flex flex-col items-center gap-1">
                              {video.embedding ? (
                                <>
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-900/50 text-green-400 border border-green-800/50">
                                    ✅ Available
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    {video.embedding_dimensions}D
                                  </span>
                                  {video.embedding_model && (
                                    <span className="text-xs text-gray-600 truncate max-w-24" title={video.embedding_model}>
                                      {video.embedding_model}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-900/50 text-red-400 border border-red-800/50">
                                  ❌ Missing
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-400">
                            {video.views ? video.views.toLocaleString() : 'N/A'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                <div className="p-4 bg-gray-900/50 border-t border-gray-700 flex justify-between items-center">
                  <p className="text-sm text-gray-400">
                    Showing {explorerData.length} records
                  </p>
                  <button
                    onClick={() => {
                      const currentOffset = explorerData.length;
                      loadExplorerData(currentOffset, explorerFilter, explorerSort.field, explorerSort.direction);
                    }}
                    disabled={explorerLoading}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white text-sm rounded-lg transition-colors"
                  >
                    Load More
                  </button>
                </div>
              </div>
            )}

            {/* Empty State */}
            {explorerData.length === 0 && !explorerLoading && !explorerError && (
              <div className="bg-black/30 rounded-xl p-12 border border-gray-800 text-center">
                <div className="text-6xl mb-4">📊</div>
                <h3 className="text-xl font-semibold text-white mb-2">No Data Found</h3>
                <p className="text-gray-400 mb-6">
                  Your database appears to be empty or the connection failed.
                </p>
                <div className="flex gap-4 justify-center">
                  <button
                    onClick={() => setActiveTab('data-mining')}
                    className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl transition-colors"
                  >
                    🔍 Import Videos
                  </button>
                  <button
                    onClick={() => loadExplorerData()}
                    className="px-6 py-3 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-xl transition-colors"
                  >
                    🔄 Retry Loading
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const renderAnalyzeTab = () => {
    // Show cluster detail view if a cluster is selected
    if (selectedCluster) {
      return renderClusterDetailView();
    }

    return (
    <div className="space-y-8">
      {/* Data Source Info */}
      <div className="bg-gradient-to-r from-blue-950/30 to-purple-950/30 border border-blue-800/30 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">🔬</span>
          <h3 className="text-xl font-semibold text-white">K-Means Clustering Analysis</h3>
        </div>
        <p className="text-gray-400 mb-4">
          Analyze your YouTube video titles using K-means clustering to discover content patterns and themes.
        </p>

        {videos.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-emerald-400">
              <span>✅</span>
              <span>Ready to analyze {videos.length} video titles from Data Mining tab</span>
            </div>
            {processedTexts.length > 0 && processedTexts.every(item => item.vector && item.vector.length > 0) && (
              <div className="flex items-center gap-2 text-blue-400">
                <span>🚀</span>
                <span>
                  {processedTexts.length} videos have pre-existing embeddings ({processedTexts[0]?.vector?.length || 0}D)
                  - clustering will be instant!
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-amber-400">
            <span>⚠️</span>
            <span>No video data found. Please fetch some videos in the Data Mining tab first.</span>
          </div>
        )}
      </div>

      {/* Hugging Face API Key */}
      <div className="backdrop-blur-xl bg-black/30 rounded-2xl border border-gray-800 p-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">🤗</span>
          <h4 className="text-lg font-semibold text-white">Hugging Face API Configuration</h4>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-3">
              🔑 Hugging Face API Key (Optional)
            </label>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <input
                  type={showHuggingFaceApiKey ? "text" : "password"}
                  className="w-full px-5 py-4 bg-black/50 backdrop-blur-md border border-gray-800 rounded-2xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300"
                  placeholder="hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={huggingFaceApiKey}
                  onChange={(e) => setHuggingFaceApiKey(e.target.value)}
                />
              </div>
              <button
                onClick={() => setShowHuggingFaceApiKey(!showHuggingFaceApiKey)}
                className="px-4 py-4 bg-gray-800 hover:bg-gray-700 text-white rounded-2xl transition-all duration-300 border border-gray-700"
              >
                {showHuggingFaceApiKey ? '🙈' : '👁️'}
              </button>
              <button
                onClick={() => {
                  if (huggingFaceApiKey.trim()) {
                    localStorage.setItem('huggingface_api_key', huggingFaceApiKey.trim());
                  } else {
                    localStorage.removeItem('huggingface_api_key');
                  }
                  alert(huggingFaceApiKey.trim() ? 'Hugging Face API key saved!' : 'Hugging Face API key removed!');
                }}
                className="px-6 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl transition-all duration-300 font-medium"
              >
                💾 Save
              </button>
            </div>
          </div>

          <div className="bg-blue-950/30 border border-blue-800/50 rounded-xl p-4">
            <div className="text-sm text-blue-300">
              <div className="flex items-start gap-2 mb-2">
                <span>💡</span>
                <div>
                  <strong>Free Tier vs API Key:</strong>
                  <ul className="mt-1 space-y-1 text-xs text-blue-200">
                    <li>• <strong>Without API Key:</strong> Free tier with rate limits (~1000 requests/day)</li>
                    <li>• <strong>With API Key:</strong> Higher limits, faster processing, better reliability</li>
                    <li>• <strong>Get API Key:</strong> Sign up at <a href="https://huggingface.co" target="_blank" className="underline hover:text-blue-100">huggingface.co</a> → Settings → Access Tokens</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Google API Key */}
      <div className="backdrop-blur-xl bg-black/30 rounded-2xl border border-gray-800 p-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">✨</span>
          <h4 className="text-lg font-semibold text-white">Google Gemini API Configuration</h4>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-3">
              🔑 Google API Key (Required for Google Gemini)
            </label>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <input
                  type={showGoogleApiKey ? "text" : "password"}
                  className="w-full px-5 py-4 bg-black/50 backdrop-blur-md border border-gray-800 rounded-2xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-300"
                  placeholder="AIzaSy..."
                  value={googleApiKey}
                  onChange={(e) => setGoogleApiKey(e.target.value)}
                />
              </div>
              <button
                onClick={() => setShowGoogleApiKey(!showGoogleApiKey)}
                className="px-4 py-4 bg-gray-800 hover:bg-gray-700 text-white rounded-2xl transition-all duration-300 border border-gray-700"
              >
                {showGoogleApiKey ? '🙈' : '👁️'}
              </button>
              <button
                onClick={() => {
                  if (googleApiKey.trim()) {
                    localStorage.setItem('google_api_key', googleApiKey.trim());
                  } else {
                    localStorage.removeItem('google_api_key');
                  }
                  alert(googleApiKey.trim() ? 'Google API key saved!' : 'Google API key removed!');
                }}
                className="px-6 py-4 bg-green-600 hover:bg-green-700 text-white rounded-2xl transition-all duration-300 font-medium"
              >
                💾 Save
              </button>
            </div>
          </div>

          <div className="bg-green-950/30 border border-green-800/50 rounded-xl p-4">
            <div className="text-sm text-green-300">
              <div className="flex items-start gap-2 mb-2">
                <span>🚀</span>
                <div>
                  <strong>Google Gemini Embeddings:</strong>
                  <ul className="mt-1 space-y-1 text-xs text-green-200">
                    <li>• <strong>3072 dimensions</strong> - Highest quality embeddings available</li>
                    <li>• <strong>Fast processing</strong> - Up to 100 texts per batch</li>
                    <li>• <strong>Superior clustering</strong> - Better semantic understanding than BGE Large</li>
                    <li>• <strong>Get API Key:</strong> Visit <a href="https://aistudio.google.com/app/apikey" target="_blank" className="underline hover:text-green-100">Google AI Studio</a> → Create API Key</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Clustering Controls */}
      <div className="backdrop-blur-xl bg-black/30 rounded-2xl border border-gray-800 p-6">
        <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <span>⚙️</span>
          Clustering Parameters
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Number of Clusters (k)
            </label>
            <div className="flex gap-2">
              <select
                value={clusteringConfig.k === -1 ? 'auto' : clusteringConfig.k}
                onChange={(e) => {
                  const value = e.target.value === 'auto' ? -1 : parseInt(e.target.value);
                  setClusteringConfig(prev => ({ ...prev, k: value }));
                }}
                className="flex-1 px-4 py-3 bg-black/50 border border-gray-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-300"
              >
                <option value="auto">🤖 Auto-detect optimal K</option>
                <option value="2">2 clusters</option>
                <option value="3">3 clusters</option>
                <option value="4">4 clusters</option>
                <option value="5">5 clusters</option>
                <option value="6">6 clusters</option>
                <option value="7">7 clusters</option>
                <option value="8">8 clusters</option>
                <option value="9">9 clusters</option>
                <option value="10">10 clusters</option>
                <option value="12">12 clusters</option>
                <option value="15">15 clusters</option>
                <option value="20">20 clusters</option>
                <option value="25">25 clusters</option>
                <option value="30">30 clusters</option>
                <option value="40">40 clusters</option>
                <option value="50">50 clusters</option>
              </select>
            </div>
            {clusteringConfig.k === -1 && (
              <p className="text-xs text-blue-400 mt-1">
                Uses Elbow Method and Silhouette Analysis to find optimal number of clusters
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Clustering Algorithm
            </label>
            <select
              value={clusteringConfig.algorithm}
              onChange={(e) => setClusteringConfig(prev => ({ ...prev, algorithm: e.target.value }))}
              className="w-full px-4 py-3 bg-black/50 border border-gray-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-300"
            >
              <option value="kmeans">K-Means</option>
              <option value="kmeans++">K-Means++ (Recommended)</option>
              <option value="hierarchical">Hierarchical</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Word2Vec Approach
            </label>
            <select
              value={clusteringConfig.word2vecApproach}
              onChange={(e) => {
                const approach = e.target.value;
                setClusteringConfig(prev => ({
                  ...prev,
                  word2vecApproach: approach,
                  // Update dimensions based on approach
                  dimensions: approach === 'google-gemini' ? 768 :
                           approach === 'google-gemini-1536' ? 1536 :
                           approach === 'google-gemini-3072' ? 3072 :
                           approach === 'database' ? (processedTexts[0]?.vector?.length || 384) :
                           prev.dimensions
                }));
              }}
              className="w-full px-4 py-3 bg-black/50 border border-gray-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-300"
            >
              {/* Show database option if embeddings exist */}
              {processedTexts.length > 0 && processedTexts.every(item => item.vector && item.vector.length > 0) && (
                <option value="database">💾 Use Pre-existing Database Embeddings ({processedTexts[0]?.vector?.length || 0}D)</option>
              )}
              <option value="sentence-transformers">🚀 Sentence Transformers (Best Quality)</option>
              <option value="google-gemini">✨ Google Gemini text-embedding-004 (768D - High Quality)</option>
              <option value="google-gemini-1536">⚡ Google Gemini embedding-001 (1536D - Balanced Quality)</option>
              <option value="google-gemini-3072">🚀 Google Gemini embedding-001 (3072D - Highest Quality)</option>
              <option value="pretrained">Pre-trained Word2Vec (Fast)</option>
              <option value="custom">Train on YouTube Data (Not Implemented)</option>
              <option value="hybrid">Hybrid Approach (Not Implemented)</option>
            </select>
          </div>
        </div>

        {/* Embedding Configuration */}
        <div className="mt-6 p-4 bg-gradient-to-r from-indigo-950/20 to-purple-950/20 border border-indigo-800/30 rounded-xl">
          <h5 className="text-md font-semibold text-white mb-3 flex items-center gap-2">
            <span>🧠</span>
            {clusteringConfig.word2vecApproach === 'sentence-transformers' ? 'Sentence Transformer' :
             clusteringConfig.word2vecApproach === 'google-gemini' ? 'Google Gemini (768D)' :
             clusteringConfig.word2vecApproach === 'google-gemini-1536' ? 'Google Gemini (1536D)' :
             clusteringConfig.word2vecApproach === 'google-gemini-3072' ? 'Google Gemini (3072D)' :
             clusteringConfig.word2vecApproach === 'database' ? 'Database Embeddings' : 'Word2Vec'} Configuration
          </h5>

          {clusteringConfig.word2vecApproach === 'database' ? (
            <>
              <div className="text-xs text-blue-400 p-3 bg-blue-950/30 rounded-lg mb-4 border border-blue-800/30">
                <strong>💾 Using Pre-existing Database Embeddings:</strong> Clustering will use embeddings already stored in the database.
                This is instant and preserves the exact same embeddings used in previous analyses.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-300">
                <div>
                  <strong>Videos:</strong> {processedTexts.length}
                </div>
                <div>
                  <strong>Dimensions:</strong> {processedTexts[0]?.vector?.length || 0}D
                </div>
                <div>
                  <strong>Model:</strong> {processedTexts[0]?.model || 'Unknown'}
                </div>
              </div>
            </>
          ) : clusteringConfig.word2vecApproach === 'sentence-transformers' ? (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Model
                </label>
                <select
                  value={clusteringConfig.sentenceTransformerModel}
                  onChange={(e) => {
                    const model = e.target.value;
                    let dimensions = 384; // default

                    // Set appropriate dimensions based on model
                    if (model === 'BAAI/bge-base-en-v1.5') {
                      dimensions = 768;
                    } else if (model === 'BAAI/bge-large-en-v1.5') {
                      dimensions = 1024;
                    } else if (model === 'BAAI/bge-small-en-v1.5' || model === 'all-MiniLM-L6-v2') {
                      dimensions = 384;
                    }

                    setClusteringConfig({
                      ...clusteringConfig,
                      sentenceTransformerModel: model,
                      dimensions: dimensions
                    });
                  }}
                  className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="BAAI/bge-small-en-v1.5">BGE Small (Fast, 384D) - Current Default</option>
                  <option value="BAAI/bge-base-en-v1.5">BGE Base (Better, 768D) - ⭐ RECOMMENDED for Deeper Clustering</option>
                  <option value="BAAI/bge-large-en-v1.5">BGE Large (Best, 1024D) - Highest Quality</option>
                  <option value="all-MiniLM-L6-v2">MiniLM-L6 (384D) - Returns Similarity Scores</option>
                </select>
              </div>

              <div className="text-xs text-gray-400 p-2 bg-black/20 rounded-lg">
                <strong>✨ Advantages:</strong> Understands full sentence context, pre-trained on millions of texts,
                much better semantic understanding, handles phrases like "Apple stock" vs "Apple fruit" differently.
              </div>
            </>
          ) : clusteringConfig.word2vecApproach === 'google-gemini' || clusteringConfig.word2vecApproach === 'google-gemini-1536' || clusteringConfig.word2vecApproach === 'google-gemini-3072' ? (
            <>
              <div className="text-xs text-green-400 p-3 bg-green-950/30 rounded-lg mb-4 border border-green-800/30">
                <strong>🚀 Google Gemini Embeddings:</strong> {
                  clusteringConfig.word2vecApproach === 'google-gemini'
                    ? 'Fast 768-dimensional embeddings from Google\'s text-embedding-004 model. Good quality with better speed.'
                    : clusteringConfig.word2vecApproach === 'google-gemini-1536'
                    ? 'Balanced 1536-dimensional embeddings from Google\'s gemini-embedding-001 model. Great quality-performance trade-off.'
                    : 'State-of-the-art 3072-dimensional embeddings from Google\'s gemini-embedding-001 model. Highest quality semantic understanding.'
                }
              </div>

              <div className="text-sm text-gray-300 mb-3">
                <strong>Model:</strong> {
                  clusteringConfig.word2vecApproach === 'google-gemini'
                    ? 'text-embedding-004 (768 dimensions)'
                    : clusteringConfig.word2vecApproach === 'google-gemini-1536'
                    ? 'gemini-embedding-001 (1536 dimensions)'
                    : 'gemini-embedding-001 (3072 dimensions)'
                }
              </div>

              {/* Google API Rate Limiting Controls */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Batch Size
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={clusteringConfig.googleBatchSize}
                    onChange={(e) => setClusteringConfig(prev => ({ ...prev, googleBatchSize: parseInt(e.target.value) || 25 }))}
                    className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="25"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Requests per batch (1-100). Lower = more reliable for free tier.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Batch Delay (ms)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="5000"
                    step="100"
                    value={clusteringConfig.googleBatchDelay}
                    onChange={(e) => setClusteringConfig(prev => ({ ...prev, googleBatchDelay: parseInt(e.target.value) || 1000 }))}
                    className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="1000"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Delay between batches. Increase if hitting rate limits.
                  </p>
                </div>
              </div>

              <div className="text-xs text-gray-400 mt-3 p-2 bg-black/20 rounded-lg">
                <strong>💡 Rate Limiting Tips:</strong>
                <ul className="mt-1 space-y-1">
                  <li>• <strong>Free tier:</strong> Use batch size 10-25, delay 1000-2000ms</li>
                  <li>• <strong>Paid tier:</strong> Use batch size 50-100, delay 200-500ms</li>
                  <li>• <strong>Hitting limits:</strong> Reduce batch size or increase delay</li>
                </ul>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Embedding Dimensions
                  </label>
                  <select
                    value={clusteringConfig.dimensions}
                    onChange={(e) => setClusteringConfig(prev => ({ ...prev, dimensions: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="50">50D (Fast)</option>
                    <option value="100">100D (Balanced)</option>
                    <option value="200">200D (Detailed)</option>
                    <option value="300">300D (High Quality)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Aggregation Method
                  </label>
                  <select
                    value={clusteringConfig.aggregation}
                    onChange={(e) => setClusteringConfig(prev => ({ ...prev, aggregation: e.target.value }))}
                    className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="mean">Mean (Average)</option>
                    <option value="sum">Sum</option>
                    <option value="max">Max Pooling</option>
                    <option value="tfidf">TF-IDF Weighted</option>
                  </select>
                </div>
              </div>

              <div className="text-xs text-gray-400 p-2 bg-black/20 rounded-lg">
                <strong>⚠️ Limitations:</strong> Only 37 words in vocabulary, cannot understand context,
                poor coverage for many YouTube titles.
              </div>
            </>
          )}
        </div>

        {clusteringConfig.word2vecApproach !== 'sentence-transformers' && clusteringConfig.word2vecApproach !== 'google-gemini' && (
          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Text Processing Options
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={clusteringConfig.removeStopwords}
                  onChange={(e) => setClusteringConfig(prev => ({ ...prev, removeStopwords: e.target.checked }))}
                  className="rounded bg-black/50 border-gray-800 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-gray-300 text-sm">Remove stop words</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={clusteringConfig.stemWords}
                  onChange={(e) => setClusteringConfig(prev => ({ ...prev, stemWords: e.target.checked }))}
                  className="rounded bg-black/50 border-gray-800 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-gray-300 text-sm">Stem words</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={clusteringConfig.lowercase}
                  onChange={(e) => setClusteringConfig(prev => ({ ...prev, lowercase: e.target.checked }))}
                  className="rounded bg-black/50 border-gray-800 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-gray-300 text-sm">Lowercase</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={clusteringConfig.handleUnknown}
                  onChange={(e) => setClusteringConfig(prev => ({ ...prev, handleUnknown: e.target.checked }))}
                  className="rounded bg-black/50 border-gray-800 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-gray-300 text-sm">Handle unknown words</span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Enhanced Progress Display */}
      {clusteringProgress && (
        <div className="backdrop-blur-xl bg-black/30 rounded-2xl border border-gray-800 p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl animate-pulse">⚡</span>
            <div>
              <h4 className="text-lg font-semibold text-white">Clustering Analysis in Progress</h4>
              <p className="text-xs text-gray-400">Advanced machine learning pipeline processing</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Current Status Message */}
            <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-700/50">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                  <span className="text-gray-200 font-medium">{clusteringProgress.message}</span>
                </div>
                {clusteringProgress.progress && (
                  <span className="text-blue-400 font-bold text-lg">{clusteringProgress.progress}%</span>
                )}
              </div>
            </div>

            {/* Progress Bar */}
            {clusteringProgress.progress && (
              <div className="w-full bg-gray-800 rounded-full h-4 border border-gray-700/50">
                <div
                  className="bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500 h-4 rounded-full transition-all duration-1000 ease-out relative overflow-hidden"
                  style={{ width: `${clusteringProgress.progress}%` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse"></div>
                </div>
              </div>
            )}

            {/* Detailed Stage Indicators */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
              <div className={`text-center p-3 rounded-lg transition-all duration-300 ${
                clusteringProgress.stage === 'initialization' || clusteringProgress.stage === 'config' || (clusteringProgress.progress && clusteringProgress.progress >= 5)
                  ? 'bg-blue-600/20 text-blue-300 border border-blue-600/30 shadow-lg shadow-blue-600/10'
                  : 'bg-gray-800/50 text-gray-500 border border-gray-700'
              }`}>
                <div className="text-lg mb-1">🚀</div>
                <div className="font-medium">Initialize</div>
              </div>

              <div className={`text-center p-3 rounded-lg transition-all duration-300 ${
                clusteringProgress.stage === 'embeddings' || (clusteringProgress.progress && clusteringProgress.progress >= 15)
                  ? 'bg-purple-600/20 text-purple-300 border border-purple-600/30 shadow-lg shadow-purple-600/10'
                  : 'bg-gray-800/50 text-gray-500 border border-gray-700'
              }`}>
                <div className="text-lg mb-1">🧠</div>
                <div className="font-medium">Embeddings</div>
              </div>

              <div className={`text-center p-3 rounded-lg transition-all duration-300 ${
                clusteringProgress.stage === 'k-optimization' || (clusteringProgress.progress && clusteringProgress.progress >= 60 && clusteringProgress.progress < 70)
                  ? 'bg-yellow-600/20 text-yellow-300 border border-yellow-600/30 shadow-lg shadow-yellow-600/10'
                  : 'bg-gray-800/50 text-gray-500 border border-gray-700'
              }`}>
                <div className="text-lg mb-1">📊</div>
                <div className="font-medium">K-Optimize</div>
              </div>

              <div className={`text-center p-3 rounded-lg transition-all duration-300 ${
                clusteringProgress.stage === 'clustering' || (clusteringProgress.progress && clusteringProgress.progress >= 70 && clusteringProgress.progress < 90)
                  ? 'bg-green-600/20 text-green-300 border border-green-600/30 shadow-lg shadow-green-600/10'
                  : 'bg-gray-800/50 text-gray-500 border border-gray-700'
              }`}>
                <div className="text-lg mb-1">🎯</div>
                <div className="font-medium">Clustering</div>
              </div>

              <div className={`text-center p-3 rounded-lg transition-all duration-300 ${
                clusteringProgress.stage === 'post-processing' || (clusteringProgress.progress && clusteringProgress.progress >= 90 && clusteringProgress.progress < 100)
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-600/30 shadow-lg shadow-indigo-600/10'
                  : 'bg-gray-800/50 text-gray-500 border border-gray-700'
              }`}>
                <div className="text-lg mb-1">⚙️</div>
                <div className="font-medium">Processing</div>
              </div>

              <div className={`text-center p-3 rounded-lg transition-all duration-300 ${
                clusteringProgress.stage === 'completed' || (clusteringProgress.progress && clusteringProgress.progress >= 100)
                  ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-600/30 shadow-lg shadow-emerald-600/10'
                  : 'bg-gray-800/50 text-gray-500 border border-gray-700'
              }`}>
                <div className="text-lg mb-1">✅</div>
                <div className="font-medium">Complete</div>
              </div>
            </div>

            {/* Stage Details */}
            <div className="text-xs text-gray-400 text-center bg-gray-900/30 rounded-lg p-3">
              {clusteringProgress.stage === 'initialization' && "Setting up analysis environment and validating input data"}
              {clusteringProgress.stage === 'config' && "Configuring machine learning models and parameters"}
              {clusteringProgress.stage === 'embeddings' && "Converting text to high-dimensional vector representations"}
              {clusteringProgress.stage === 'k-optimization' && "Automatically determining optimal number of clusters"}
              {clusteringProgress.stage === 'clustering' && "Applying machine learning algorithms to group similar videos"}
              {clusteringProgress.stage === 'post-processing' && "Analyzing results and generating cluster insights"}
              {clusteringProgress.stage === 'completed' && "Analysis complete! Ready to explore your video clusters"}
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-center">
        <button
          onClick={runClustering}
          disabled={videos.length === 0 || isClusteringLoading}
          className={`px-8 py-4 rounded-2xl font-semibold transition-all duration-300 transform hover:scale-105 ${
            videos.length === 0 || isClusteringLoading
              ? 'bg-gray-800/50 text-gray-600 cursor-not-allowed'
              : 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-blue-500/25'
          }`}
        >
          {isClusteringLoading ? (
            <span className="flex items-center gap-3">
              <span className="inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <div className="text-left">
                <div className="text-sm font-medium">
                  {clusteringProgress?.stage === 'initialization' && '🚀 Initializing...'}
                  {clusteringProgress?.stage === 'config' && '⚙️ Configuring...'}
                  {clusteringProgress?.stage === 'embeddings' && '🧠 Processing Embeddings...'}
                  {clusteringProgress?.stage === 'k-optimization' && '📊 Optimizing K Value...'}
                  {clusteringProgress?.stage === 'clustering' && '🎯 Clustering Videos...'}
                  {clusteringProgress?.stage === 'post-processing' && '⚙️ Finalizing Results...'}
                  {clusteringProgress?.stage === 'completed' && '✅ Complete!'}
                  {!clusteringProgress?.stage && 'Processing...'}
                </div>
                {clusteringProgress?.progress && (
                  <div className="text-xs text-blue-200 opacity-80">
                    {clusteringProgress.progress}% complete
                  </div>
                )}
              </div>
            </span>
          ) : (
            '🧮 Run K-Means Analysis'
          )}
        </button>
      </div>

      {/* Error Display */}
      {clusteringError && (
        <div className="bg-red-950/30 border border-red-800/50 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-red-400 text-xl">⚠️</span>
            <h4 className="text-red-300 font-semibold">Clustering Error</h4>
          </div>
          <p className="text-red-200 text-sm">{clusteringError}</p>
        </div>
      )}

      {/* Results Display */}
      {clusteringResults ? (
        <div className="space-y-6">
          {/* K Optimization Results */}
          {kOptimizationResults && (
            <div className="backdrop-blur-xl bg-black/30 rounded-2xl border border-gray-800 p-6">
              <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <span>🤖</span>
                Optimal K Analysis
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="text-center mb-4">
                    <div className="text-3xl font-bold text-blue-400">{kOptimizationResults.optimalK}</div>
                    <div className="text-sm text-gray-400">Recommended Clusters</div>
                  </div>
                  <p className="text-xs text-gray-300 bg-gray-900/50 p-3 rounded-lg">
                    {kOptimizationResults.reasoning}
                  </p>
                </div>

                <div>
                  <h5 className="text-sm font-medium text-gray-300 mb-2">Method Scores</h5>
                  <div className="space-y-2">
                    {kOptimizationResults.recommendations.map((rec: any, index: number) => (
                      <div key={index} className="flex justify-between items-center bg-gray-900/30 p-2 rounded">
                        <span className="text-xs text-gray-400">
                          {rec.method === 'elbow' ? '📈 Elbow' : '🎯 Silhouette'} K={rec.k}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-300">{rec.score != null ? rec.score.toFixed(3) : 'N/A'}</span>
                          <span className={`text-xs px-2 py-1 rounded ${
                            rec.confidence === 'high' ? 'bg-green-600/20 text-green-300' :
                            rec.confidence === 'medium' ? 'bg-yellow-600/20 text-yellow-300' :
                            'bg-gray-600/20 text-gray-300'
                          }`}>
                            {rec.confidence}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Summary Statistics */}
          <div className="backdrop-blur-xl bg-black/30 rounded-2xl border border-gray-800 p-6">
            <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span>📊</span>
              Clustering Summary
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-400">{clusteringResults.clusters.length}</div>
                <div className="text-sm text-gray-400">Clusters</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-400">{clusteringResults.statistics.totalVideos}</div>
                <div className="text-sm text-gray-400">Videos</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-400">{clusteringResults.statistics.avgCoverage != null ? clusteringResults.statistics.avgCoverage.toFixed(1) : '100.0'}%</div>
                <div className="text-sm text-gray-400">Word Coverage</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-400">{clusteringResults.statistics.processingTime}ms</div>
                <div className="text-sm text-gray-400">Processing Time</div>
              </div>
            </div>

            {/* Database Save Button */}
            {isConnected && (
              <div className="mt-6 pt-4 border-t border-gray-700">
                <button
                  onClick={saveAnalysisResults}
                  className="w-full px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold rounded-xl transition-all duration-300 flex items-center justify-center gap-2"
                >
                  <span>💾</span>
                  Save Analysis Results to Database
                </button>
              </div>
            )}
          </div>

          {/* Interactive Visualization */}
          <ClusteringCanvas
            videos={videos}
            clusteringResults={clusteringResults}
            clusterSummaries={clusterSummaries}
          />

          {/* Cluster Details */}
          <div className="backdrop-blur-xl bg-black/30 rounded-2xl border border-gray-800 p-6">
            <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span>🎯</span>
              Cluster Analysis
            </h4>
            <p className="text-sm text-gray-400 mb-4">
              Click on any cluster to view detailed video list and analysis
            </p>
            <div className="space-y-4">
              {clusterSummaries.map((summary) => (
                <div
                  key={summary.id}
                  className="bg-gray-900/50 rounded-xl p-4 border border-gray-700 hover:border-blue-600/50 hover:bg-gray-800/50 transition-all duration-300 cursor-pointer transform hover:scale-105"
                  onClick={() => handleClusterClick(summary.id)}
                >
                  <div className="flex justify-between items-start mb-3">
                    <h5 className="text-white font-semibold flex items-center gap-2">
                      Cluster {summary.id + 1}
                      <span className="text-blue-400 text-sm">→</span>
                    </h5>
                    <span className="text-xs px-2 py-1 bg-blue-600/20 text-blue-300 rounded-full border border-blue-600/30">
                      {summary.size} videos
                    </span>
                  </div>

                  <div className="mb-3">
                    <h6 className="text-gray-300 text-sm font-medium mb-1">Top Keywords:</h6>
                    <div className="flex flex-wrap gap-1">
                      {summary.topWords.map((word, index) => (
                        <span key={index} className="text-xs px-2 py-1 bg-purple-600/20 text-purple-300 rounded border border-purple-600/30">
                          {word}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h6 className="text-gray-300 text-sm font-medium mb-1">Example Titles:</h6>
                    <div className="space-y-1">
                      {summary.examples.map((example, index) => (
                        <div key={index} className="text-xs text-gray-400 italic">
                          • {example}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="backdrop-blur-xl bg-black/30 rounded-2xl border border-gray-800 p-8 text-center">
          <div className="text-gray-500">
            <span className="text-4xl mb-4 block">📈</span>
            <p className="text-lg">Clustering results will appear here</p>
            <p className="text-sm mt-2">Run analysis to see clusters, word clouds, and insights</p>
          </div>
        </div>
      )}
    </div>
    );
  };

  return (
    <main className="min-h-screen relative overflow-hidden bg-black">
      {/* Subtle animated gradient overlay */}
      <div className="fixed inset-0">
        <div className="absolute inset-0 bg-black" />
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-0 -left-4 w-96 h-96 bg-purple-600 rounded-full mix-blend-screen filter blur-3xl animate-blob" />
          <div className="absolute top-0 -right-4 w-96 h-96 bg-cyan-600 rounded-full mix-blend-screen filter blur-3xl animate-blob animation-delay-2000" />
          <div className="absolute -bottom-8 left-20 w-96 h-96 bg-indigo-600 rounded-full mix-blend-screen filter blur-3xl animate-blob animation-delay-4000" />
        </div>
        {/* Grid pattern overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px]" />
      </div>

      <div className="relative z-10 min-h-screen py-12 px-4">
        <div className="max-w-7xl mx-auto">
          {/* Tab Navigation */}
          <div className="flex justify-center mb-8">
            <div className="bg-black/50 backdrop-blur-md border border-gray-800 rounded-2xl p-1 flex gap-1">
              <button
                onClick={() => setActiveTab('database')}
                className={`px-6 py-3 rounded-xl font-semibold transition-all duration-300 ${
                  activeTab === 'database'
                    ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-lg'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                }`}
              >
                🗄️ Database
              </button>
              <button
                onClick={() => setActiveTab('data-mining')}
                className={`px-6 py-3 rounded-xl font-semibold transition-all duration-300 ${
                  activeTab === 'data-mining'
                    ? 'bg-gradient-to-r from-purple-600 to-cyan-600 text-white shadow-lg'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                }`}
              >
                🔍 Data Mining
              </button>
              <button
                onClick={() => setActiveTab('analyze')}
                className={`px-6 py-3 rounded-xl font-semibold transition-all duration-300 ${
                  activeTab === 'analyze'
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                }`}
              >
                📊 Analyze
              </button>
              <button
                onClick={() => setActiveTab('explorer')}
                className={`px-6 py-3 rounded-xl font-semibold transition-all duration-300 ${
                  activeTab === 'explorer'
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                }`}
              >
                🔍 Explorer
              </button>
            </div>
          </div>

          {/* Main Content */}
          <div className="backdrop-blur-xl bg-gray-900/50 rounded-3xl shadow-2xl border border-gray-800 p-8 animate-fade-in">
            {activeTab === 'database' ? renderDatabaseTab() :
             activeTab === 'data-mining' ? renderDataMiningTab() :
             activeTab === 'explorer' ? renderExplorerTab() : renderAnalyzeTab()}
          </div>

          {/* Footer */}
          <div className="text-center mt-12 text-gray-600 text-sm animate-fade-in">
            <p>Built with Next.js • Styled with Tailwind CSS</p>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes blob {
          0% {
            transform: translate(0px, 0px) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
          100% {
            transform: translate(0px, 0px) scale(1);
          }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes fade-in-down {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes shake {
          0%, 100% {
            transform: translateX(0);
          }
          10%, 30%, 50%, 70%, 90% {
            transform: translateX(-2px);
          }
          20%, 40%, 60%, 80% {
            transform: translateX(2px);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.6s ease-out;
        }
        .animate-fade-in-down {
          animation: fade-in-down 0.6s ease-out;
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
      `}</style>

      {/* Similarity Results Modal */}
      {showSimilarityModal && similarVideos && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-800 max-w-4xl w-full max-h-[80vh] overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-800 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  🔍 Similar Videos
                </h3>
                <p className="text-sm text-gray-400 mt-1">
                  Most similar to: <span className="text-white font-medium">"{similarVideos.query.title}"</span>
                </p>
              </div>
              <button
                onClick={() => {
                  setShowSimilarityModal(false);
                  setSimilarVideos(null);
                }}
                className="text-gray-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Results List */}
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <div className="space-y-4">
                {similarVideos.results.map((result, index) => (
                  <div
                    key={result.video.id}
                    className="flex items-center gap-4 p-4 bg-gray-800/30 rounded-xl border border-gray-800/50 hover:bg-gray-800/50 transition-colors"
                  >
                    {/* Rank & Similarity Score */}
                    <div className="flex flex-col items-center min-w-0">
                      <div className="text-lg font-bold text-blue-400">#{index + 1}</div>
                      <div className="text-xs text-gray-400">
                        {(result.similarity * 100).toFixed(1)}%
                      </div>
                    </div>

                    {/* Video Info */}
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-white leading-5 overflow-hidden" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {result.video.title}
                      </h4>
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                        <span>{result.video.channel}</span>
                        <span>{result.video.duration}</span>
                        <span className="bg-purple-900/50 text-purple-300 px-2 py-1 rounded">
                          Cluster {result.clusterId + 1}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <a
                        href={result.video.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg transition-colors"
                      >
                        Watch
                      </a>
                      <button
                        onClick={() => findSimilarVideos(result.video)}
                        className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded-lg transition-colors"
                        title="Find videos similar to this one"
                      >
                        🔍 More Like This
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-800 bg-gray-900/50">
              <p className="text-xs text-gray-400 text-center">
                Similarity calculated using AI embeddings • Higher percentages = more similar content
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Save Progress Modal */}
      {saveProgress.isActive && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-800 max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <span>💾</span>
              Saving to Database
            </h3>

            <div className="space-y-4">
              {/* Progress message */}
              <p className="text-gray-300 text-sm">
                {saveProgress.message}
              </p>

              {/* Progress bar */}
              <div className="w-full bg-gray-800 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all duration-500 ${
                    saveProgress.error ? 'bg-red-600' : 'bg-emerald-600'
                  }`}
                  style={{
                    width: `${
                      saveProgress.total > 0
                        ? (saveProgress.current / saveProgress.total) * 100
                        : 0
                    }%`
                  }}
                />
              </div>

              {/* Progress stats */}
              {saveProgress.total > 0 && !saveProgress.error && (
                <div className="text-center text-sm text-gray-400">
                  {saveProgress.current} / {saveProgress.total} videos processed
                </div>
              )}

              {/* Error display */}
              {saveProgress.error && (
                <div className="bg-red-600/10 border border-red-600/30 rounded-lg p-3">
                  <p className="text-red-400 text-sm">{saveProgress.error}</p>
                </div>
              )}

              {/* Success animation */}
              {saveProgress.message.includes('✅') && (
                <div className="text-center">
                  <div className="inline-block animate-bounce text-4xl">✅</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}