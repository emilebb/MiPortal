# Activar el formulario de contacto

`POST /api/contact` envía el mensaje directamente con **Resend**. No usa n8n,
webhooks ni colas, y no depende de Supabase. Un `202` significa que Resend
aceptó el mensaje; no garantiza que ya esté en la bandeja del destinatario.

## Configuración

1. Creá una cuenta en [Resend](https://resend.com), verificá un dominio que
   controles y generá una API key de envío (`re_...`). El remitente debe ser una
   dirección simple de ese dominio verificado, sin nombre ni `<corchetes>`.
2. Definí estas variables de entorno. En local van en `.env` (copia de
   `.env.example`); en producción van en el panel de tu hosting.

   | Variable | Valor requerido |
   | --- | --- |
   | `RESEND_API_KEY` | API key real de envío de Resend |
   | `RESEND_FROM_EMAIL` | Dirección simple en tu dominio verificado, ej. `contacto@tudominio.com` |
   | `CONTACT_TO_EMAIL` | `emile.123455@gmail.com` |

   El contacto **no** necesita `SUPABASE_SECRET_KEY`, `NEWSLETTER_HASH_SECRET`
   ni `CONTACT_HASH_SECRET`; esas variables solo pertenecen al newsletter.
3. Desplegá con el `vercel.json` actual: `public/` es la salida estática y
   `api/contact.js` es la función serverless de Vercel (Node 20+).
4. Orígenes de producción permitidos en el handler: `https://miportal.me`,
   `https://www.miportal.me` y `https://mi-portal-seven.vercel.app`. En
   desarrollo local también se aceptan `http://localhost:*` y
   `http://127.0.0.1:*`. Si cambiás de dominio, actualizá la lista `origins` de
   `api/contact.js`.

## Comportamiento y protección

- El servidor valida JSON (máximo 24.000 bytes), campos permitidos, nombre
  (2–100), correo, asunto (3–150) y mensaje (10–5000). Rechaza caracteres de
  control y orígenes no confiables.
- El honeypot `website` debe llegar vacío; un bot que lo complete recibe `400`.
- Limitador básico **en memoria por instancia**: 6 envíos por hora por IP, 6 por
  hora por correo y 50 globales por hora. Las claves se guardan como hash
  SHA-256, nunca el valor crudo. Al ser por instancia, no comparte estado entre
  regiones; Resend aplica además sus propios límites.
- Si falta configuración, el handler responde `500` con un mensaje claro y
  registra en el log del servidor el nombre de la variable faltante. No hay
  rutas que devuelvan `503` por configuración incompleta.
- Errores del proveedor: `502`; timeout: `504`; conflicto de idempotencia:
  `409`; límite alcanzado: `429` con `Retry-After`. El texto del formulario se
  conserva ante cualquier error y el botón se libera.
- Resend recibe texto plano, `from`/`to` controlados por el servidor y el correo
  validado del visitante en `reply_to`. El visitante no puede fijar destinatarios
  ni HTML.

## Arquitectura actual

El correo lo envía `api/contact.js` directamente vía Resend. Las noticias se
cargan con `js/news-feed.mjs` a través de rss2json en el navegador. El sitio no
requiere workflow, cola ni credencial de automatización de terceros.

## Verificación local (sin enviar correo real)

```sh
node --test scripts/contact.test.cjs scripts/contact-browser.test.mjs
npm run build
node --test scripts/contact-static.test.cjs
```

Los tests de la API reemplazan todas las llamadas `fetch` y usan secretos
falsos. Los de navegador sirven fixtures locales y bloquean HTTPS externo. El
test estático comprueba que `public/` no filtre configuración del servidor.

## Referencias verificadas

Consultadas el 2026-09-17:

- [Resend send email](https://resend.com/docs/api-reference/emails/send-email):
  `reply_to`, payload de texto y respuesta `{ "id": "..." }`.
- [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys):
  `Idempotency-Key`, retención de 24 horas y conflicto.
- [Resend errors](https://resend.com/docs/api-reference/errors): errores del
  proveedor, dominio verificado y límites de tasa.
- [Vercel request headers](https://vercel.com/docs/headers/request-headers):
  semántica de la IP de cliente.
