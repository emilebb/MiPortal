export function paginateItems(items, requestedPage, pageSize = 12) {
  const list = Array.isArray(items) ? items : [];
  const size = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 12;
  const pageCount = Math.ceil(list.length / size);
  const page = pageCount ? Math.min(Math.max(1, Number(requestedPage) || 1), pageCount) : 1;
  return {
    items: list.slice((page - 1) * size, page * size),
    page,
    pageCount,
    total: list.length
  };
}

function normalizedDay(value) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!parts) return null;

  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    return null;
  }
  return timestamp;
}

export function relativeDateLabel(publishedDate, now = new Date()) {
  const publishedDay = normalizedDay(publishedDate);
  if (publishedDay === null || !(now instanceof Date) || !Number.isFinite(now.getTime())) return null;

  const today = normalizedDay(now.toISOString().slice(0, 10));
  const days = Math.floor((today - publishedDay) / 86400000);
  if (days < 0) return null;
  if (days === 0) return 'hoy';
  if (days === 1) return 'ayer';
  return `hace ${days} días`;
}
