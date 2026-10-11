'use strict';

const {
  createServiceClient, configError, getUser, json, methodNotAllowed,
  readConfig, readJsonBody, requireOrigin, uuidPattern
} = require('../../lib/digital-products-api');

const bucket = 'miportal-digital-products';

module.exports = async function handler(req, res) {
  if (methodNotAllowed(req, res, 'POST') || requireOrigin(req, res)) return;
  const parsed = readJsonBody(req);
  if (parsed.error) return json(res, parsed.error.status, { error: parsed.error.message });
  const { grantId } = parsed.body;
  if (typeof grantId !== 'string' || !uuidPattern.test(grantId)) {
    return json(res, 400, { error: 'Descarga no válida.' });
  }
  const config = readConfig();
  if (configError(config, res)) return;
  const user = await getUser(req, config);
  if (!user) return json(res, 401, { error: 'Inicia sesión para descargar.' });

  const supabase = createServiceClient(config);
  try {
    const { data: grant, error: grantError } = await supabase.rpc('get_digital_download_grant', {
      p_grant_id: grantId,
      p_user_id: user.id
    });
    if (grantError) {
      console.error('[digital-products] download grant lookup failed');
      return json(res, 502, { error: 'No se pudo verificar el permiso de descarga.' });
    }
    if (!grant || typeof grant.storage_path !== 'string' || typeof grant.product_id !== 'string' ||
        !uuidPattern.test(grant.product_id) || !grant.storage_path.startsWith(`${grant.product_id}/`) ||
        grant.storage_path.includes('..') || grant.storage_path.includes('\\') ||
        typeof grant.original_filename !== 'string' || /[\/\\\0-\x1f\x7f]/.test(grant.original_filename)) {
      return json(res, 404, { error: 'No se encontró una descarga autorizada.' });
    }
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(
      grant.storage_path, 60, { download: grant.original_filename }
    );
    if (error || typeof data?.signedUrl !== 'string') {
      console.error('[digital-products] signed URL generation failed');
      return json(res, 502, { error: 'No se pudo preparar el enlace temporal.' });
    }
    const signedUrl = new URL(data.signedUrl, config.database.origin);
    if (signedUrl.origin !== config.database.origin) {
      return json(res, 502, { error: 'El enlace de descarga no es válido.' });
    }
    return json(res, 200, { downloadUrl: signedUrl.href, expiresIn: 60 });
  } catch (error) {
    const safeName = /^[A-Za-z]+$/.test(error?.name || '') ? error.name : 'Error';
    console.error(`[digital-products] download preparation failed (${safeName})`);
    return json(res, 502, { error: 'No se pudo preparar la descarga.' });
  }
};
