export function createArticleImage(sourceUrl, fallbackUrl, documentRef = document) {
  const image = documentRef.createElement('img');
  image.className = `news-detail-image${sourceUrl ? '' : ' news-detail-image--fallback'}`;
  image.src = sourceUrl || fallbackUrl;
  image.alt = '';
  image.loading = 'eager';
  image.decoding = 'async';
  image.fetchPriority = 'high';
  image.addEventListener('load', () => {
    if (sourceUrl && image.src !== fallbackUrl && image.naturalWidth > 0) {
      image.style.maxWidth = `${image.naturalWidth}px`;
      image.style.marginInline = 'auto';
    }
  }, { once: true });
  if (sourceUrl) {
    image.addEventListener('error', () => {
      image.classList.add('news-detail-image--fallback');
      image.src = fallbackUrl;
    }, { once: true });
  }
  return image;
}

export function createRelatedImage(sourceUrl, fallbackUrl, documentRef = document) {
  const image = documentRef.createElement('img');
  image.src = sourceUrl || fallbackUrl;
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';
  if (sourceUrl) {
    image.addEventListener('error', () => {
      image.src = fallbackUrl;
    }, { once: true });
  }
  return image;
}
