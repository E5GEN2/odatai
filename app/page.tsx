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

  // Load API key from localStorage on mount
  useEffect(() => {
    const savedKey = localStorage.getItem('youtube_api_key');
    if (savedKey) {
      setApiKey(savedKey);
    }
  }, []);

  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-6">
            YouTube Video Title Fetcher
          </h1>

          <div className="mb-6">
            <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 mb-2">
              YouTube API Key
            </label>
            <div className="flex gap-2">
              <input
                id="apiKey"
                type={showApiKey ? "text" : "password"}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter your YouTube Data API v3 key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <button
                onClick={() => setShowApiKey(!showApiKey)}
                className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
              >
                {showApiKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Get your API key from{' '}
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800"
              >
                Google Cloud Console
              </a>
            </p>
          </div>

          <div className="mb-6">
            <label htmlFor="urls" className="block text-sm font-medium text-gray-700 mb-2">
              Enter YouTube URLs (one per line)
            </label>
            <textarea
              id="urls"
              className="w-full h-40 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="https://www.youtube.com/watch?v=dQw4w9WgXcQ
https://youtu.be/dQw4w9WgXcQ
https://www.youtube.com/shorts/abc123"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-600">{error}</p>
            </div>
          )}

          <div className="flex gap-4 mb-6">
            <button
              onClick={fetchVideoData}
              disabled={loading || !inputText.trim() || !apiKey.trim()}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Fetching...' : 'Fetch Titles'}
            </button>
            <button
              onClick={clearAll}
              className="px-6 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
            >
              Clear All
            </button>
            {videos.length > 0 && (
              <button
                onClick={exportToCSV}
                className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
              >
                Export to CSV
              </button>
            )}
          </div>

          {videos.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      #
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Title
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Channel
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Duration
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Link
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {videos.map((video, index) => (
                    <tr key={video.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {index + 1}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {video.title}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {video.channel}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {video.duration}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <a
                          href={video.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800"
                        >
                          Watch
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}