export function prepareDailyItems(items) {
  if (!Array.isArray(items)) return [];

  return items
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .slice()
    .sort((a, b) => Number(a.ranking) - Number(b.ranking));
}

export function dailyContentClass(count) {
  return `daily-content daily-content--items-${count}`;
}

export function getSafeDailyUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}
