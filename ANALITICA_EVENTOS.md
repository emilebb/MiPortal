# Propuesta de eventos de analítica

Este documento propone ubicaciones para eventos futuros; el sitio todavía no integra estos eventos. No se han añadido eventos de GTM.

| Evento | Ubicación sugerida | Cuándo emitir |
| --- | --- | --- |
| `newsletter_signup` | `js/newsletter.js`, tras una respuesta exitosa de `/api/newsletter` | Solo con consentimiento analítico vigente. |
| `tutorial_open` | En el enlace al artículo desde `tutoriales.html` | Solo con consentimiento analítico vigente. |
| `resource_open` | En el enlace saliente de cada tarjeta de `recursos.html` | Solo con consentimiento analítico vigente. |
| `lead_magnet_interest` | En la CTA de newsletter de `automatizaciones-n8n.html` | Solo con consentimiento analítico vigente; no equivale a entrega o descarga. |
| `product_interest` | En la CTA informativa de `productos.html` | Solo con consentimiento analítico vigente; no representa una compra. |

Política: escuchar o emitir eventos únicamente después del consentimiento analítico. Nunca incluir correos, nombres, identificadores de cuenta, contenido de formularios ni otros datos personales.
