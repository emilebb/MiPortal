export const MIN_RENDERABLE_IMAGE_WIDTH = 480;

export function isImageWidthSufficient(width) {
  return Number.isFinite(width) && width >= MIN_RENDERABLE_IMAGE_WIDTH;
}
