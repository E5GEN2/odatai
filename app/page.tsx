'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';

interface VideoData {
  id: string;
  title: string;
  url: string;
  channel: string;
  duration: string;
}

export default function Home() {
  const [inputText, setInputText] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [videos, setVideos] = useState<VideoData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

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

  const fetchVideoData = async () => {
    setLoading(true);
    setError('');
    setVideos([]);

    if (!apiKey.trim()) {
      setError('Please enter your YouTube API key');
      setLoading(false);
      return;
    }

    const lines = inputText.trim().split('\n').filter(line => line.trim());
    const videoIds: { id: string; originalUrl: string }[] = [];

    for (const line of lines) {
      const videoId = extractVideoId(line.trim());
      if (videoId) {
        videoIds.push({ id: videoId, originalUrl: line.trim() });
      }
    }

    if (videoIds.length === 0) {
      setError('No valid YouTube URLs found');
      setLoading(false);
      return;
    }

    try {
      const response = await axios.get(
        `https://www.googleapis.com/youtube/v3/videos`,
        {
          params: {
            part: 'snippet,contentDetails',
            id: videoIds.map(v => v.id).join(','),
            key: apiKey
          }
        }
      );

      const videoData: VideoData[] = response.data.items.map((item: any) => {
        const originalVideo = videoIds.find(v => v.id === item.id);
        return {
          id: item.id,
          title: item.snippet.title,
          url: originalVideo?.originalUrl || `https://youtube.com/watch?v=${item.id}`,
          channel: item.snippet.channelTitle,
          duration: formatDuration(item.contentDetails.duration)
        };
      });

      setVideos(videoData);

      // Save API key to localStorage for convenience (optional)
      if (typeof window !== 'undefined') {
        localStorage.setItem('youtube_api_key', apiKey);
      }
    } catch (err: any) {
      console.error('Error fetching video data:', err);
      if (err.response?.status === 403) {
        setError('API key invalid or quota exceeded. Please check your YouTube API key.');
      } else if (err.response?.status === 400) {
        setError('Invalid request. Please check your API key and video URLs.');
      } else {
        setError('Failed to fetch video data. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const clearAll = () => {
    setInputText('');
    setVideos([]);
    setError('');
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

  // Load API key from localStorage on mount
  useEffect(() => {
    const savedKey = localStorage.getItem('youtube_api_key');
    if (savedKey) {
      setApiKey(savedKey);
    }
  }, []);

  return (
    <main className="min-h-screen relative overflow-hidden">
      {/* Animated gradient background */}
      <div className="fixed inset-0 bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
        <div className="absolute inset-0">
          <div className="absolute top-0 -left-4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob" />
          <div className="absolute top-0 -right-4 w-96 h-96 bg-yellow-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000" />
          <div className="absolute -bottom-8 left-20 w-96 h-96 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000" />
        </div>
      </div>

      <div className="relative z-10 min-h-screen py-12 px-4">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12 animate-fade-in-down">
            <h1 className="text-6xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-400 via-purple-400 to-indigo-400 mb-4 tracking-tight">
              YouTube Title Fetcher
            </h1>
            <p className="text-xl text-gray-300 font-light">
              Extract video titles in bulk with style ✨
            </p>
          </div>

          {/* Main Card */}
          <div className="backdrop-blur-xl bg-white/10 rounded-3xl shadow-2xl border border-white/20 p-8 animate-fade-in">
            {/* API Key Input */}
            <div className="mb-8">
              <label className="block text-sm font-medium text-gray-200 mb-3">
                🔑 YouTube API Key
              </label>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <input
                    type={showApiKey ? "text" : "password"}
                    className="w-full px-5 py-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300"
                    placeholder="Enter your YouTube Data API v3 key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </div>
                <button
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="px-6 py-4 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-2xl hover:bg-white/20 transition-all duration-300 font-medium"
                >
                  {showApiKey ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-400">
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
              <label className="block text-sm font-medium text-gray-200 mb-3">
                📺 YouTube URLs (one per line)
              </label>
              <textarea
                className="w-full h-44 px-5 py-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300 resize-none"
                placeholder="https://www.youtube.com/watch?v=dQw4w9WgXcQ
https://youtu.be/dQw4w9WgXcQ
https://www.youtube.com/shorts/abc123"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
              />
            </div>

            {/* Error Display */}
            {error && (
              <div className="mb-6 p-4 bg-red-500/20 backdrop-blur-md border border-red-500/30 rounded-2xl animate-shake">
                <p className="text-red-300 flex items-center gap-2">
                  <span className="text-xl">⚠️</span>
                  {error}
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-4 mb-8">
              <button
                onClick={fetchVideoData}
                disabled={loading || !inputText.trim() || !apiKey.trim()}
                className={`px-8 py-4 rounded-2xl font-semibold transition-all duration-300 transform hover:scale-105 ${
                  loading || !inputText.trim() || !apiKey.trim()
                    ? 'bg-gray-600/50 text-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700 shadow-lg hover:shadow-purple-500/25'
                }`}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Fetching...
                  </span>
                ) : (
                  '🚀 Fetch Titles'
                )}
              </button>
              <button
                onClick={clearAll}
                className="px-8 py-4 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-2xl hover:bg-white/20 transition-all duration-300 font-semibold transform hover:scale-105"
              >
                🗑️ Clear All
              </button>
              {videos.length > 0 && (
                <button
                  onClick={exportToCSV}
                  className="px-8 py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-2xl hover:from-green-700 hover:to-emerald-700 transition-all duration-300 font-semibold transform hover:scale-105 shadow-lg hover:shadow-green-500/25"
                >
                  📊 Export CSV
                </button>
              )}
            </div>

            {/* Results Table */}
            {videos.length > 0 && (
              <div className="animate-fade-in">
                <div className="backdrop-blur-xl bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="px-6 py-4 text-left text-xs font-bold text-gray-300 uppercase tracking-wider">#</th>
                          <th className="px-6 py-4 text-left text-xs font-bold text-gray-300 uppercase tracking-wider">Title</th>
                          <th className="px-6 py-4 text-left text-xs font-bold text-gray-300 uppercase tracking-wider">Channel</th>
                          <th className="px-6 py-4 text-left text-xs font-bold text-gray-300 uppercase tracking-wider">Duration</th>
                          <th className="px-6 py-4 text-left text-xs font-bold text-gray-300 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {videos.map((video, index) => (
                          <tr
                            key={video.id}
                            className="hover:bg-white/5 transition-colors duration-200 animate-fade-in"
                            style={{ animationDelay: `${index * 50}ms` }}
                          >
                            <td className="px-6 py-4 text-sm text-gray-400">
                              {index + 1}
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-sm text-white font-medium max-w-xs truncate">
                                {video.title}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-sm text-gray-300">
                                {video.channel}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                {video.duration}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <a
                                  href={video.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-xs font-semibold rounded-xl hover:from-blue-700 hover:to-cyan-700 transition-all duration-300 transform hover:scale-105"
                                >
                                  Watch
                                </a>
                                <button
                                  onClick={() => copyToClipboard(video.title, index)}
                                  className="inline-flex items-center px-3 py-2 bg-white/10 text-white text-xs font-semibold rounded-xl hover:bg-white/20 transition-all duration-300"
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
                <div className="mt-4 text-center text-gray-400 text-sm">
                  Found {videos.length} video{videos.length !== 1 ? 's' : ''}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="text-center mt-12 text-gray-400 text-sm animate-fade-in">
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