// Preserve the source pixels instead of stretching feed thumbnails into a hero.
// The containing card keeps its reserved aspect ratio, avoiding layout shifts.
export function preserveImageResolution(image) {
  image.addEventListener('load', () => {
    if (image.naturalWidth > 0 && image.naturalHeight > 0) {
      image.style.maxWidth = `${image.naturalWidth}px`;
      image.style.maxHeight = `${image.naturalHeight}px`;
      image.style.margin = 'auto';
    }
  });
  return image;
}
