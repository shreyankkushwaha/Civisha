import React, { useState, useEffect } from 'react';
import { resolveFirestoreMediaUrl } from '../api';

interface LazyImageProps {
  src: string;
  alt?: string;
  className?: string;
  imgClassName?: string;
}

export function LazyImage({ src, alt = '', className = '', imgClassName = 'object-cover' }: LazyImageProps) {
  const [resolvedSrc, setResolvedSrc] = useState(src);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setResolvedSrc(src);
    setIsLoaded(false);
    setError(false);
    if (src && src.startsWith('/api/media/firestore/')) {
      resolveFirestoreMediaUrl(src).then((dataUrl) => {
        if (dataUrl) setResolvedSrc(dataUrl);
      });
    }
  }, [src]);

  const handleError = async () => {
    if (resolvedSrc && resolvedSrc.startsWith('/api/media/firestore/')) {
      const dataUrl = await resolveFirestoreMediaUrl(resolvedSrc);
      if (dataUrl && dataUrl !== resolvedSrc) {
        setResolvedSrc(dataUrl);
        return;
      }
    }
    setError(true);
  };

  return (
    <div className={`relative overflow-hidden bg-gray-200 dark:bg-gray-800 ${className}`}>
      {!isLoaded && !error && (
        <div className="absolute inset-0 bg-gray-200 dark:bg-gray-800 animate-pulse" />
      )}
      <img
        src={resolvedSrc}
        alt={alt}
        loading="lazy"
        onLoad={() => setIsLoaded(true)}
        onError={handleError}
        className={`w-full h-full transition-opacity duration-700 ${imgClassName} ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
}
