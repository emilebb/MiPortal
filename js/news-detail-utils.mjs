const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isNewsId(value) {
  return typeof value === 'string' && UUID.test(value);
}

export function safeNewsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export function newsDetailUrl(id) {
  return isNewsId(id) ? `noticia.html?id=${encodeURIComponent(id)}` : null;
}

export function absoluteNewsDetailUrl(id, base) {
  const path = newsDetailUrl(id);
  if (!path) return null;
  try {
    return new URL(path, base).href;
  } catch {
    return null;
  }
}

export function relatedNews(rows, currentId, limit = 3) {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => row && row.published === true && isNewsId(row.id) && row.id !== currentId &&
    typeof row.title === 'string' && row.title.trim())
    .slice(0, Math.min(3, limit));
}
