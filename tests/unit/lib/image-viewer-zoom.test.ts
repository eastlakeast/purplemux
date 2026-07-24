import { describe, expect, it } from 'vitest';
import {
  MAX_IMAGE_ZOOM,
  MIN_IMAGE_ZOOM,
  calculateImageFitScale,
  calculatePinchZoom,
  clampImageZoom,
} from '@/lib/image-viewer-zoom';

describe('image viewer zoom', () => {
  it('fits large images within the padded viewport without upscaling small images', () => {
    expect(calculateImageFitScale({
      naturalWidth: 2000,
      naturalHeight: 1000,
      viewportWidth: 1000,
      viewportHeight: 800,
      padding: 40,
    })).toBeCloseTo(0.48);
    expect(calculateImageFitScale({
      naturalWidth: 400,
      naturalHeight: 300,
      viewportWidth: 1000,
      viewportHeight: 800,
      padding: 40,
    })).toBe(1);
  });

  it('zooms continuously in the pinch direction and clamps extreme values', () => {
    expect(calculatePinchZoom(1, -10)).toBeGreaterThan(1);
    expect(calculatePinchZoom(1, 10)).toBeLessThan(1);
    expect(clampImageZoom(0)).toBe(MIN_IMAGE_ZOOM);
    expect(clampImageZoom(100)).toBe(MAX_IMAGE_ZOOM);
  });
});
