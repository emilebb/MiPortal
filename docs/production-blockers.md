# Bloqueos para producción — estado vigente

El código está en `codex/miportal-critical-fixes` (`86c0961d124cd6c91d4c088ff4ff488fde08c0f4`). Vercel informa un preview `READY` para ese SHA. Producción sigue en `main` (`1b6eb4ba35688d613b8c502a826f386bf6e9995b`). No se ha autorizado ni realizado despliegue productivo, cobro, migración productiva o reducción de beneficios Pro.

| Prioridad | Bloqueo | Intervención mínima | Criterio verificable de cierre |
|---|---|---|---|
| P0 | Origen de la cuenta Pro sin pagos | Propietario: evidencia conservada de concesión/pago/importación/cambio de rol. No basta una suposición | Origen documentado y decisión explícita sobre beneficios. Migración autorizada separadamente; hasta entonces se conserva Pro |
| Resuelto localmente, no es aprobación de lanzamiento | Cuatro suites de navegador | Chrome local, sandbox activo, fixtures aislados y sin proveedores externos | `npm run test:browser`: 21/21 aprobadas. No se ejecutaron cuentas reales ni administración remota |
| Verificado en entorno aislado; producción sin cambios | Migraciones Pro/cuotas y concurrencia | Contenedor efímero Docker PostgreSQL 17.11, red aislada, sin puertos ni volúmenes, datos ficticios | Esquema base y migraciones aplicados; dos eventos concurrentes del mismo pago dejaron una fila/subscripción; 10 reservas concurrentes dieron exactamente 5 permitidas y 5 denegadas; consulta RLS como viewer aisló perfiles y leyó su entitlement. No cubre todas las carreras de proveedor ni restaura una copia productiva |
| P0 antes de activar ventas | Mercado Pago | `MERCADOPAGO_MODE` falta en el inventario de Vercel; propietario debe confirmar modo y credenciales sandbox. No leer ni enviar secretos, no usar credenciales live | Configuración sandbox correlacionada, firma de proveedor comprobada y ciclo de vida verificado sin cobros reales. No ejecutado |
| P1 | n8n sin sesión ni exportaciones | Flujos y ejecuciones saneados, o acceso granular de lectura si el plan lo permite | Contacto/asistente/noticias/Daily con autenticación, respuesta, errores e idempotencia revisados; ensayos solo en entorno autorizado |
| P1 | Correo y recuperación Auth sin validación externa completa | Cuentas de prueba y proveedor de pruebas autorizado | Confirmación, baja, reintento, recuperación y entrega comprobados sin enviar a usuarios reales |
| P1 | Imágenes pequeñas y derechos pendientes | Originales autorizados o evidencia de licencia/procedencia por imagen | Resolución adecuada al uso, recorte móvil/escritorio y derechos registrados. Evitar ampliación no recupera resolución |
| P1 | Alcance editorial, catálogo y datos legales | Definición del propietario y datos verificables del titular | Noticias coherentes con el alcance acordado; fichas legales completas; no vender productos indefinidos |
| P1 | Rendimiento y accesibilidad completos | Métricas de producción, prueba de zoom/teclado/lector de pantalla y revisión visual humana | Axe: 76/76 escenarios anónimos (19 páginas × 2 anchos × 2 temas), 0 violaciones, 0 desbordamientos y 152 `incomplete` para revisión. Se agrupan en contraste sobre gradientes y nombres visibles de controles con iconos; no equivalen a conformidad WCAG. CWV reales siguen sin medirse |
| P1 | Recuperación productiva | Solo lectura de metadatos de backups y evidencia de ensayo aislado | Copia, retención, restauración de prueba y plan de reversión comprobados antes de pedir autorización de lanzamiento |

Los pasos concretos por plataforma están en `Accesos-lectura-MiPortal.md`. No hace falta conceder escritura ni enviar contraseñas, claves o tokens. Supabase ya permite la lectura necesaria para continuar consultando evidencia disponible.

## Avance de validación (16 de octubre de 2026)

- **Resuelto localmente:** contraste del acceso en oscuro, nombre accesible del logo, jerarquía de encabezados, foco del bloque de código y lectura de fechas. URLs con credenciales rechazadas. `npm test`: 191/191 aprobadas, incluidas suites de Chrome con fixtures.
- **Accesibilidad automática:** `artifacts/accessibility-current.json` registra 76/76 casos, sin violaciones, errores ni desbordamientos. Los 152 `incomplete` se repiten por escenario: 76 contrastes no determinados sobre gradientes y 76 revisiones de nombre/etiqueta en controles con iconos. El inspector no resolvió manualmente el contraste real; falta revisar combinaciones visibles y probar con lector de pantalla. No equivale a WCAG completa.
- **Navegador:** las cuatro suites antes bloqueadas pasaron ahora localmente con Chrome; la suite de navegador informa 21/21. Las cuentas reales, el panel protegido y proveedores reales siguen fuera del alcance.
- **Pro intacto:** Supabase de solo lectura muestra 1 perfil `pro`, 0 pagos y que no existe `pro_subscriptions`; la migración nueva no está aplicada. Se conserva el guard de migración. Sin evidencia histórica, el origen no queda demostrado y no se altera el beneficio.
- **Vercel:** lectura disponible para `mi-portal`; preview del SHA indicado está `READY`, producción continúa en el SHA de `main`. La lista de variables se leyó con `decrypt=false`; no se leyeron valores secretos. n8n sigue requiriendo sesión. Ver pasos mínimos en `Accesos-lectura-MiPortal.md`.
- **Imágenes:** 258 propuestas concretas preparadas con fuente y requisitos de derechos. Son propuestas pendientes, no sustituciones autorizadas ni imágenes declaradas aptas para publicar.
- **Antes de producción:** mantener todas las puertas de la tabla anterior: PostgreSQL 17/concurrencia, sandbox de proveedores, backups/restauración aislada, manual de accesibilidad/dispositivos, métricas reales y revisión de originales/datos legales.

No se han ejecutado cobros, migraciones productivas, cambios de permisos productivos ni despliegues productivos. El proyecto todavía no está validado para producción.
