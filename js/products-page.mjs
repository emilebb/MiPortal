import { filterAndSortProducts, isValidProductId, safeImageUrl } from './products-utils.mjs';

const status = document.querySelector('#productStatus');
const grid = document.querySelector('#productsGrid');
const detail = document.querySelector('#productDetail');
const detailContent = document.querySelector('#detailContent');
const catalog = document.querySelector('#catalogView');
const title = document.querySelector('#pageTitle');
const productsUrl = new URL('productos.html', window.location.href);

function textElement(tag, text, className) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text ?? '';
  return element;
}

function renderCard(product) {
  const card = document.createElement('article');
  card.className = 'card';
  const body = document.createElement('div'); body.className = 'card-body';
  if (safeImageUrl(product.image_url)) {
    const image = document.createElement('img'); image.src = safeImageUrl(product.image_url); image.alt = ''; image.loading = 'lazy';
    card.append(image);
  }
  body.append(textElement('span', product.category || 'Producto', 'tag'));
  const badges = [product.featured && 'Destacado', product.is_new && 'Nuevo', product.is_free && 'Gratis'].filter(Boolean);
  if (badges.length) body.append(textElement('p', badges.join(' · '), 'product-badges'));
  body.append(textElement('h2', product.name, 'card-title'), textElement('p', product.description, 'card-description'));
  if (product.price != null && Number.isFinite(Number(product.price))) body.append(textElement('p', Number(product.price).toLocaleString('es-CO', { style: 'currency', currency: 'COP' }), 'product-price'));
  const link = document.createElement('a'); link.className = 'read-more'; link.href = `${productsUrl.pathname}?id=${encodeURIComponent(product.id)}`; link.textContent = 'Ver detalle'; body.append(link);
  body.append(createPurchaseButton(product));
  card.append(body); return card;
}

function createPurchaseButton(product) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-primary product-buy-button';
  button.textContent = product.is_free ? 'Obtener gratis' : 'Comprar';
  button.addEventListener('click', () => startPurchase(product, button));
  return button;
}

function safeMercadoPagoUrl(value) {
  try {
    const url = new URL(value);
    const allowedHost = url.hostname === 'mercadopago.com' || url.hostname.endsWith('.mercadopago.com') ||
      ['mercadopago.com.co', 'mercadopago.com.ar', 'mercadopago.com.br', 'mercadopago.com.mx', 'mercadopago.cl', 'mercadopago.com.uy', 'mercadopago.com.pe'].includes(url.hostname);
    return url.protocol === 'https:' && !url.username && !url.password && allowedHost ? url.href : null;
  } catch { return null; }
}

function idempotencyKey(productId) {
  const key = `miportal-digital-order:${productId}`;
  let value = sessionStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID();
    sessionStorage.setItem(key, value);
  }
  return { key, value };
}

async function getSession() {
  const client = window.MiPortalSupabase;
  if (!client) throw new Error('La conexión con MiPortal no está disponible.');
  const { data, error } = await client.auth.getSession();
  if (error) throw new Error('No se pudo verificar la sesión.');
  return data.session;
}

function addDownloadLink(container, file, accessToken) {
  const link = document.createElement('button');
  link.type = 'button';
  link.className = 'btn btn-secondary product-download-button';
  link.textContent = `Descargar ${file.filename}`;
  link.addEventListener('click', async () => {
    link.disabled = true;
    try {
      const response = await fetch('/api/digital-products/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ grantId: file.id }),
        signal: AbortSignal.timeout(10000)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.downloadUrl) throw new Error(result.error || 'No se pudo preparar la descarga.');
      const url = new URL(result.downloadUrl);
      if (url.protocol !== 'https:') throw new Error('El enlace temporal no es válido.');
      window.location.assign(url.href);
    } catch (error) {
      status.textContent = error.message;
      link.disabled = false;
    }
  });
  container.append(link);
}

async function startPurchase(product, button) {
  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = 'Preparando…';
  try {
    const session = await getSession();
    if (!session?.access_token) {
      const next = `${window.location.pathname}${window.location.search}`;
      window.location.assign(`/login.html?next=${encodeURIComponent(next)}`);
      return;
    }
    const idem = idempotencyKey(product.id);
    const response = await fetch('/api/digital-products/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ productId: product.id, idempotencyKey: idem.value }),
      signal: AbortSignal.timeout(12000)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'No se pudo iniciar la compra.');
    if (result.initPoint) {
      const paymentUrl = safeMercadoPagoUrl(result.initPoint);
      if (!paymentUrl) throw new Error('El enlace de pago no es válido.');
      window.location.assign(paymentUrl);
      return;
    }
    if (result.status === 'paid' && Array.isArray(result.downloads) && result.downloads.length) {
      sessionStorage.removeItem(idem.key);
      const container = button.parentElement || detailContent || grid;
      button.remove();
      result.downloads.forEach((file) => addDownloadLink(container, file, session.access_token));
      status.textContent = result.free
        ? 'Producto gratuito listo. Usa el botón de descarga autorizado.'
        : 'Compra aprobada. Usa el botón de descarga autorizado.';
      return;
    }
    throw new Error('El backend no devolvió un estado de compra válido.');
  } catch (error) {
    status.textContent = error.message || 'No se pudo iniciar la compra.';
    button.disabled = false;
    button.textContent = originalText;
  }
}

function showError(message) { status.textContent = message; status.dataset.state = 'error'; }

async function loadProducts() {
  const returnParams = new URLSearchParams(window.location.search);
  const failedProduct = returnParams.get('product');
  if (returnParams.get('payment') === 'failed' && isValidProductId(failedProduct)) {
    sessionStorage.removeItem(`miportal-digital-order:${failedProduct}`);
  }
  const client = window.MiPortalSupabase;
  if (!client) { showError('Catálogo no disponible: falta la configuración de conexión con Supabase.'); return; }
  const id = new URLSearchParams(window.location.search).get('id');
  if (id && !isValidProductId(id)) { catalog.hidden = true; detail.hidden = false; title.textContent = 'Producto no disponible'; showError('El identificador del producto no es válido.'); return; }
  let request = client.from('digital_products').select('id,name,description,category,price,currency,image_url,published,featured,is_new,is_free,features,technologies,version,requirements,license,gallery_urls,related_product_ids,created_at');
  if (id) request = request.eq('id', id).eq('published', true).maybeSingle();
  else request = request.eq('published', true);
  const { data, error } = await request;
  if (error) {
    const missingTable = error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find the table|schema cache/i.test(error.message || '');
    showError(missingTable ? 'Catálogo pendiente: el esquema de productos digitales todavía no está disponible.' : 'No fue posible cargar el catálogo. Inténtalo nuevamente más tarde.');
    return;
  }
  if (id) {
    catalog.hidden = true; detail.hidden = false;
    if (!data) { title.textContent = 'Producto no disponible'; showError('No se encontró un producto publicado con ese identificador.'); return; }
    title.textContent = data.name || 'Detalle del producto';
    detailContent.replaceChildren();
    if (safeImageUrl(data.image_url)) { const image = document.createElement('img'); image.src = safeImageUrl(data.image_url); image.alt = ''; image.className = 'product-detail-image'; detailContent.append(image); }
    const detailTitle = textElement('h2', data.name, 'product-detail-title'); detailTitle.id = 'detailTitle';
    detailContent.append(textElement('p', data.category || 'Producto', 'tag'), detailTitle, textElement('p', data.description, 'product-detail-description'));
    if (data.price != null && Number.isFinite(Number(data.price))) detailContent.append(textElement('p', Number(data.price).toLocaleString('es-CO', { style: 'currency', currency: 'COP' }), 'product-price'));
    const badges = [data.featured && 'Destacado', data.is_new && 'Nuevo', data.is_free && 'Gratis'].filter(Boolean);
    if (badges.length) detailContent.append(textElement('p', badges.join(' · '), 'product-badges'));
    for (const [label, value] of [['Características', data.features], ['Tecnologías', data.technologies], ['Requisitos', data.requirements]]) {
      if (Array.isArray(value) && value.length) {
        detailContent.append(textElement('h3', label, 'product-meta-heading'));
        const list = document.createElement('ul'); value.forEach((item) => list.append(textElement('li', item)));
        detailContent.append(list);
      }
    }
    for (const [label, value] of [['Versión', data.version], ['Licencia', data.license]]) if (value) detailContent.append(textElement('p', `${label}: ${value}`, 'product-meta'));
    detailContent.append(createPurchaseButton(data));
    if (Array.isArray(data.gallery_urls) && data.gallery_urls.length) {
      const gallery = document.createElement('div'); gallery.className = 'product-gallery';
      data.gallery_urls.map(safeImageUrl).filter(Boolean).forEach((src) => { const image = document.createElement('img'); image.src = src; image.alt = ''; image.loading = 'lazy'; gallery.append(image); });
      if (gallery.childElementCount) detailContent.append(gallery);
    }
    if (Array.isArray(data.related_product_ids) && data.related_product_ids.length) {
      const { data: related } = await client.from('digital_products').select('id,name').eq('published', true).in('id', data.related_product_ids);
      if (related?.length) {
        detailContent.append(textElement('h3', 'Productos relacionados', 'product-meta-heading'));
        const list = document.createElement('ul');
        related.forEach((product) => { const item = document.createElement('li'); const link = document.createElement('a'); link.href = `${productsUrl.pathname}?id=${encodeURIComponent(product.id)}`; link.textContent = product.name; item.append(link); list.append(item); });
        detailContent.append(list);
      }
    }
    status.textContent = 'Detalle informativo. La compra y descarga no están habilitadas.'; return;
  }
  const products = Array.isArray(data) ? data : [];
  const categorySelect = document.querySelector('#productCategory');
  [...new Set(products.map((product) => product.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')).forEach((category) => categorySelect.add(new Option(category, category)));
  const update = () => {
    const visible = filterAndSortProducts(products, { query: document.querySelector('#productSearch').value, category: categorySelect.value, sort: document.querySelector('#productSort').value });
    grid.replaceChildren(...visible.map(renderCard));
    status.textContent = visible.length ? `${visible.length} ${visible.length === 1 ? 'producto' : 'productos'} publicados.` : 'No hay productos publicados que coincidan con la búsqueda.';
  };
  document.querySelector('#productFilters').addEventListener('submit', (event) => event.preventDefault());
  document.querySelector('#productSearch').addEventListener('input', update);
  categorySelect.addEventListener('change', update); document.querySelector('#productSort').addEventListener('change', update); update();
}

loadProducts().catch(() => showError('No fue posible cargar el catálogo. Inténtalo nuevamente más tarde.'));
