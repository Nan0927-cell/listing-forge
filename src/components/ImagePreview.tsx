import { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';

interface PreviewImage {
  src: string;
  name: string;
}

interface ImagePreviewProps {
  images: PreviewImage[];
  initialIndex?: number;
  onClose: () => void;
}

export default function ImagePreview({ images, initialIndex = 0, onClose }: ImagePreviewProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);

  const next = useCallback(() => {
    setZoom(1);
    setCurrentIndex((prev) => (prev + 1) % images.length);
  }, [images.length]);

  const prev = useCallback(() => {
    setZoom(1);
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  }, [images.length]);

  // 键盘快捷键
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [next, prev, onClose]);

  if (images.length === 0) return null;

  const current = images[currentIndex];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      {/* 关闭按钮 */}
      <button
        onClick={onClose}
        className="absolute right-4 top-4 z-10 border-2 border-bone/30 p-2 text-bone hover:border-flame hover:bg-flame"
      >
        <X className="h-5 w-5" />
      </button>

      {/* 缩放控制 */}
      <div
        className="absolute left-4 top-4 z-10 flex gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
          className="border-2 border-bone/30 p-2 text-bone hover:border-flame hover:bg-flame"
        >
          <ZoomOut className="h-5 w-5" />
        </button>
        <span className="border-2 border-bone/30 px-3 py-2 font-mono text-xs text-bone">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
          className="border-2 border-bone/30 p-2 text-bone hover:border-flame hover:bg-flame"
        >
          <ZoomIn className="h-5 w-5" />
        </button>
      </div>

      {/* 左右切换 */}
      {images.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); prev(); }}
            className="absolute left-4 top-1/2 z-10 -translate-y-1/2 border-2 border-bone/30 p-3 text-bone hover:border-flame hover:bg-flame"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); next(); }}
            className="absolute right-4 top-1/2 z-10 -translate-y-1/2 border-2 border-bone/30 p-3 text-bone hover:border-flame hover:bg-flame"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}

      {/* 图片 */}
      <div
        className="flex max-h-[90vh] max-w-[90vw] flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={current.src}
          alt={current.name}
          style={{ transform: `scale(${zoom})`, transition: 'transform 0.2s' }}
          className="max-h-[80vh] max-w-[90vw] object-contain"
        />
        {/* 底部信息 */}
        <div className="mt-4 flex items-center gap-4 text-bone">
          <span className="font-mono text-sm font-bold">{current.name}</span>
          {images.length > 1 && (
            <span className="font-mono text-xs text-bone/60">
              {currentIndex + 1} / {images.length}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
