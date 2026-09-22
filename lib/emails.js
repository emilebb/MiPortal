'use strict';
// ============================================================================
// MiPortal — plantillas de correo transaccional (Resend)
// ----------------------------------------------------------------------------
// Solo se usa del lado del servidor (api/contact.js y api/newsletter.js).
// HTML compatible con Gmail, Outlook y clientes móviles: tabla 600px, estilos
// inline, botones "bulletproof" con fallback MSO y versión text/plain.
// Branding: azul #1769e0 (logo), acento #f4b942, fondo #f6f8fa.
// ============================================================================

const SITE_URL = 'https://www.miportal.me';

const CARD = {
  outer: '#f6f8fa',
  card: '#ffffff',
  footer: '#eef2f7',
  blue: '#1769e0',
  accent: '#f4b942',
  text: '#1e293b',
  muted: '#475569',
  border: '#e2e8f0'
};

const baseFont = 'font-family:Arial,Helvetica,sans-serif;';

// Escapa datos de usuario antes de insertarlos en HTML (anti HTML injection).
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(date = new Date()) {
  try {
    return new Intl.DateTimeFormat('es-AR', {
      dateStyle: 'long', timeStyle: 'short'
    }).format(date);
  } catch {
    return String(date);
  }
}

// Botón accionable compatible con Outlook (fallback MSO) y resto de clientes.
function button(url, label) {
  const href = escapeHtml(url);
  const text = escapeHtml(label);
  const style = baseFont +
    'display:inline-block;background:' + CARD.blue +
    ';border-radius:10px;color:#ffffff;font-size:16px;line-height:1.4;' +
    'font-weight:700;text-decoration:none;padding:14px 32px;' +
    'border:1px solid ' + CARD.blue + ';mso-padding-alt:0;';
  return '<!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td style="border-radius:10px;background:' + CARD.blue + ';padding:14px 32px;"><a href="' + href + '" style="' + baseFont + 'font-size:16px;line-height:1.4;font-weight:700;color:#ffffff;text-decoration:none;">' + text + '</a></td></tr></table><![endif]-->' +
    '<!--[if !mso]><!--><a class="MiportalCta" href="' + href + '" style="' + style + '">' + text + '</a><!--<![endif]-->';
}

function textLink(url, label) {
  const href = escapeHtml(url);
  const text = escapeHtml(label);
  return '<a href="' + href + '" style="' + baseFont + 'color:' + CARD.blue +
    ';text-decoration:underline;font-weight:600;">' + text + '</a>';
}

// Encabezado de marca: se usa texto "MiPortal" porque los clientes de correo
// no renderizan SVG (Gmail/Outlook) y no existe un logo PNG estable público.
function headerRow() {
  return '<tr><td align="left" bgcolor="' + CARD.blue + '" style="' + baseFont +
    'background:' + CARD.blue + ';border-radius:12px 12px 0 0;padding:26px 36px;">' +
    '<div style="' + baseFont + 'font-size:22px;line-height:1.2;font-weight:700;' +
    'color:#ffffff;letter-spacing:-0.2px;">MiPortal<span style="color:' + CARD.accent +
    ';">.me</span></div></td></tr>' +
    '<tr><td height="4" bgcolor="' + CARD.accent + '" style="height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>';
}

function footerHtml(origin, note) {
  return '<tr><td align="center" bgcolor="' + CARD.footer + '" style="' + baseFont +
    'background:' + CARD.footer + ';border:1px solid ' + CARD.border +
    ';border-top:0;border-radius:0 0 12px 12px;padding:22px 24px;">' +
    '<div style="font-size:14px;line-height:1.5;font-weight:700;color:' + CARD.text +
    ';">' + escapeHtml(origin) + '</div>' +
    '<a href="' + escapeHtml(SITE_URL) + '" style="' + baseFont + 'font-size:13px;' +
    'line-height:1.5;color:' + CARD.muted + ';text-decoration:none;">' +
    escapeHtml('www.miportal.me') + '</a>' +
    (note ? '<p style="font-size:12px;line-height:1.5;color:' + CARD.muted +
      ';margin:12px 0 0 0;">' + escapeHtml(note) + '</p>' : '') +
    '</td></tr>';
}

function page(title, body, footer) {
  return '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">\n' +
    '<html lang="es" xmlns="http://www.w3.org/1999/xhtml">\n<head>\n' +
    '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<meta http-equiv="X-UA-Compatible" content="IE=edge">\n' +
    '<meta name="x-apple-disable-message-reformatting">\n' +
    '<title>' + escapeHtml(title) + '</title>\n' +
    '<!--[if gte mso 15]>\n<style>table,td,a{font-family:Arial,Helvetica,sans-serif !important;}</style>\n<![endif]-->\n' +
    '<style>@media only screen and (max-width:600px){.MiportalWrap{width:100% !important;}.' +
    'MiportalBody{padding:28px 20px !important;}.MiportalContent{padding:26px 20px !important;}' +
    '.MiportalCta{display:block !important;text-align:center;}}</style>\n' +
    '</head>\n<body style="' + baseFont + 'margin:0;padding:0;background-color:' + CARD.outer +
    ';color:' + CARD.text + ';-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">\n' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + CARD.outer + '">\n' +
    '<tr><td align="center" style="padding:28px 16px;">\n' +
    '<table role="presentation" class="MiportalWrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;margin:0 auto;border-collapse:collapse;">\n' +
    headerRow() +
    '<tr><td class="MiportalBody" align="left" bgcolor="' + CARD.card + '" style="' + baseFont +
    'background:' + CARD.card + ';padding:34px 36px;border-left:1px solid ' + CARD.border +
    ';border-right:1px solid ' + CARD.border + ';">' + body + '</td></tr>\n' +
    footer +
    '</table>\n</td></tr>\n</table>\n</body>\n</html>';
}

function fieldRow(label, valueHtml) {
  return '<tr><td width="96" valign="top" style="' + baseFont + 'font-size:12px;line-height:1.4;' +
    'font-weight:700;color:' + CARD.muted + ';text-transform:uppercase;letter-spacing:.06em;' +
    'padding:0 0 16px 0;">' + escapeHtml(label) + '</td>' +
    '<td valign="top" style="' + baseFont +
    'font-size:16px;line-height:1.5;color:' + CARD.text + ';padding:0 0 16px 0;' +
    'overflow-wrap:break-word;word-break:break-word;">' + valueHtml + '</td></tr>';
}

// ----------------------------------------------------------------------------
// Correo de contacto → administrador (CONTACT_TO_EMAIL)
// ----------------------------------------------------------------------------
function buildContactEmail({ name, email, subject, message, date = new Date() }) {
  const mailto = 'mailto:' + email + '?subject=' +
    encodeURIComponent('Re: ' + subject);
  const messageHtml = (message || '').split(/\r?\n/u).map(escapeHtml).join('<br>');

  const body =
    '<h1 style="' + baseFont + 'margin:0 0 8px 0;font-size:24px;line-height:1.25;font-weight:700;' +
    'color:' + CARD.text + ';">Nuevo mensaje de contacto</h1>\n' +
    '<p style="' + baseFont + 'margin:0 0 26px 0;font-size:15px;line-height:1.5;color:' + CARD.muted +
    ';">Alguien envió un mensaje desde el formulario de contacto de MiPortal.</p>\n' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="MiportalContent">\n' +
    fieldRow('Nombre', escapeHtml(name)) +
    fieldRow('Correo', textLink('mailto:' + email, email)) +
    fieldRow('Asunto', escapeHtml(subject)) +
    fieldRow('Mensaje', '<div>' + messageHtml + '</div>') +
    fieldRow('Fecha', escapeHtml(formatDate(date))) +
    '</table>\n' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">' +
    '<tr><td style="padding:8px 0 22px 0;border-top:1px solid ' + CARD.border + ';font-size:0;line-height:0;">&nbsp;</td></tr>' +
    '<tr><td align="center" style="padding:0 0 22px 0;">' +
    button(mailto, 'RESPONDER AL USUARIO') +
    '</td></tr></table>';

  const text =
    'Nuevo mensaje de contacto — MiPortal\n\n' +
    'Nombre: ' + name + '\n' +
    'Correo: ' + email + '\n' +
    'Asunto: ' + subject + '\n' +
    'Mensaje:\n' + message + '\n\n' +
    'Fecha: ' + formatDate(date) + '\n\n' +
    'Responder: ' + mailto + '\n\n' +
    '---\nEste mensaje fue enviado desde MiPortal.\n' + SITE_URL;

  return {
    html: page('Nuevo mensaje de contacto — MiPortal', body,
      footerHtml('MiPortal', 'Este mensaje fue enviado desde MiPortal.')),
    text
  };
}

// ----------------------------------------------------------------------------
// Correo de bienvenida / confirmación de suscripción → el suscriptor
// ----------------------------------------------------------------------------
function buildWelcomeEmail({ confirmUrl, unsubscribeUrl }) {
  const haveConfirm = typeof confirmUrl === 'string' && confirmUrl.length > 0;

  const body =
    '<h1 style="' + baseFont + 'margin:0 0 8px 0;font-size:24px;line-height:1.25;font-weight:700;' +
    'color:' + CARD.text + ';">¡Bienvenido a MiPortal! 👋</h1>\n' +
    '<p style="' + baseFont + 'margin:0 0 16px 0;font-size:16px;line-height:1.5;color:' + CARD.text +
    ';">Gracias por suscribirte.</p>\n' +
    '<p style="' + baseFont + 'margin:0 0 26px 0;font-size:16px;line-height:1.5;color:' + CARD.muted +
    ';">A partir de ahora podrás recibir novedades, actualizaciones y contenido de MiPortal ' +
    'directamente en tu correo.</p>\n' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">' +
    '<tr><td align="center" style="padding:0 0 26px 0;">' +
    button(SITE_URL, 'VISITAR MIPORTAL') +
    '</td></tr></table>\n' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">' +
    '<tr><td style="padding:0 0 6px 0;border-top:1px solid ' + CARD.border + ';font-size:0;line-height:0;">&nbsp;</td></tr></table>\n' +
    (haveConfirm
      ? '<p style="' + baseFont + 'font-size:13px;line-height:1.5;color:' + CARD.muted + ';margin:14px 0 4px 0;">' +
        textLink(confirmUrl, 'Confirmar suscripción') + '</p>'
      : '') +
    '<p style="' + baseFont + 'font-size:13px;line-height:1.5;color:' + CARD.muted + ';margin:0 0 0 0;">' +
    textLink(unsubscribeUrl, 'Cancelar suscripción') + '</p>';

  const text =
    '¡Bienvenido a MiPortal! 👋\n\n' +
    'Gracias por suscribirte.\n' +
    'A partir de ahora podrás recibir novedades, actualizaciones y contenido de MiPortal ' +
    'directamente en tu correo.\n\n' +
    'Visitar MiPortal: ' + SITE_URL + '\n\n' +
    (haveConfirm ? 'Confirmar suscripción: ' + confirmUrl + '\n' : '') +
    'Cancelar suscripción: ' + unsubscribeUrl + '\n\n' +
    '---\nMiPortal · ' + SITE_URL + '\n' +
    'Has recibido este correo porque te suscribiste a las novedades de MiPortal.';

  return {
    html: page('¡Bienvenido a MiPortal! 🎉', body,
      footerHtml('MiPortal', 'Has recibido este correo porque te suscribiste a las novedades de MiPortal.')),
    text
  };
}

// ----------------------------------------------------------------------------
// Correo de novedad → suscriptores confirmados al publicar un recurso
// ----------------------------------------------------------------------------
function buildNewsEmail({ title, description, url, date, imageUrl, unsubscribeUrl }) {
  const safeTitle = escapeHtml(title || 'Nueva publicación');
  const pubDate = date ? escapeHtml(formatDate(date)) : '';
  const imageRow = imageUrl
    ? '<tr><td align="center" style="padding:0 0 24px 0;">' +
      '<a href="' + escapeHtml(url) + '" style="' + baseFont + 'text-decoration:none;">' +
      '<img src="' + escapeHtml(imageUrl) + '" alt="Imagen de la publicación: ' + safeTitle +
      '" width="100%" style="display:block;width:100%;max-width:528px;height:auto;' +
      'border-radius:12px;border:1px solid ' + CARD.border + ';"></a></td></tr>'
    : '';

  const body =
    '<h1 style="' + baseFont + 'margin:0 0 8px 0;font-size:23px;line-height:1.25;font-weight:700;' +
    'color:' + CARD.text + ';">¡Tenemos una nueva publicación! 🎉</h1>\n' +
    '<p style="' + baseFont + 'margin:0 0 24px 0;font-size:15px;line-height:1.5;color:' + CARD.muted +
    ';">Hemos publicado contenido nuevo en MiPortal y pensamos que te puede interesar.</p>\n' +
    imageRow +
    '<h2 style="' + baseFont + 'margin:0 0 12px 0;font-size:21px;line-height:1.3;font-weight:700;' +
    'color:' + CARD.text + ';">' + safeTitle + '</h2>\n' +
    '<p style="' + baseFont + 'margin:0 0 18px 0;font-size:16px;line-height:1.6;color:' + CARD.text +
    ';">' + escapeHtml(description || '') + '</p>\n' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">' +
    '<tr><td align="center" style="padding:0 0 22px 0;">' +
    button(url, 'LEER PUBLICACIÓN') +
    '</td></tr></table>\n' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">' +
    '<tr><td style="padding:0 0 14px 0;border-top:1px solid ' + CARD.border + ';font-size:0;line-height:0;">&nbsp;</td></tr></table>\n' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">' +
    (pubDate
      ? fieldRow('Publicado', '<span style="font-weight:600;">' + pubDate + '</span>')
      : '') +
    '</table>\n' +
    '<p style="' + baseFont + 'font-size:13px;line-height:1.5;color:' + CARD.muted + ';margin:6px 0 0 0;">' +
    textLink(typeof unsubscribeUrl === 'string' && unsubscribeUrl ? unsubscribeUrl : SITE_URL, 'Cancelar suscripción') +
    '</p>';

  const text =
    '¡Tenemos una nueva publicación!\n\n' +
    (title ? title + '\n\n' : '') +
    (description ? description + '\n\n' : '') +
    (pubDate ? 'Publicado: ' + pubDate + '\n\n' : '') +
    'Leer publicación: ' + url + '\n\n' +
    'Cancelar suscripción: ' + unsubscribeUrl + '\n\n' +
    '---\nMiPortal · ' + SITE_URL + '\n' +
    'Has recibido este correo porque te suscribiste a las novedades de MiPortal.';

  return {
    subject: `Nuevo en MiPortal: ${String(title || 'nueva publicación').replace(/[\r\n]+/g, ' ').trim()}`,
    html: page('Nuevo en MiPortal: ' + safeTitle, body,
      footerHtml('MiPortal', 'Estás recibiendo este correo porque te suscribiste a las novedades de MiPortal.')),
    text
  };
}

module.exports = { escapeHtml, buildContactEmail, buildWelcomeEmail, buildNewsEmail, SITE_URL };