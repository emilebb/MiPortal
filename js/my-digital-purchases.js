(function () {
  const status = document.getElementById('purchaseStatus');
  const list = document.getElementById('purchaseList');
  const messages = {
    pending: 'Pago pendiente de confirmación',
    paid: 'Pago aprobado',
    cancelled: 'Orden cancelada',
    refunded: 'Orden reembolsada'
  };

  const text = (tag, value, className) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = value ?? '';
    return element;
  };

  async function download(grant, token, button) {
    button.disabled = true;
    try {
      const response = await fetch('/api/digital-products/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ grantId: grant.id }),
        signal: AbortSignal.timeout(10000)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.downloadUrl) throw new Error(result.error || 'No se pudo preparar la descarga.');
      const url = new URL(result.downloadUrl);
      if (url.protocol !== 'https:') throw new Error('El enlace de descarga no es válido.');
      window.location.assign(url.href);
    } catch (error) {
      status.textContent = error.message;
      button.disabled = false;
    }
  }

  async function load() {
    const supabase = window.MiPortalSupabase;
    if (!supabase) {
      status.textContent = 'La conexión con MiPortal no está configurada.';
      return;
    }
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      status.textContent = 'No se pudo verificar tu sesión. Inténtalo nuevamente.';
      return;
    }
    if (!session?.access_token) {
      const next = `${window.location.pathname}${window.location.search}`;
      window.location.assign(`/login.html?next=${encodeURIComponent(next)}`);
      return;
    }

    const { data: orders, error } = await supabase.from('digital_product_orders')
      .select('id,status,total,currency,created_at,paid_at')
      .eq('user_id', session.user.id).order('created_at', { ascending: false });
    if (error) {
      status.textContent = /does not exist|schema cache|could not find the table/i.test(error.message || '')
        ? 'La tienda todavía está pendiente de activación.'
        : 'No se pudieron cargar tus compras.';
      return;
    }
    list.replaceChildren();
    if (!orders?.length) {
      status.textContent = 'Aún no tienes compras.';
      return;
    }

    const ids = orders.map((order) => order.id);
    const [{ data: items, error: itemsError }, { data: grants, error: grantsError }] = await Promise.all([
      supabase.from('digital_product_order_items').select('order_id,product_id,product_name,unit_price,quantity').in('order_id', ids),
      supabase.from('digital_product_download_grants').select('id,order_id,original_filename').in('order_id', ids)
    ]);
    if (itemsError || grantsError) {
      status.textContent = 'No se pudo cargar el detalle de tus compras.';
      return;
    }
    const focusOrder = new URLSearchParams(window.location.search).get('order');
    orders.forEach((order) => {
      if (['paid', 'cancelled', 'refunded'].includes(order.status)) {
        (items || []).filter((item) => item.order_id === order.id).forEach((item) => {
          sessionStorage.removeItem(`miportal-digital-order:${item.product_id}`);
        });
      }
      const card = document.createElement('article');
      card.className = 'card-body resource-row';
      card.append(text('h2', `Orden ${order.id.slice(0, 8)}`));
      card.append(text('p', messages[order.status] || 'Estado no disponible', 'tag'));
      const date = new Date(order.created_at);
      card.append(text('p', Number(order.total).toLocaleString('es-CO', { style: 'currency', currency: order.currency }) +
        ` · ${Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('es-CO')}`));
      for (const item of (items || []).filter((row) => row.order_id === order.id)) {
        card.append(text('p', `${item.product_name}${item.quantity > 1 ? ` × ${item.quantity}` : ''}`));
      }
      if (order.status === 'paid') {
        const owned = (grants || []).filter((grant) => grant.order_id === order.id);
        owned.forEach((grant) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'btn btn-secondary product-download-button';
          button.textContent = `Descargar ${grant.original_filename}`;
          button.addEventListener('click', () => download(grant, session.access_token, button));
          card.append(button);
        });
        if (owned.length === 0) card.append(text('p', 'El pago fue aprobado; las descargas se están preparando.'));
      }
      if (focusOrder === order.id) card.setAttribute('aria-current', 'true');
      list.append(card);
    });
    status.textContent = `${orders.length} ${orders.length === 1 ? 'orden' : 'órdenes'}. El estado se consulta directamente desde tu cuenta.`;
  }

  load().catch(() => { status.textContent = 'No se pudieron cargar tus compras.'; });
})();
