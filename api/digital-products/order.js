'use strict';

const {
  createServiceClient, configError, getUser, json, methodNotAllowed,
  readConfig, readJsonBody, requireCheckoutEnabled, requireOrigin, uuidPattern
} = require('../../lib/digital-products-api');

const siteBase = 'https://www.miportal.me';
const checkoutHosts = new Set([
  'mercadopago.com', 'www.mercadopago.com', 'mercadopago.com.co', 'www.mercadopago.com.co',
  'mercadopago.com.ar', 'www.mercadopago.com.ar', 'mercadopago.com.br', 'www.mercadopago.com.br',
  'mercadopago.com.mx', 'www.mercadopago.com.mx', 'mercadopago.cl', 'www.mercadopago.cl',
  'mercadopago.com.uy', 'www.mercadopago.com.uy', 'mercadopago.com.pe', 'www.mercadopago.com.pe'
]);

function checkoutUrl(preference, expectedId, orderId) {
  if (preference?.id !== expectedId ||
      (preference?.external_reference != null && preference.external_reference !== orderId) ||
      typeof preference?.init_point !== 'string') return null;
  try {
    const url = new URL(preference.init_point);
    return url.protocol === 'https:' && !url.username && !url.password && checkoutHosts.has(url.hostname)
      ? url.href : null;
  } catch { return null; }
}

async function readPreference(preferenceId, orderId, config) {
  const response = await fetch(`https://api.mercadopago.com/checkout/preferences/${encodeURIComponent(preferenceId)}`, {
    method: 'GET', redirect: 'error',
    headers: { Authorization: `Bearer ${config.env.MERCADOPAGO_ACCESS_TOKEN}` },
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) return null;
  return checkoutUrl(await response.json(), preferenceId, orderId);
}

module.exports = async function handler(req, res) {
  if (methodNotAllowed(req, res, 'POST') || requireOrigin(req, res)) return;
  if (requireCheckoutEnabled(res)) return;
  const parsed = readJsonBody(req);
  if (parsed.error) return json(res, parsed.error.status, { error: parsed.error.message });
  const { productId, idempotencyKey } = parsed.body;
  if (typeof productId !== 'string' || !uuidPattern.test(productId) ||
      typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(idempotencyKey)) {
    return json(res, 400, { error: 'Producto o clave de solicitud no válidos.' });
  }

  const config = readConfig({ needsMercadoPago: true, needsWebhook: true });
  if (configError(config, res)) return;
  const user = await getUser(req, config);
  if (!user) return json(res, 401, { error: 'Inicia sesión para comprar.' });

  const supabase = createServiceClient(config);
  try {
    const { data: order, error: orderError } = await supabase.rpc('create_digital_product_order', {
      p_product_id: productId,
      p_user_id: user.id,
      p_idempotency_key: idempotencyKey
    });
    if (orderError || !order?.order_id) {
      const message = String(orderError?.message || '');
      const status = /PRODUCT_NOT_AVAILABLE|PRODUCT_FILE_NOT_AVAILABLE/i.test(message) ? 404 :
        /IDEMPOTENCY_KEY_REUSED/i.test(message) ? 409 :
        /INVALID_ORDER_REQUEST/i.test(message) ? 400 : 502;
      return json(res, status, { error: status === 404 ? 'El producto no está disponible para compra.' :
        status === 409 ? 'La clave de compra ya se utilizó para otro producto.' :
        status === 400 ? 'Solicitud de compra no válida.' : 'No se pudo crear la orden.' });
    }

    if (order.status === 'paid') {
      const { data: grants, error: grantsError } = await supabase
        .from('digital_product_download_grants')
        .select('id,original_filename')
        .eq('order_id', order.order_id).eq('user_id', user.id);
      if (grantsError || !Array.isArray(grants) || grants.length === 0) {
        console.error('[digital-products] free order created but its download grants could not be read');
        return json(res, 502, { error: 'La orden gratuita se creó, pero no se pudo preparar la descarga.' });
      }
      return json(res, 200, {
        orderId: order.order_id, status: 'paid', free: Number(order.total) === 0,
        downloads: grants.map(({ id, original_filename }) => ({ id, filename: original_filename }))
      });
    }

    if (order.status !== 'pending' || !(Number(order.total) > 0)) {
      return json(res, 409, { error: 'La orden no puede iniciar un pago.' });
    }

    if (typeof order.provider_preference_id === 'string' && order.provider_preference_id.length > 0) {
      const initPoint = await readPreference(order.provider_preference_id, order.order_id, config);
      if (!initPoint) {
        console.error('[digital-products] stored Mercado Pago preference could not be verified');
        return json(res, 502, { error: 'No se pudo recuperar el enlace de pago.' });
      }
      return json(res, 200, { orderId: order.order_id, status: 'pending', initPoint });
    }

    const preferenceResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST', redirect: 'error',
      headers: {
        Authorization: `Bearer ${config.env.MERCADOPAGO_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `digital-product-order-${order.order_id}`
      },
      body: JSON.stringify({
        items: [{
          title: order.product_name,
          quantity: 1,
          unit_price: Number(order.total),
          currency_id: order.currency
        }],
        external_reference: order.order_id,
        metadata: { digital_product_order_id: order.order_id },
        notification_url: `${siteBase}/api/digital-products/webhook`,
        back_urls: {
          success: `${siteBase}/mis-compras.html?order=${encodeURIComponent(order.order_id)}`,
          pending: `${siteBase}/mis-compras.html?order=${encodeURIComponent(order.order_id)}`,
          failure: `${siteBase}/productos.html?payment=failed&product=${encodeURIComponent(order.product_id)}`
        },
        auto_return: 'approved'
      }),
      signal: AbortSignal.timeout(8000)
    });
    if (!preferenceResponse.ok) {
      console.error(`[digital-products] Mercado Pago preference returned HTTP ${preferenceResponse.status}`);
      return json(res, 502, { error: 'No fue posible iniciar el pago. Inténtalo nuevamente.' });
    }
    const preference = await preferenceResponse.json();
    const initPoint = checkoutUrl(preference, preference?.id, order.order_id);
    if (typeof preference?.id !== 'string' || !preference.id || !initPoint) {
      return json(res, 502, { error: 'El proveedor no devolvió un enlace de pago válido.' });
    }
    const { data: saved, error: saveError } = await supabase.rpc('set_digital_product_preference', {
      p_order_id: order.order_id,
      p_preference_id: preference.id
    });
    if (saveError) {
      console.error('[digital-products] Could not persist Mercado Pago preference reference');
      return json(res, 502, { error: 'No se pudo confirmar el enlace de pago.' });
    }
    if (saved !== true) {
      const { data: currentOrder, error: currentOrderError } = await supabase.from('digital_product_orders')
        .select('provider_preference_id').eq('id', order.order_id).eq('user_id', user.id).maybeSingle();
      if (currentOrderError || typeof currentOrder?.provider_preference_id !== 'string') {
        console.error('[digital-products] conflicting preference could not be reconciled');
        return json(res, 502, { error: 'No se pudo confirmar el enlace de pago.' });
      }
      const winnerInitPoint = await readPreference(currentOrder.provider_preference_id, order.order_id, config);
      if (!winnerInitPoint) return json(res, 502, { error: 'No se pudo recuperar el enlace de pago.' });
      return json(res, 200, { orderId: order.order_id, status: 'pending', initPoint: winnerInitPoint });
    }
    return json(res, 200, { orderId: order.order_id, status: 'pending', initPoint });
  } catch (error) {
    const safeName = /^[A-Za-z]+$/.test(error?.name || '') ? error.name : 'Error';
    console.error(`[digital-products] order request failed (${safeName})`);
    return json(res, 502, { error: 'No se pudo iniciar la compra. Inténtalo nuevamente.' });
  }
};

module.exports.checkoutUrl = checkoutUrl;
