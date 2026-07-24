export const MIN_IMAGE_ZOOM = 0.1;
export const MAX_IMAGE_ZOOM = 8;
export const IMAGE_ZOOM_STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8];

interface IImageFitScaleInput {
  naturalWidth: number;
  naturalHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  padding: number;
}

export const clampImageZoom = (zoom: number): number =>
  Math.max(MIN_IMAGE_ZOOM, Math.min(MAX_IMAGE_ZOOM, zoom));

export const calculateImageFitScale = ({
  naturalWidth,
  naturalHeight,
  viewportWidth,
  viewportHeight,
  padding,
}: IImageFitScaleInput): number => {
  if (naturalWidth <= 0 || naturalHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
    return 1;
  }
  const availableWidth = Math.max(1, viewportWidth - padding);
  const availableHeight = Math.max(1, viewportHeight - padding);
  return Math.min(1, availableWidth / naturalWidth, availableHeight / naturalHeight);
};

export const calculatePinchZoom = (currentZoom: number, deltaY: number): number => {
  const boundedDelta = Math.max(-20, Math.min(20, deltaY));
  return clampImageZoom(currentZoom * Math.exp(-boundedDelta * 0.01));
};
