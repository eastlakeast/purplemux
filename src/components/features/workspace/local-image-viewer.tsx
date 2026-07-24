import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  IMAGE_ZOOM_STEPS,
  calculateImageFitScale,
  calculatePinchZoom,
  clampImageZoom,
} from '@/lib/image-viewer-zoom';

const IMAGE_PADDING = 40;

type TImageZoom = number | 'fit';

interface IImageSize {
  width: number;
  height: number;
}

interface IZoomFocus {
  clientX: number;
  clientY: number;
  imageX: number;
  imageY: number;
}

interface IPanStart {
  pointerId: number;
  clientX: number;
  clientY: number;
  scrollLeft: number;
  scrollTop: number;
}

interface ILocalImageViewerProps {
  contentUrl: string;
  fileName: string;
  onError: () => void;
}

const LocalImageViewer = ({ contentUrl, fileName, onError }: ILocalImageViewerProps) => {
  const t = useTranslations('webBrowser');
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const zoomRef = useRef<TImageZoom>('fit');
  const pendingFocusRef = useRef<IZoomFocus | null>(null);
  const panStartRef = useRef<IPanStart | null>(null);
  const [imageSize, setImageSize] = useState<IImageSize | null>(null);
  const [viewportSize, setViewportSize] = useState<IImageSize>({ width: 0, height: 0 });
  const [zoom, setZoom] = useState<TImageZoom>('fit');
  const [isPanning, setIsPanning] = useState(false);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const updateSize = () => setViewportSize({
      width: viewport.clientWidth,
      height: viewport.clientHeight,
    });
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const fitScale = useMemo(() => imageSize
    ? calculateImageFitScale({
        naturalWidth: imageSize.width,
        naturalHeight: imageSize.height,
        viewportWidth: viewportSize.width,
        viewportHeight: viewportSize.height,
        padding: IMAGE_PADDING,
      })
    : 1, [imageSize, viewportSize]);
  const effectiveZoom = zoom === 'fit' ? fitScale : zoom;
  const renderedSize = imageSize
    ? {
        width: imageSize.width * effectiveZoom,
        height: imageSize.height * effectiveZoom,
      }
    : null;
  const canPan = Boolean(renderedSize && (
    renderedSize.width + IMAGE_PADDING > viewportSize.width
    || renderedSize.height + IMAGE_PADDING > viewportSize.height
  ));

  const applyZoomAtPoint = useCallback((nextZoom: number, clientX: number, clientY: number) => {
    const image = imageRef.current;
    if (!image) return;
    const rect = image.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    pendingFocusRef.current = {
      clientX,
      clientY,
      imageX: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      imageY: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    };
    const clampedZoom = clampImageZoom(nextZoom);
    zoomRef.current = clampedZoom;
    setZoom(clampedZoom);
  }, []);

  const applyZoomAtCenter = useCallback((nextZoom: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    applyZoomAtPoint(nextZoom, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }, [applyZoomAtPoint]);

  useEffect(() => {
    const focus = pendingFocusRef.current;
    const viewport = viewportRef.current;
    const image = imageRef.current;
    if (!focus || !viewport || !image) return;
    pendingFocusRef.current = null;
    const frame = requestAnimationFrame(() => {
      const rect = image.getBoundingClientRect();
      const nextClientX = rect.left + rect.width * focus.imageX;
      const nextClientY = rect.top + rect.height * focus.imageY;
      viewport.scrollLeft += nextClientX - focus.clientX;
      viewport.scrollTop += nextClientY - focus.clientY;
    });
    return () => cancelAnimationFrame(frame);
  }, [effectiveZoom]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !imageSize) return;
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const currentZoom = zoomRef.current === 'fit' ? fitScale : zoomRef.current;
      const nextZoom = calculatePinchZoom(currentZoom, event.deltaY);
      if (nextZoom === currentZoom) return;
      applyZoomAtPoint(nextZoom, event.clientX, event.clientY);
    };
    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel);
  }, [applyZoomAtPoint, fitScale, imageSize]);

  const adjustZoom = (direction: -1 | 1) => {
    const currentZoom = zoomRef.current === 'fit' ? fitScale : zoomRef.current;
    const closestIndex = IMAGE_ZOOM_STEPS.reduce((closest, value, index) =>
      Math.abs(value - currentZoom) < Math.abs(IMAGE_ZOOM_STEPS[closest] - currentZoom)
        ? index
        : closest, 0);
    const nextIndex = Math.max(0, Math.min(
      IMAGE_ZOOM_STEPS.length - 1,
      closestIndex + direction,
    ));
    applyZoomAtCenter(IMAGE_ZOOM_STEPS[nextIndex]);
  };

  const toggleFit = () => {
    if (zoom === 'fit') {
      applyZoomAtCenter(1);
      return;
    }
    pendingFocusRef.current = null;
    zoomRef.current = 'fit';
    setZoom('fit');
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canPan || event.button !== 0) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    panStartRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsPanning(true);
    event.preventDefault();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = panStartRef.current;
    const viewport = viewportRef.current;
    if (!start || !viewport || start.pointerId !== event.pointerId) return;
    viewport.scrollLeft = start.scrollLeft - (event.clientX - start.clientX);
    viewport.scrollTop = start.scrollTop - (event.clientY - start.clientY);
  };

  const stopPanning = (event: React.PointerEvent<HTMLDivElement>) => {
    if (panStartRef.current?.pointerId !== event.pointerId) return;
    panStartRef.current = null;
    setIsPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-muted/20">
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-md border border-border bg-background/95 p-1 shadow-sm">
        <Button variant="ghost" size="icon-sm" onClick={() => adjustZoom(-1)} aria-label={t('zoomOut')}>
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <button
          className="min-w-14 px-1 text-center text-xs text-muted-foreground hover:text-foreground"
          onClick={toggleFit}
          title={zoom === 'fit' ? t('actualSize') : t('zoomFit')}
        >
          {zoom === 'fit' ? t('zoomFit') : `${Math.round(effectiveZoom * 100)}%`}
        </button>
        <Button variant="ghost" size="icon-sm" onClick={() => adjustZoom(1)} aria-label={t('zoomIn')}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div
        ref={viewportRef}
        className={cn(
          'min-h-0 flex-1 overflow-auto overscroll-contain',
          canPan && (isPanning ? 'cursor-grabbing' : 'cursor-grab'),
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopPanning}
        onPointerCancel={stopPanning}
      >
        <div
          className="flex items-center justify-center p-5"
          style={renderedSize ? {
            width: Math.max(viewportSize.width, renderedSize.width + IMAGE_PADDING),
            height: Math.max(viewportSize.height, renderedSize.height + IMAGE_PADDING),
          } : { width: '100%', height: '100%' }}
        >
          <img
            ref={imageRef}
            src={contentUrl}
            alt={fileName}
            draggable={false}
            className="block shrink-0 select-none"
            style={renderedSize ? {
              width: renderedSize.width,
              height: renderedSize.height,
              maxWidth: 'none',
              maxHeight: 'none',
            } : { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            onLoad={(event) => setImageSize({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            })}
            onError={onError}
          />
        </div>
      </div>
    </div>
  );
};

export default LocalImageViewer;
