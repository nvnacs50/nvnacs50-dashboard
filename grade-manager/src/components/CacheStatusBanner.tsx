'use client';

import { useEffect, useState } from 'react';

interface CacheStatusBannerProps {
  timestamp: number | null;
  source: 'indexeddb' | 'static-cache' | 'live-api' | null;
  onSync: () => void;
  isLoading: boolean;
}

export default function CacheStatusBanner({
  timestamp,
  source,
  onSync,
  isLoading,
}: CacheStatusBannerProps) {
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Update current time every 30 seconds to refresh relative time
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, []);

  const getRelativeTime = (ts: number): string => {
    const seconds = Math.floor((currentTime - ts) / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return `преди ${seconds} сек`;
    if (minutes < 60) return `преди ${minutes} мин`;
    if (hours < 24) return `преди ${hours} ч`;
    return `преди ${days} д`;
  };

  const getStatusColor = (): {
    bg: string;
    border: string;
    text: string;
    icon: string;
  } => {
    if (!timestamp) {
      return {
        bg: 'bg-sunken',
        border: 'border-line',
        text: 'text-ink-soft',
        icon: '⚪',
      };
    }

    const age = currentTime - timestamp;
    const thirtyMin = 30 * 60 * 1000;
    const twoHours = 2 * 60 * 60 * 1000;

    if (age < thirtyMin) {
      return {
        bg: 'bg-ok-soft',
        border: 'border-ok-soft',
        text: 'text-ok',
        icon: '🟢',
      };
    } else if (age < twoHours) {
      return {
        bg: 'bg-warn-soft',
        border: 'border-warn-soft',
        text: 'text-warn',
        icon: '🟡',
      };
    } else {
      return {
        bg: 'bg-danger-soft',
        border: 'border-danger-soft',
        text: 'text-danger',
        icon: '🔴',
      };
    }
  };

  const getSourceLabel = (): string => {
    switch (source) {
      case 'indexeddb':
        return 'IndexedDB Cache';
      case 'static-cache':
        return 'Static Cache (GitHub Actions)';
      case 'live-api':
        return 'Live API';
      default:
        return 'No data';
    }
  };

  const getStatusMessage = (): string => {
    if (!timestamp) {
      return 'Няма заредени данни';
    }

    const age = currentTime - timestamp;
    const thirtyMin = 30 * 60 * 1000;
    const twoHours = 2 * 60 * 60 * 1000;

    if (age < thirtyMin) {
      return 'Свежи данни';
    } else if (age < twoHours) {
      return 'От hourly snapshot';
    } else {
      return 'Остарели данни, препоръчва се синхронизация';
    }
  };

  const colors = getStatusColor();

  return (
    <div
      className={`rounded-box border ${colors.border} ${colors.bg} px-4 py-3 mb-6 shadow-card`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{colors.icon}</span>
          <div>
            <div className="flex items-center gap-2">
              <p className={`text-sm font-semibold ${colors.text}`}>
                {getStatusMessage()}
              </p>
              {timestamp && (
                <span className={`text-xs ${colors.text} opacity-75`}>
                  ({getRelativeTime(timestamp)})
                </span>
              )}
            </div>
            <p className="text-xs text-ink-soft mt-0.5">
              Източник: <span className="font-medium">{getSourceLabel()}</span>
              {timestamp && (
                <>
                  {' '}
                  • Последна синхронизация:{' '}
                  {new Date(timestamp).toLocaleString('bg-BG', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </>
              )}
            </p>
          </div>
        </div>

        <button
          onClick={onSync}
          disabled={isLoading}
          className="inline-flex items-center px-4 py-2 border border-line shadow-card text-sm font-medium rounded-box text-ink-soft bg-surface hover:bg-sunken focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <svg
            className={`-ml-1 mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          {isLoading ? 'Синхронизиране...' : 'Sync Now'}
        </button>
      </div>
    </div>
  );
}
