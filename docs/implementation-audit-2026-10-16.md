# MiPortal.me — correcciones implementadas y estado verificable

Fecha: 16 de octubre de 2026. Rama local: `codex/miportal-critical-fixes`.
Base: `1b6eb4ba35688d613b8c502a826f386bf6e9995b`, del repositorio `emilebb/MiPortal`.

## Resultado de esta fase

Se implementaron correcciones de pagos, suscripciones, permisos, cuotas del asistente, newsletter, privacidad y presentación. Hay dos migraciones nuevas preparadas y pruebas de regresión. **El proyecto no está terminado y estas correcciones no están desplegadas en producción.**

La carpeta original compartida se leyó y se conservó. La rama está en una copia completa del repositorio dentro del espacio de trabajo de esta conversación. El paquete de entrega permite revisar o recuperar esa rama en el repositorio original. No se fusionaron ramas, no se publicaron cambios, no se ejecutaron cobros ni se enviaron correos reales.

## Inventario de módulos

| Módulo y rutas | Estado comprobado | Dependencias y verificación restante |
|---|---|---|
| Inicio `/`, `index.html` | Lectura pública y local; navegación; medidas responsive | Daily y noticias dependen de Supabase; relevancia editorial completa pendiente |
| Daily en portada | Lectura pública; tests; mitigación local del caso React/IMDb | Falta revisar el workflow que lo genera; no se borraron ni reescribieron datos publicados |
| Noticias `noticias.html` | Consulta, clasificación, filtros y estados cubiertos por pruebas | Suite visual completa bloqueada; revisión editorial de todas las fuentes pendiente |
| Detalle `noticia.html?id=…` | Una noticia abierta en producción y local; imagen medida; tests de URLs y relacionados | Derechos y originales de alta resolución pendientes; SEO dinámico por artículo por revisar |
| Búsqueda `buscar.html` | Consulta HTML devolvió dos resultados también en la versión local modificada | No equivale a haber revisado todas las consultas de usuarios |
| Tutoriales `tutoriales.html`, `tutorial.html` | Una guía publicada; enlaces y transformaciones de compilación comprobados | Los temas futuros no son contenido implementado. Falta un plan editorial aprobado |
| Recursos `recursos.html` | Siete recursos publicados observados en metadatos; estados y autorización en pruebas | Comprobación visual automatizada completa pendiente |
| Productos `productos.html` | Catálogo informativo en preparación | No hay tienda definida para completar ni checkout de estos productos; no se inventaron ofertas |
| Automatizaciones `automatizaciones-n8n.html`, `automatizaciones-gratis.html` | Páginas de propuestas y newsletter; rutas internas comprobadas | No se anuncian descargas inexistentes; los workflows descargables siguen sin definirse |
| Contacto `contacto.html`, `/api/contact` | Validación y manejo de errores en pruebas | API deriva a n8n; no se comprobó entrega real, autorización del webhook ni ejecución del workflow |
| Newsletter `/api/newsletter`, `/api/newsletter-send` | Alta/confirmación/baja y envío con proveedores simulados; error de bienvenida corregido | Falta prueba de correo en sandbox o buzón de prueba y revisión de reintentos operativos |
| Cuenta `login.html`, `register.html`, `recovery.html`, `reset-password.html` | Tests de lógica de autenticación y RLS | Cuatro suites de navegador, incluida la de cuenta, bloqueadas por inicio de Chrome. No se crearon cuentas reales |
| Administración `admin/`, formulario de recursos | Lógica de publicación y políticas probadas en base aislada | Recorrido completo en navegador y contra entorno de pruebas pendiente |
| Pro, `/api/mp-preference`, `/api/webhook-mercadopago`, `gracias-pro.html` | Código corregido, API simulada y migraciones probadas en PostgreSQL embebido | Bloqueado para producción por cuenta Pro sin pagos, configuración, sandbox y autorización de lanzamiento |
| Asistente `/api/assistant` | Identidad verificada, cuotas persistentes, validación y fallos probados | Nueva migración necesaria; n8n requiere inicio de sesión; no se ejecutó ningún modelo real |
| Marca, imágenes sociales e iconos | Variantes PNG del SVG existente: 1200×630 y 180×180; inspección visual | No se cambió la identidad de marca ni se sustituyeron fotografías editoriales |
| Sobre nosotros, privacidad y términos | Rutas existentes y enlaces internos comprobados | Los documentos legales se declaran borradores incompletos; requieren información del titular y revisión antes de vender |

## Registro de correcciones

| Prioridad / problema | Cambio implementado | Evidencia | Producción |
|---|---|---|---|
| P0 — identidad en checkout | Valida bearer token con Supabase Auth y deriva el usuario del servidor; rechaza identificador ajeno | Tests de sesión ausente/expirada, suplantación y precio controlado por servidor | Pendiente |
| P0 — cobro sin infraestructura preparada | Exige modo test/production, secreto del webhook y disponibilidad de la RPC de vigencia antes de crear preferencia | Test de infraestructura ausente: 503 sin crear pago | Pendiente |
| P0 — firmas de pagos | Firma obligatoria con formato de comas, comparación segura e ID de consulta vinculado al cuerpo | Tests de firma válida, inválida, duplicada y ausente | Pendiente |
| P0 — modo y estado de pago | Reconsulta importe, moneda, usuario, ID, modo real/prueba y fechas del pago | Respuestas simuladas; cero llamadas a cuentas reales | Pendiente sandbox real |
| P0 — administrador convertido a Pro | Suscripción en tabla separada, sin escribir el rol administrativo | Test de administrador que compra y conserva admin | Pendiente migración |
| P1 — vigencia anual y renovación | Periodos calculados desde pagos válidos, renovación anual y consulta de expiración | Tests de renovación, vencimiento y compatibilidad con Pro pagado anterior | Pendiente migración |
| P0 — duplicados/reembolsos | Bloqueos transaccionales, identidad de pago única, orden temporal y revocación del periodo correspondiente | Tests de repetición, propietario distinto, reembolso y replay | Validar concurrencia nativa y sandbox |
| P1 — cuota compartida accidentalmente | Cinco consultas por cuenta en 24 horas móviles; límites por IP separados; persistencia en base | Tests entre cuentas/IP, vencimiento de ventana y distintos roles | Pendiente migración |
| P1 — éxito falso en newsletter | Alta pendiente se conserva; error del proveedor devuelve error y permite reintento; ventanas de idempotencia de diez minutos | Tests de Resend 401/429, respuesta incompleta, timeout y claves estables | Pendiente entrega real |
| P1 — anuncios invertidos | Pro oculta anuncios; cuentas gratuitas los muestran; checkout se oculta si no puede comprobarse la vigencia | Test ejecuta el comportamiento de main.js | Pendiente |
| P1 — falsa confirmación al volver del pago | Página consulta el estado real y no anuncia beneficios no definidos | Lectura local y prueba de estados; encabezados accesibles corregidos | Pendiente |
| P1 — rechazo de cookies | Rechazar y recargar no inicia GTM | Test de comportamiento del script | Pendiente |
| P1 — claves privilegiadas publicadas por error | Compilación rechaza sb_secret y JWT service_role antes de generar configuración pública | Test de dos tipos de clave privada con valores ficticios | Pendiente |
| P2 — React como verbo | Clasificador distingue la colisión de entretenimiento; Daily omite ese falso positivo sin inventar reemplazo | Tests y lectura local de contenido | Mitigación de interfaz; productor pendiente |
| P2 — miniatura ampliada | Imagen principal conserva como máximo su ancho original; prioridad y decodificación explícitas | Fuente observada: 120 px; pantalla local: 120 px; test de regresión | Falta original de calidad |
| P2 — formatos de marca | PNG derivados de los SVG existentes; referencias sociales y apple-touch compiladas en PNG | Archivos inspeccionados, 33.121 y 3.453 bytes | Pendiente |
| P3 — dependencias y cabeceras | Versión 2.116.0 fijada en paquete/CDN compilado; nosniff, política de referencias y protección contra marcos declaradas | Configuración revisada y audit de dependencias sin avisos conocidos | Cabeceras efectivas pendientes de despliegue |

El tratamiento de reembolsos parciales es conservador: revoca la concesión asociada. El titular debe confirmar esta política antes de lanzar. No se añadió una nueva oferta comercial.

## Pruebas y límites

- Resultado final: **150 pruebas unitarias y de integración satisfactorias, cero fallos**. Comando reproducible: `npm ci --ignore-scripts`, después `npm run test:unit`. El ejecutor prepara la configuración y el sitio, y corre las suites en serie: antes existía una carrera porque un test reconstruía public mientras otro lo leía.
- Las pruebas de base usan PGlite 0.5.10, PostgreSQL 18.6 embebido y desechable. Ejecutan SQL, triggers, permisos y RLS reales del motor, pero **no sustituyen una prueba en Supabase/PostgreSQL 17 ni una prueba de concurrencia entre conexiones independientes**.
- Las API de proveedores se simulan. No se probaron un cobro real, una entrega real de correo ni una llamada real al asistente.
- `npm run test:browser` contiene cuatro suites. Aquí Chrome termina al arrancar con un error de Crashpad/canalización del entorno restringido. No se marcaron como satisfactorias. Se preparó un transporte de pruebas WebSocket portable; sigue pendiente ejecutarlo en un entorno compatible.
- El navegador integrado permitió comprobar lectura de portada, búsqueda HTML, detalle y estado Pro. En portada y estado Pro se midieron contenedores de 320, 360, 390, 768, 1024 y 1440 px: el ancho desplazable coincidió con el ancho útil. Es una prueba de desbordamiento; no una certificación de accesibilidad o prueba en dispositivos físicos.
- La auditoría de dependencias instalada registró cero vulnerabilidades conocidas. Eso no certifica ausencia de defectos o vulnerabilidades desconocidas.
- Se añadió CI para ejecutar la suite completa y auditoría en Linux, sin secretos. La configuración está preparada, pero no se ha publicado ni ejecutado en GitHub Actions.
- Los registros de pruebas de esta entrega distinguen el resultado unitario/integración del fallo de inicio del navegador. Consultar los archivos de resultados adjuntos para los recuentos finales.

## Auditoría de seguridad e infraestructura

Supabase usado por la configuración pública: `miportal-backend`, referencia `lfflmyqjoxntoatbbwtf`. Se leyeron estructura, políticas, migraciones y definiciones de funciones, sin modificar datos.

**Confirmado en producción por metadatos:** todas las tablas públicas enumeradas tienen RLS; profiles tiene reglas de lectura/edición propia; resources conserva políticas administrativas; la función instalada record_pro_payment cambia perfiles a role=pro; el esquema no tiene pro_subscriptions; hay una cuenta Pro, un administrador, dos viewers y cero pagos registrados. Estas cifras no demuestran por qué se concedió el acceso Pro.

**Bloqueo de compatibilidad:** la migración preparada aborta si encuentra un Pro sin historial de pago. En el estado actual de producción abortaría. Primero debe identificarse si se trata de una concesión manual, cuenta de prueba u otro caso y definir su continuidad; no se debe revocar ni inventar vigencia automáticamente.

El historial de migraciones del servicio difiere de los cuatro archivos antiguos del repositorio: hay cambios remotos de noticias, Daily y marketing que no están representados completamente en esos archivos. **No ejecutar un db push masivo ni usar schema.sql para reemplazar producción.** Conciliar el historial y revisar solo las migraciones nuevas.

Los asesores reportaron doce avisos informativos de tablas con RLS sin políticas públicas, dos advertencias por funciones SECURITY DEFINER de consulta de rol y protección contra contraseñas filtradas desactivada. No se añadieron políticas permisivas para borrar los avisos: varias tablas son deliberadamente exclusivas del servidor. Revisar los dos helpers en su contexto y activar protecciones de autenticación solo mediante un cambio aprobado de producción.

Vercel enumera mi-portal, pero su configuración y despliegues devolvieron 403 por permisos del equipo. No se verificaron secretos configurados, logs, versión desplegada, backups o reglas efectivas. n8n abrió su pantalla de inicio de sesión; no se tuvo acceso a workflows ni ejecuciones. No se comprobó la autenticación del webhook de contacto ni el borrador histórico del asistente descrito en el repositorio.

## Imágenes, diseño, accesibilidad y rendimiento

El inventario CSV contiene 340 entradas públicas: 328 noticias, siete recursos y cinco elementos del Daily más reciente. Son 322 entradas con URL de imagen y 18 sin ella; varias pueden apuntar al mismo archivo. No equivale a 322 imágenes originales verificadas. Derechos, dimensiones y calidad de cada original siguen pendientes.

La comprobación técnica posterior consultó las **313 URLs de imagen únicas** del inventario: obtuvo formato y dimensiones de 306; 233 tienen menos de 640 px de ancho; siete verificaciones quedaron incompletas. No se observó ningún HTTP 404 en esa ejecución. No se interpreta un rechazo HTTP o timeout como prueba de una imagen rota. Tampoco se interpreta una anchura suficiente como licencia, nitidez o pertinencia. El CSV Auditoria-tecnica-imagenes.csv registra el resultado por entrada; no se sustituyeron fotografías ni se almacenaron los originales descargados para el análisis.

La noticia inspeccionada usa una miniatura de un servidor de miniaturas de Google de 120 px. Se mitigó su ampliación. No se presentó una imagen generada como fotografía real de una noticia. Los PNG de marca son conversiones del material SVG existente, conservado en el repositorio.

Se conservó el diseño existente, se corrigió la jerarquía de la página Pro y se comprobó una muestra responsive. Falta la auditoría completa de teclado, lectores de pantalla, contraste, Safari/iOS, Android y todos los estados de formularios. Los documentos legales siguen siendo borradores; no se inventó identidad del titular ni condiciones jurídicas.

No hay resultados de Lighthouse o Core Web Vitals que permitan afirmar mejoras medidas de rendimiento. Se hicieron ajustes concretos de prioridad/decodificación y formatos, pero su impacto debe medirse. Antes de lanzar: fijar línea base por plantilla y comprobar LCP ≤2,5 s, INP ≤200 ms y CLS ≤0,1 en percentil 75 cuando haya datos suficientes; no sustituir esos datos por una cifra inventada.

## Migraciones, publicación y reversión

Archivos preparados con el comando migration new de Supabase CLI:

1. `20261016223142_pro_entitlements_and_payment_events.sql`: libro de pagos, vigencia separada, permisos propios, RPC de eventos y guardia de Pro heredado.
2. `20261016223143_assistant_account_quota.sql`: contadores persistentes, índices, bloqueos transaccionales y RPC exclusiva del servidor.

Se ejecutaron únicamente en bases de prueba desechables. La aprobación de migraciones o publicación debe darse sobre esta revisión concreta, después de resolver estos pasos:

1. Recuperar acceso de lectura a Vercel/n8n y conciliar el commit y los workflows con producción.
2. Resolver la cuenta Pro sin pagos y confirmar la política de reembolso parcial y renovación.
3. Obtener y comprobar copia de seguridad/restauración; guardar configuración y versiones anteriores sin exponer secretos.
4. Probar las migraciones y concurrencia en una base aislada compatible con PostgreSQL 17; usar usuarios ficticios y credenciales de Mercado Pago de prueba.
5. Completar las cuatro suites de navegador y los recorridos de correo, cuenta y pago con proveedores de prueba.
6. Preparar despliegue y variables correctas, incluidos MERCADOPAGO_MODE, secreto obligatorio de firma y secreto del asistente. Verificar que la notificación de pagos apunte al entorno de prueba al ensayar.
7. Solicitar aprobación de la migración y del lanzamiento. Durante la ventana de cambio, impedir nuevas preferencias de pago sin impedir recibir notificaciones existentes; aplicar los cambios revisados y publicar la versión coherente de API e interfaz.
8. Verificar estado de membresía, permisos, errores y cabeceras después de desplegar; observar fallos y notificaciones pendientes.

La migración de Pro retira el escritor antiguo. **Una reversión solo del frontend/API a la versión antigua no es compatible con esa base.** Si hay un incidente, detener nuevas compras, conservar el libro de pagos y usar una corrección hacia delante o una restauración coordinada aprobada. No borrar pagos ni ejecutar un rollback destructivo improvisado.

## Tareas pendientes y checklist de lanzamiento

- [x] Rama de trabajo y copia reproducible del código.
- [x] Correcciones críticas implementadas y pruebas de regresión locales.
- [x] Migraciones propuestas y guardia de compatibilidad.
- [x] Inventario de módulos e imágenes y registros de pruebas.
- [x] Integración continua preparada para revisión.
- [ ] Cuenta Pro heredada reconciliada.
- [ ] Acceso a Vercel y workflows n8n; entrega de contacto/newsletter comprobada.
- [ ] Sandbox real de pagos y validación de concurrencia en PostgreSQL compatible.
- [ ] Cuatro suites de navegador satisfactorias; auditoría completa móvil y accesibilidad.
- [ ] Originales de imágenes y derechos verificados; completar optimización responsive por archivo.
- [ ] Curación editorial y productor del Daily corregidos.
- [ ] Información legal y oferta comercial completas y aprobadas.
- [ ] Medición de rendimiento y observabilidad, copias y restauración comprobadas.
- [ ] Revisión del código y autorización de cambios productivos.
- [ ] Migraciones y despliegue realizados, seguidos de verificación de producción.

## Mantenimiento propuesto

Diariamente: observar errores de API, pagos sin sincronizar, fallos de workflows y antigüedad del Daily. Semanalmente: revisar fuentes, enlaces, imágenes pendientes, entregabilidad y dependencias. Mensualmente: probar restauración en aislamiento, revisar permisos, cuotas, expiraciones y alertas. Antes de cada versión: compilar, ejecutar pruebas, comprobar entorno/commit y documentar reversión. Este es un plan de operación; no se han creado automatizaciones recurrentes ni modificado servicios.

## Referencias técnicas

- Formato de firmas, pruebas y notificaciones: [documentación de Mercado Pago](https://www.mercadopago.com.co/developers/en/docs/your-integrations/notifications/webhooks).
- Interpretación de avisos de tablas privadas: [asesores RLS de Supabase](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- Protección de contraseñas: [documentación de Supabase Auth](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Las correcciones descritas están implementadas en la rama de esta entrega. Las funciones marcadas como pendientes no se declaran terminadas ni verificadas en producción.

El commit local de implementación se identifica en el manifiesto de entrega. Git no tenía autor personal configurado; se utilizó la identidad local de agente Codex, sin cambiar la configuración personal ni atribuir el trabajo a otra persona. La rama no se ha enviado a GitHub.

## Continuación: revisión de regresiones y preservación de Pro

- **Corregido en la rama, sin desplegar:** el nuevo front dependía únicamente de `has_active_pro`, que no existe en producción. Eso podía dejar de ocultar anuncios a la cuenta Pro histórica. Ahora se conserva un `profiles.role = pro` leído del perfil propio en Supabase, aunque la nueva función no exista o devuelva false. No se toman beneficios de metadatos editables del usuario. La página de retorno reconoce el beneficio sin afirmar que exista un pago verificado. No se crea, cambia ni elimina ningún registro Pro.
- **Corregido en la rama:** el bloqueo del almacenamiento del navegador podía lanzar una excepción antes de registrar la inicialización común. La lectura/escritura del consentimiento ahora tolera ese bloqueo, mantiene denegado el seguimiento por defecto y no impide el resto del sitio.
- **Migración detenida:** se conserva el guard `RECONCILE_LEGACY_PRO_BEFORE_MIGRATION`. El hecho comprobado sigue siendo 1 Pro y 0 pagos; no hay evidencia nueva sobre su origen. No aprobar un cambio de beneficios implícitamente al resolver el origen. No ejecutar el conjunto de migraciones ni `db push`.
- **Pruebas de navegador:** Chrome fallaba al arrancar Crashpad. Se probó Edge instalado, con perfil temporal, depuración solo en loopback y sandbox intacto. Tras permitir la conexión local, el proceso inicia y acepta comandos del navegador, pero `Runtime.evaluate('1+1')` no recibe respuesta. El bloqueo está ahora localizado en la disponibilidad del renderizador; no demuestra un fallo del producto. Se añadió una sonda previa para evitar decenas de esperas por suite. No se desactivaron restricciones del navegador ni se accedió a perfiles personales. La ejecución completa en un entorno compatible sigue pendiente.
- **Accesibilidad estática:** 21 HTML compilados con idioma, un landmark principal, sin IDs duplicados y sin imágenes estáticas sin atributo alt. `noticia.html` no contiene H1 inicial: `js/news-detail.mjs` lo crea al cargar la noticia. Esta excepción requiere verificar los estados de carga/error y el árbol accesible en navegador; no se considera certificación WCAG. Quedan teclado, foco, contraste, zoom, lector de pantalla y contenido dinámico.
- **Rendimiento:** mayor archivo local servido: `styles.css`, 106.557 bytes sin comprimir; `main.js` tenía 20.554 bytes en la compilación inspeccionada. Es tamaño de archivo, no transferencia comprimida ni medición LCP/INP/CLS. No hay resultados nuevos de Lighthouse ni datos reales de campo; no se afirma mejora de puntuación.
- **Imágenes:** inventario actualizado a partir del diagnóstico ya obtenido, agregando dimensiones, formato, resultado técnico y próxima acción por registro. Son 340 entradas, no 340 originales únicos. Las 233 URL únicas de menos de 640 px siguen requiriendo revisión del tamaño real de uso y originales autorizados; no se sustituyeron fotografías ni se comprobó su licencia por tener URL pública. Siete diagnósticos incompletos no equivalen a siete imágenes rotas.
- **Accesos:** ver `docs/required-read-access.md` y el documento de entrega `Accesos-lectura-MiPortal.md`. Vercel requiere lectura del proyecto y registros; Supabase requiere evidencia mínima y saneada del origen Pro/logs/backup; n8n requiere exportaciones saneadas y ejecución histórica de cuatro flujos. Ninguno requiere escritura, secretos o ejecutar workflows.

### Puertas verificables antes de producción

1. Documentar el origen Pro y obtener decisión explícita sobre el beneficio, sin modificarlo mientras tanto.
2. Conseguir las lecturas específicas anteriores y correlacionar despliegue, código y configuración real.
3. Ejecutar las cuatro suites de navegador en un entorno compatible, sin `--no-sandbox`, y resolver cualquier fallo funcional que aparezca. La CI preparada no cuenta como ejecutada.
4. Probar migraciones y concurrencia en PostgreSQL 17 aislado con esquema representativo saneado, respaldo/reversión y compatibilidad de API. PGlite no prueba procesos simultáneos ni sustituye esta puerta.
5. Completar teclado/móvil/contraste, originales de imágenes y mediciones reproducibles de rendimiento; registrar resultados por ruta.
6. Con autorización separada: plan de publicación coordinada y validación controlada de producción. Los ensayos actuales no prueban cobro, entrega de correo, funcionamiento de n8n ni restauración real de backups.

### Resultado de comprobaciones de esta continuación

154 pruebas unitarias/integración aprobadas, 0 fallos. Cuatro suites de navegador ejecutadas y bloqueadas en la sonda del renderizador (`CDP timeout: Runtime.evaluate`); 0 aprobadas. No se interpretan como pruebas funcionales superadas. `git diff --check` sin errores. El registro del webhook diferencia ahora eventos aprobados y revocados y evita incluir el identificador de la cuenta en el mensaje de éxito.

Los documentos e inventarios de entrega se actualizaron; las imágenes originales, la base de datos productiva y los beneficios existentes permanecen sin cambios. No hubo cobros reales, envíos de correos de prueba a usuarios, ejecución de workflows, migraciones, despliegues ni publicación de la rama.
