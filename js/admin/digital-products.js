(function () {
  const status = document.getElementById('storeAdminStatus');
  const form = document.getElementById('digitalProductForm');
  const formError = document.getElementById('productFormError');
  const productsNode = document.getElementById('digitalProductList');
  const fileProductSelect = document.getElementById('fileProductSelect');
  const fileInput = document.getElementById('digitalFile');
  const imageInput = document.getElementById('productImageFile');
  const fileList = document.getElementById('digitalFileList');
  const orderList = document.getElementById('digitalOrderList');
  const toastRegion = document.getElementById('toastRegion');
  const bucket = 'miportal-digital-products';
  const imageBucket = 'miportal-product-images';
  const maxFileSize = 50 * 1024 * 1024;
  const allowedTypes = new Set([
    'application/zip', 'application/x-zip-compressed', 'application/pdf', 'application/epub+zip',
    'application/json', 'application/octet-stream', 'text/plain', 'text/markdown', 'text/html',
    'text/css', 'text/javascript', 'application/javascript'
  ]);
  const typeByExtension = {
    zip: 'application/zip', pdf: 'application/pdf', epub: 'application/epub+zip', json: 'application/json',
    txt: 'text/plain', md: 'text/markdown', html: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript'
  };
  let supabase = null;
  let products = [];

  const element = (tag, value, className) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = value ?? '';
    return node;
  };

  function showError(error) {
    formError.textContent = error;
    formError.hidden = false;
  }

  function toast(message, type = 'info') {
    window.Admin.showToast(message, type, toastRegion);
  }

  function clearForm() {
    form.reset();
    document.getElementById('productId').value = '';
    document.getElementById('productPrice').value = '';
    formError.hidden = true;
    formError.textContent = '';
  }

  const lines = (id) => document.getElementById(id).value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);

  function payload() {
    const name = document.getElementById('productName').value.trim();
    const description = document.getElementById('productDescription').value.trim();
    const category = document.getElementById('productCategory').value.trim();
    const isFree = document.getElementById('productFree').checked;
    const price = isFree ? 0 : Number(document.getElementById('productPrice').value);
    const imageValue = document.getElementById('productImage').value.trim();
    let imageUrl = null;
    if (imageValue) {
      try { const url = new URL(imageValue); if (url.protocol !== 'https:') throw new Error(); imageUrl = url.href; }
      catch { throw new Error('La imagen debe ser una URL HTTPS válida.'); }
    }
    if (!name || !description || !category || !Number.isFinite(price) || price < 0 || (!isFree && price === 0)) throw new Error('Completa nombre, descripción, categoría y precio válido. Marca gratis si el precio es cero.');
    if (Array.from(name).length > 160 || Array.from(description).length > 5000 || Array.from(category).length > 80) throw new Error('Uno de los campos supera su longitud permitida.');
    return {
      name, description, category, price, currency: 'COP', image_url: imageUrl,
      featured: document.getElementById('productFeatured').checked,
      is_new: document.getElementById('productNew').checked,
      is_free: isFree,
      published: document.getElementById('productPublished').checked,
      version: document.getElementById('productVersion').value.trim() || null,
      license: document.getElementById('productLicense').value.trim() || null,
      features: lines('productFeatures'), technologies: lines('productTechnologies'), requirements: lines('productRequirements')
    };
  }

  async function saveProduct(event) {
    event.preventDefault();
    formError.hidden = true;
    try {
      const values = payload();
      if (values.published) {
        const id = document.getElementById('productId').value;
        const query = supabase.from('digital_product_files').select('id').eq('active', true);
        const { data: files, error: fileError } = await (id ? query.eq('product_id', id) : Promise.resolve({ data: [], error: null }));
        if (fileError) throw new Error('No se pudieron comprobar los archivos asociados.');
        if (!files?.length) throw new Error('Sube al menos un archivo activo antes de publicar el producto.');
      }
      const id = document.getElementById('productId').value;
      const result = id
        ? await supabase.from('digital_products').update(values).eq('id', id).select('id').single()
        : await supabase.from('digital_products').insert(values).select('id').single();
      if (result.error) throw new Error('No se pudo guardar el producto.');
      toast(id ? 'Producto actualizado.' : 'Producto creado como borrador. Los archivos se suben después de guardar.', 'success');
      clearForm();
      await loadProducts();
    } catch (error) {
      showError(error.message || 'No se pudo guardar el producto.');
    }
  }

  function fillForm(product) {
    document.getElementById('productId').value = product.id;
    document.getElementById('productName').value = product.name || '';
    document.getElementById('productDescription').value = product.description || '';
    document.getElementById('productCategory').value = product.category || '';
    document.getElementById('productPrice').value = product.price ?? 0;
    document.getElementById('productImage').value = product.image_url || '';
    document.getElementById('productVersion').value = product.version || '';
    document.getElementById('productLicense').value = product.license || '';
    document.getElementById('productFeatures').value = (product.features || []).join('\n');
    document.getElementById('productTechnologies').value = (product.technologies || []).join('\n');
    document.getElementById('productRequirements').value = (product.requirements || []).join('\n');
    document.getElementById('productFeatured').checked = Boolean(product.featured);
    document.getElementById('productNew').checked = Boolean(product.is_new);
    document.getElementById('productFree').checked = Boolean(product.is_free);
    document.getElementById('productPublished').checked = Boolean(product.published);
    fileProductSelect.value = product.id;
    loadFiles(product.id);
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderProducts() {
    productsNode.replaceChildren();
    fileProductSelect.replaceChildren(new Option('Selecciona un producto', ''));
    for (const product of products) {
      fileProductSelect.add(new Option(product.name, product.id));
      const row = document.createElement('article');
      row.className = 'resource-row';
      const info = document.createElement('div');
      info.append(element('h3', product.name), element('p', `${product.category} · ${Number(product.price).toLocaleString('es-CO', { style: 'currency', currency: 'COP' })} · ${product.published ? 'Publicado' : 'Borrador'}`, 'resource-meta'));
      const actions = document.createElement('div');
      actions.className = 'resource-actions';
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'btn btn-secondary'; edit.textContent = 'Editar'; edit.addEventListener('click', () => fillForm(product));
      const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'btn btn-secondary'; toggle.textContent = product.published ? 'Despublicar' : 'Publicar';
      toggle.addEventListener('click', async () => {
        const next = !product.published;
        if (next) {
          const { data: activeFiles, error } = await supabase.from('digital_product_files').select('id').eq('product_id', product.id).eq('active', true);
          if (error || !activeFiles?.length) { toast('Publica el producto después de subir al menos un archivo activo.', 'error'); return; }
        }
        const { error } = await supabase.from('digital_products').update({ published: next }).eq('id', product.id);
        if (error) toast('No se pudo cambiar la publicación.', 'error');
        else { toast(next ? 'Producto publicado.' : 'Producto despublicado.', 'success'); await loadProducts(); }
      });
      actions.append(edit, toggle); row.append(info, actions); productsNode.append(row);
    }
  }

  async function loadProducts() {
    const { data, error } = await supabase.from('digital_products').select('*').order('created_at', { ascending: false });
    if (error) throw new Error('No se pudieron cargar los productos. Comprueba que el esquema de tienda esté aplicado.');
    products = data || [];
    renderProducts();
    await loadOrders();
  }

  function storageFilename(filename) {
    const normalized = filename.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    const safe = normalized.replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '').slice(-120);
    return safe || 'digital-file';
  }

  async function uploadFile() {
    const productId = fileProductSelect.value;
    const file = fileInput.files?.[0];
    if (!productId || !file) { toast('Selecciona el producto y el archivo.', 'error'); return; }
    if (file.size < 1 || file.size > maxFileSize) { toast('El archivo debe tener entre 1 byte y 50 MB.', 'error'); return; }
    if (Array.from(file.name).length > 180 || /[\/\\\0-\x1f\x7f]/.test(file.name)) { toast('El nombre de archivo no es válido o supera 180 caracteres.', 'error'); return; }
    const ext = file.name.split('.').pop().toLowerCase();
    const contentType = file.type || typeByExtension[ext] || '';
    if (!allowedTypes.has(contentType)) { toast('Tipo de archivo no permitido.', 'error'); return; }
    const path = `${productId}/${crypto.randomUUID()}-${storageFilename(file.name)}`;
    const upload = await supabase.storage.from(bucket).upload(path, file, { contentType, upsert: false });
    if (upload.error) { toast('No se pudo subir el archivo al bucket privado.', 'error'); return; }
    const { error: insertError } = await supabase.from('digital_product_files').insert({
      product_id: productId, storage_path: path, original_filename: file.name,
      content_type: contentType, size_bytes: file.size, active: true
    });
    if (insertError) {
      let cleanupFailed = false;
      try {
        const { error: cleanupError } = await supabase.storage.from(bucket).remove([path]);
        cleanupFailed = Boolean(cleanupError);
      } catch {
        cleanupFailed = true;
      }
      toast(cleanupFailed
        ? 'No se pudo registrar el archivo y Storage no confirmó la limpieza. El equipo administrador debe revisar el bucket privado.'
        : 'No se pudo registrar el archivo. Se revirtió la carga.', 'error');
      return;
    }
    fileInput.value = '';
    toast('Archivo privado asociado al producto.', 'success');
    await loadFiles(productId);
  }

  async function uploadProductImage() {
    const productId = document.getElementById('productId').value;
    const file = imageInput.files?.[0];
    if (!productId) { toast('Guarda primero el producto como borrador.', 'error'); return; }
    if (!file) { toast('Selecciona una imagen.', 'error'); return; }
    const imageTypes = new Set(['image/png','image/jpeg','image/webp','image/avif']);
    if (!imageTypes.has(file.type) || file.size < 1 || file.size > 5 * 1024 * 1024) {
      toast('La imagen debe ser PNG, JPEG, WebP o AVIF y pesar como máximo 5 MB.', 'error');
      return;
    }
    const path = `products/${productId}/${crypto.randomUUID()}-${storageFilename(file.name)}`;
    const { error } = await supabase.storage.from(imageBucket).upload(path, file, { contentType: file.type, upsert: false });
    if (error) { toast('No se pudo subir la imagen.', 'error'); return; }
    const { data } = supabase.storage.from(imageBucket).getPublicUrl(path);
    try {
      const imageUrl = new URL(data.publicUrl);
      if (imageUrl.protocol !== 'https:') throw new Error();
      document.getElementById('productImage').value = imageUrl.href;
      imageInput.value = '';
      toast('Imagen pública subida. Guarda el producto para asociarla.', 'success');
    } catch {
      await supabase.storage.from(imageBucket).remove([path]);
      toast('La URL de la imagen no es válida; se eliminó el archivo recién subido.', 'error');
    }
  }

  async function loadFiles(productId) {
    fileList.replaceChildren();
    if (!productId) return;
    const { data, error } = await supabase.from('digital_product_files').select('id,original_filename,content_type,size_bytes,active,created_at')
      .eq('product_id', productId).order('created_at', { ascending: false });
    if (error) { fileList.append(element('p', 'No se pudieron cargar los archivos.')); return; }
    for (const file of (data || [])) {
      const row = document.createElement('article'); row.className = 'resource-row';
      row.append(element('p', `${file.original_filename} · ${(file.size_bytes / (1024 * 1024)).toFixed(2)} MB · ${file.active ? 'Activo' : 'Retirado'}`));
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-secondary'; button.textContent = file.active ? 'Retirar para nuevas compras' : 'Reactivar';
      button.addEventListener('click', async () => {
        const { error: updateError } = await supabase.from('digital_product_files').update({ active: !file.active }).eq('id', file.id);
        if (updateError) toast('No se pudo actualizar el archivo.', 'error'); else await loadFiles(productId);
      });
      row.append(button); fileList.append(row);
    }
  }

  async function loadOrders() {
    orderList.replaceChildren();
    const { data: orders, error } = await supabase.from('digital_product_orders')
      .select('id,user_id,status,total,currency,created_at,paid_at').order('created_at', { ascending: false }).limit(100);
    if (error) { orderList.append(element('p', 'Órdenes no disponibles.')); return; }
    const ids = (orders || []).map((order) => order.id);
    const { data: items, error: itemError } = ids.length
      ? await supabase.from('digital_product_order_items').select('order_id,product_name,quantity').in('order_id', ids)
      : { data: [], error: null };
    if (itemError) { orderList.append(element('p', 'No se pudo cargar el detalle de órdenes.')); return; }
    for (const order of (orders || [])) {
      const row = document.createElement('article'); row.className = 'resource-row';
      const content = (items || []).filter((item) => item.order_id === order.id).map((item) => `${item.product_name} × ${item.quantity}`).join(', ');
      row.append(element('p', `${order.id.slice(0, 8)} · usuario ${order.user_id.slice(0, 8)} · ${order.status} · ${Number(order.total).toLocaleString('es-CO', { style: 'currency', currency: order.currency })}`));
      row.append(element('p', content || 'Sin detalle de producto.', 'resource-meta'));
      orderList.append(row);
    }
    if (!orders?.length) orderList.append(element('p', 'Todavía no hay órdenes.'));
  }

  document.getElementById('newProduct').addEventListener('click', clearForm);
  form.addEventListener('submit', saveProduct);
  document.getElementById('uploadDigitalFile').addEventListener('click', uploadFile);
  document.getElementById('uploadProductImage').addEventListener('click', uploadProductImage);
  fileProductSelect.addEventListener('change', () => loadFiles(fileProductSelect.value));

  window.Admin.requireAdmin().then(async (client) => {
    if (!client) return;
    supabase = client;
    try {
      await loadProducts();
      status.textContent = `${products.length} productos. Las operaciones están protegidas por RLS.`;
    } catch (error) {
      status.textContent = error.message;
    }
  });
})();
