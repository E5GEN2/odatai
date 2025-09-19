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
  const [activeTab, setActiveTab] = useState<'data-mining' | 'analyze'>('data-mining');
  const [inputText, setInputText] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [videos, setVideos] = useState<VideoData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
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
    dimensions: 384,
    aggregation: 'mean',
    removeStopwords: true,
    stemWords: true,
    lowercase: true,
    handleUnknown: false
  });
  const [kOptimizationResults, setKOptimizationResults] = useState<any>(null);
  const [selectedCluster, setSelectedCluster] = useState<{
    id: number;
    summary: any;
    videos: VideoData[];
  } | null>(null);

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
  };

  const handleBackToAnalyze = () => {
    setSelectedCluster(null);
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
        dimensions: clusteringConfig.dimensions,
        aggregation: clusteringConfig.aggregation as 'mean' | 'sum' | 'max' | 'tfidf',
        removeStopwords: clusteringConfig.removeStopwords,
        stemWords: clusteringConfig.stemWords,
        lowercase: clusteringConfig.lowercase,
        handleUnknown: clusteringConfig.handleUnknown
      };

      console.log('Starting clustering with streaming progress:', { word2vecConfig, clusteringConfig });

      // Use streaming API for real-time progress updates
      const response = await fetch('/api/clustering-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          titles,
          word2vecConfig,
          clusteringConfig
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

  // Load API key from localStorage on mount
  useEffect(() => {
    const savedKey = localStorage.getItem('youtube_api_key');
    if (savedKey) {
      setApiKey(savedKey);
    }
  }, []);

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
          <div className="p-6 border-b border-gray-800">
            <h4 className="text-lg font-semibold text-white flex items-center gap-2">
              <span>📺</span>
              Videos in Cluster {selectedCluster.id + 1}
            </h4>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-900/50">
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">#</th>
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
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
          <div className="flex items-center gap-2 text-emerald-400">
            <span>✅</span>
            <span>Ready to analyze {videos.length} video titles from Data Mining tab</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-amber-400">
            <span>⚠️</span>
            <span>No video data found. Please fetch some videos in the Data Mining tab first.</span>
          </div>
        )}
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
              onChange={(e) => setClusteringConfig(prev => ({ ...prev, word2vecApproach: e.target.value }))}
              className="w-full px-4 py-3 bg-black/50 border border-gray-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-300"
            >
              <option value="sentence-transformers">🚀 Sentence Transformers (Best Quality)</option>
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
            {clusteringConfig.word2vecApproach === 'sentence-transformers' ? 'Sentence Transformer' : 'Word2Vec'} Configuration
          </h5>

          {clusteringConfig.word2vecApproach === 'sentence-transformers' ? (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Model
                </label>
                <select className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="all-MiniLM-L6-v2">all-MiniLM-L6-v2 (Fast, 384D)</option>
                  <option value="all-mpnet-base-v2">all-mpnet-base-v2 (Best Quality, 768D)</option>
                  <option value="paraphrase-multilingual">Multilingual Support (384D)</option>
                </select>
              </div>

              <div className="text-xs text-gray-400 p-2 bg-black/20 rounded-lg">
                <strong>✨ Advantages:</strong> Understands full sentence context, pre-trained on millions of texts,
                much better semantic understanding, handles phrases like "Apple stock" vs "Apple fruit" differently.
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

        {clusteringConfig.word2vecApproach !== 'sentence-transformers' && (
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
                          <span className="text-xs text-gray-300">{rec.score.toFixed(3)}</span>
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
                <div className="text-2xl font-bold text-purple-400">{clusteringResults.statistics.avgCoverage.toFixed(1)}%</div>
                <div className="text-sm text-gray-400">Word Coverage</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-400">{clusteringResults.statistics.processingTime}ms</div>
                <div className="text-sm text-gray-400">Processing Time</div>
              </div>
            </div>
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
            </div>
          </div>

          {/* Main Content */}
          <div className="backdrop-blur-xl bg-gray-900/50 rounded-3xl shadow-2xl border border-gray-800 p-8 animate-fade-in">
            {activeTab === 'data-mining' ? renderDataMiningTab() : renderAnalyzeTab()}
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
    </main>
  );
}