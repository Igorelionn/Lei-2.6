// 🔒 SEGURANÇA: Componente seguro para imagens com fallback
// Substitui innerHTML por state React, evitando vulnerabilidades XSS

import { useState } from 'react';
import { ImagePlaceholderIcon } from './ImagePlaceholderIcon';

interface ImageWithFallbackProps {
  src: string;
  alt: string;
  className?: string;
  containerClassName?: string;
  onClick?: () => void;
  showZoomOverlay?: boolean;
}

export const ImageWithFallback = ({
  src,
  alt,
  className = "w-full h-full object-cover group-hover:scale-105 transition-transform duration-200",
  containerClassName = "relative h-32 overflow-hidden rounded-lg border border-gray-200 bg-white cursor-pointer group",
  onClick,
  showZoomOverlay = true
}: ImageWithFallbackProps) => {
  const [imageError, setImageError] = useState(false);

  if (imageError) {
    // ✅ Renderizar componente React em vez de usar innerHTML
    return (
      <div className={`${containerClassName} bg-gray-100 flex items-center justify-center`} onClick={onClick}>
        <ImagePlaceholderIcon />
      </div>
    );
  }

  return (
    <div className={containerClassName} onClick={onClick}>
      <img
        src={src}
        alt={alt}
        className={className}
        onError={() => setImageError(true)} // ✅ Usar state em vez de innerHTML
      />
      {showZoomOverlay && (
        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all duration-200 flex items-center justify-center">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white rounded-full p-2 shadow-lg">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-700">
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7"/>
            </svg>
          </div>
        </div>
      )}
    </div>
  );
};
