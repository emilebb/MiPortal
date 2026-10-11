import test from 'node:test';
import assert from 'node:assert/strict';
import { filterAndSortProducts, isValidProductId, safeImageUrl } from '../js/products-utils.mjs';

const products = [
  { id: '1', name: 'Guía CSS', description: 'Estilos', category: 'Desarrollo', price: 20 },
  { id: '2', name: 'Curso HTML', description: 'Etiquetas', category: 'Desarrollo', price: 10 },
  { id: '3', name: 'Plantilla', description: 'Diseño', category: 'Diseño', price: 15 },
];

test('busca sin distinguir mayúsculas y filtra por categoría', () => {
  assert.deepEqual(filterAndSortProducts(products, { query: 'CSS', category: 'Desarrollo' }).map((p) => p.id), ['1']);
  assert.deepEqual(filterAndSortProducts(products, { category: 'Diseño' }).map((p) => p.id), ['3']);
});

test('ordena por nombre y precio en ambos sentidos', () => {
  assert.deepEqual(filterAndSortProducts(products, { sort: 'name-asc' }).map((p) => p.id), ['2', '1', '3']);
  assert.deepEqual(filterAndSortProducts(products, { sort: 'name-desc' }).map((p) => p.id), ['3', '1', '2']);
  assert.deepEqual(filterAndSortProducts(products, { sort: 'price-asc' }).map((p) => p.id), ['2', '3', '1']);
  assert.deepEqual(filterAndSortProducts(products, { sort: 'price-desc' }).map((p) => p.id), ['1', '3', '2']);
});

test('ordena destacados y novedades sin crear productos', () => {
  const rows = [
    { id: 'old', name: 'Anterior', created_at: '2025-01-01', featured: false },
    { id: 'featured', name: 'Destacado', created_at: '2025-01-02', featured: true },
    { id: 'new', name: 'Nuevo', created_at: '2026-01-01', featured: false },
  ];
  assert.deepEqual(filterAndSortProducts(rows, { sort: 'featured' }).map((p) => p.id), ['featured', 'new', 'old']);
  assert.deepEqual(filterAndSortProducts(rows, { sort: 'newest' }).map((p) => p.id), ['new', 'featured', 'old']);
});

test('acepta imágenes HTTPS y rechaza protocolos no seguros', () => {
  assert.equal(safeImageUrl('https://example.com/imagen.png'), 'https://example.com/imagen.png');
  for (const url of ['http://example.com/imagen.png', 'javascript:alert(1)', 'data:image/svg+xml,x', '//example.com/img.png', 'no-es-url']) assert.equal(safeImageUrl(url), null);
});

test('valida identificadores UUID', () => {
  assert.equal(isValidProductId('550e8400-e29b-41d4-a716-446655440000'), true);
  assert.equal(isValidProductId('550e8400-e29b-11d4-a716-446655440000'), true);
  assert.equal(isValidProductId('550e8400-e29b-11d4-7116-446655440000'), false);
  assert.equal(isValidProductId('abc'), false);
  assert.equal(isValidProductId(null), false);
});
