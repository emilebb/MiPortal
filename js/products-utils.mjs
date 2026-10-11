export function isValidProductId(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function safeImageUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' ? url.href : null;
  } catch { return null; }
}

export function filterAndSortProducts(products, { query = '', category = '', sort = 'name-asc' } = {}) {
  const needle = query.trim().toLocaleLowerCase('es');
  const rows = products.filter((product) => {
    const searchable = `${product.name ?? ''} ${product.description ?? ''} ${product.category ?? ''}`.toLocaleLowerCase('es');
    return (!needle || searchable.includes(needle)) && (!category || product.category === category);
  });
  const comparators = {
    featured: (a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || new Date(b.created_at || 0) - new Date(a.created_at || 0),
    'name-asc': (a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'es'),
    'name-desc': (a, b) => String(b.name ?? '').localeCompare(String(a.name ?? ''), 'es'),
    'price-asc': (a, b) => Number(a.price) - Number(b.price),
    'price-desc': (a, b) => Number(b.price) - Number(a.price),
    newest: (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
  };
  return rows.sort(comparators[sort] ?? comparators['name-asc']);
}
