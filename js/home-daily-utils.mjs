import { entertainmentReactCollision } from './editorial-relevance.mjs';
export function prepareDailyItems(items) {
  if (!Array.isArray(items)) return [];

  return items
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .filter((item) => String(item.category).toLowerCase() !== 'javascript' ||
      !entertainmentReactCollision(`${item.title || ''} ${item.summary || ''}`))
    .slice()
    .sort((a, b) => Number(a.ranking) - Number(b.ranking));
}

export function dailyContentClass(count) {
  return `daily-content daily-content--items-${count}`;
}

export function getSafeDailyUrl(value) {
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}
