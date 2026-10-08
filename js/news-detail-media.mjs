export function createArticleImage(sourceUrl, fallbackUrl, documentRef = document) {
  const image = documentRef.createElement('img');
  image.className = `news-detail-image${sourceUrl ? '' : ' news-detail-image--fallback'}`;
  image.src = sourceUrl || fallbackUrl;
  image.alt = '';
  image.loading = 'eager';
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
  if (sourceUrl) {
    image.addEventListener('error', () => {
      image.src = fallbackUrl;
    }, { once: true });
  }
  return image;
}
