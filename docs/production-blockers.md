# Bloqueos para producción — estado vigente

El código sigue en una rama local. No se ha autorizado ni realizado publicación, cobro, migración productiva o reducción de beneficios Pro.

| Prioridad | Bloqueo | Intervención mínima | Criterio verificable de cierre |
|---|---|---|---|
| P0 | Origen de la cuenta Pro sin pagos | Propietario: evidencia conservada de concesión/pago/importación/cambio de rol. No basta una suposición | Origen documentado y decisión explícita sobre beneficios. Migración autorizada separadamente; hasta entonces se conserva Pro |
| P0 | Cuatro suites de navegador | Entorno aislado compatible con Chrome/Chromium y sandbox activo; no publicar la rama automáticamente para conseguirlo | Las cuatro suites y sus subpruebas terminan y sus aserciones pasan; corregir fallos funcionales que aparezcan |
| P0 | Migraciones no validadas en PostgreSQL 17 con concurrencia real | Base de pruebas aislada y representativa, sin datos privados productivos | RLS, eventos duplicados/fuera de orden, renovaciones, revocaciones, preservación de admin/Pro y rollback verificados |
| P0 antes de activar ventas | Configuración Vercel y sandbox Mercado Pago | Lectura del proyecto correcto y entorno de prueba autorizado; no claves por chat | SHA/configuración correlacionados, notificación firmada real de sandbox y ciclo de vida verificado sin cobros reales |
| P1 | n8n sin sesión ni exportaciones | Flujos y ejecuciones saneados, o acceso granular de lectura si el plan lo permite | Contacto/asistente/noticias/Daily con autenticación, respuesta, errores e idempotencia revisados; ensayos solo en entorno autorizado |
| P1 | Correo y recuperación Auth sin validación externa completa | Cuentas de prueba y proveedor de pruebas autorizado | Confirmación, baja, reintento, recuperación y entrega comprobados sin enviar a usuarios reales |
| P1 | Imágenes pequeñas y derechos pendientes | Originales autorizados o evidencia de licencia/procedencia por imagen | Resolución adecuada al uso, recorte móvil/escritorio y derechos registrados. Evitar ampliación no recupera resolución |
| P1 | Alcance editorial, catálogo y datos legales | Definición del propietario y datos verificables del titular | Noticias coherentes con el alcance acordado; fichas legales completas; no vender productos indefinidos |
| P1 | Rendimiento y accesibilidad completos | Entorno de navegador compatible, dispositivos y lecturas de Vercel | Métricas por ruta, contraste, zoom, teclado y lector de pantalla con evidencia; no deducir CWV de bytes locales |
| P1 | Recuperación productiva | Solo lectura de metadatos de backups y evidencia de ensayo aislado | Copia, retención, restauración de prueba y plan de reversión comprobados antes de pedir autorización de lanzamiento |

Los pasos concretos por plataforma están en `Accesos-lectura-MiPortal.md`. No hace falta conceder escritura ni enviar contraseñas, claves o tokens. Supabase ya permite la lectura necesaria para continuar consultando evidencia disponible.

## Avance de validación

- **Resuelto localmente:** contraste del acceso en oscuro, nombre accesible del logo, jerarquía de encabezados, foco del bloque de código y lectura de fechas. URLs con credenciales rechazadas. 170 pruebas unitarias/integración aprobadas.
- **Nueva verificación disponible:** auditoría reproducible en navegador normal/integrado sin CDP. Matriz consolidada de 76 escenarios con 0 violaciones detectadas, sin errores finales/desbordamiento y 152 avisos incompletos de revisión manual. No sustituye las cuatro suites CDP ni WCAG completa. Ver `Validacion-local-reproducible.md` y los JSON originales/consolidados.
- **Continúa bloqueado:** cuatro suites CDP por arranque nativo; WSL no instalado y sin Docker/Podman. No se alteró el sistema. Ejecutar en otra máquina compatible desde el ZIP, sin publicar la rama ni desactivar sandbox.
- **Pro intacto:** origen sin demostrar, guard de migración conservado y ninguna escritura productiva. El trigger actual crea viewer; la proximidad entre el commit Pro y el alta del perfil no prueba un pago ni una concesión manual.
- **Acceso pendiente:** Vercel mantiene 403; n8n está sin sesión; Supabase ya permite lectura. Ver pasos mínimos en `Accesos-lectura-MiPortal.md`.
- **Imágenes:** 258 propuestas concretas preparadas con fuente y requisitos de derechos. Son propuestas pendientes, no sustituciones autorizadas ni imágenes declaradas aptas para publicar.
- **Antes de producción:** mantener todas las puertas de la tabla anterior: PostgreSQL 17/concurrencia, sandbox de proveedores, backups/restauración aislada, manual de accesibilidad/dispositivos, métricas reales y revisión de originales/datos legales.

No se han ejecutado cobros, migraciones, cambios de permisos productivos ni despliegues. El proyecto todavía no está validado para producción.
