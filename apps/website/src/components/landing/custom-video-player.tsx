'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';

interface CustomVideoPlayerProps {
  videoSrc: string;
  thumbnailSrc: string;
  alt?: string;
  className?: string;
  width?: number;
  height?: number;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  controls?: boolean;
  preload?: 'auto' | 'metadata' | 'none';
  playsInline?: boolean;
}

export function CustomVideoPlayer({
  videoSrc,
  thumbnailSrc,
  alt = 'Video thumbnail',
  className = '',
  width = 1200,
  height = 675,
  muted = true,
  loop = true,
  controls = false,
  preload = 'auto',
  playsInline = true,
}: CustomVideoPlayerProps) {
  const [showThumbnail, setShowThumbnail] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handlePlayClick = async () => {
    if (!videoRef.current) return;

    setIsLoading(true);

    try {
      // Ensure video is loaded before trying to play
      if (videoRef.current.readyState < 2) {
        // Video not ready, wait for it to load
        await new Promise<void>((resolve, reject) => {
          const video = videoRef.current!;

          const onLoadedData = () => {
            video.removeEventListener('loadeddata', onLoadedData);
            video.removeEventListener('error', onError);
            resolve();
          };

          const onError = () => {
            video.removeEventListener('loadeddata', onLoadedData);
            video.removeEventListener('error', onError);
            reject(new Error('Video failed to load'));
          };

          video.addEventListener('loadeddata', onLoadedData);
          video.addEventListener('error', onError);

          // Force load if needed
          video.load();
        });
      }

      // Now try to play the video
      await videoRef.current.play();
      console.log('Video started playing successfully');

      // Hide thumbnail after successful play
      setShowThumbnail(false);
    } catch (error) {
      console.error('Failed to play video:', error);
      // Still hide thumbnail so user can interact with video controls
      setShowThumbnail(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`relative ${className}`}>
      {/* Video element - always rendered */}
      <video
        ref={videoRef}
        src={videoSrc}
        width={width}
        height={height}
        className="aspect-video w-full rounded-xl border border-indigo-900/50 object-cover"
        muted={muted}
        loop={loop}
        controls={controls}
        preload={preload}
        playsInline={playsInline}
      />

      {/* Thumbnail overlay - shown by default, hidden after play */}
      {showThumbnail && (
        <div
          className="absolute inset-0 cursor-pointer"
          onClick={handlePlayClick}
        >
          {/* Thumbnail image */}
          <Image
            src={thumbnailSrc}
            alt={alt}
            width={width}
            height={height}
            className="aspect-video w-full rounded-xl border border-indigo-900/50 object-cover"
            priority
          />

          {/* Play button overlay */}
          <div
            className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/20 transition-all duration-300 group-hover:bg-black/30"
            style={{ borderRadius: '0.75rem' }}
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-50/90 shadow-lg transition-transform duration-300 hover:scale-110 group-hover:bg-slate-50">
              {isLoading ? (
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-black border-t-transparent" />
              ) : (
                <svg
                  className="ml-1 h-8 w-8 text-black"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </div>
          </div>

          {/* Optional: Add a "Play Video" text below the button */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <div className="mt-28 text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              <span className="font-medium text-sm">
                {isLoading ? 'Loading...' : 'Click to play'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
