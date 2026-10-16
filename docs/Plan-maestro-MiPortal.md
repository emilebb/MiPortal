# MiPortal.me — evaluación y plan maestro

Fecha: 16 de octubre de 2026. Evaluación pública, acceso de lectura a Supabase y primera implementación local. Las secciones 10 y 11 actualizan el diagnóstico inicial. Consultar también Informe-implementacion-MiPortal.md para pruebas, cambios y bloqueos vigentes.

## 1. Dictamen

El sitio existe, sirve contenido y permite algunos recorridos públicos. No hay evidencia suficiente para declararlo completo, seguro o listo para operar todas las funciones que anuncia. La prioridad es consolidar una versión confiable y medible antes de ampliar funcionalidades.

Se revisaron respuestas HTTP, HTML, algunos módulos JavaScript públicos, robots, sitemap y una muestra visual en navegador con vista estrecha. No se modificó producción ni se enviaron formularios de contacto, suscripciones o pagos. La muestra no equivale a una auditoría exhaustiva.

## 2. Evidencias y límites

| Área | Evidencia observada | Estado y conclusión |
|---|---|---|
| Disponibilidad | https://miportal.me devuelve 308 hacia https://www.miportal.me/; destino 200 | Verificado en esta sesión; no prueba disponibilidad histórica |
| Despliegue alternativo | https://mi-portal-seven.vercel.app/ devuelve 200; el HTML de portada tiene el mismo SHA-256 que el del dominio público | Portadas idénticas en la muestra; no demuestra igualdad de todas las rutas, datos o entornos |
| Acceso interno | Vercel enumera el proyecto mi-portal, pero rechaza configuración e historial con 403 por permisos del equipo | Acceso parcial. No se obtuvo repositorio, commit, configuración ni registros. No había código del proyecto en la carpeta local |
| Rutas | Noticias, tutoriales, recursos, buscar, productos, contacto, login y registro devuelven 200 | Existencia del documento verificada; un 200 no acredita que cada función opere |
| Portada dinámica | Daily y novedades se cargaron en navegador | Lectura pública observada; procesos de publicación y actualización no comprobados |
| Daily | La primera tarjeta mostraba una noticia de IMDb sobre 9-1-1: Nashville bajo JavaScript; justificaba su interés para desarrollo con JavaScript | Defecto editorial confirmado en una muestra; revisar selección, clasificación y generación de explicaciones |
| Tutoriales | La página declara un único tutorial publicado: formularios HTML accesibles | Catálogo inicial, no biblioteca completa de n8n, React, Docker y otros temas anunciados |
| Productos | Metadatos describen propuestas en preparación, sin compra ni checkout | No contar esta sección como tienda implementada |
| Búsqueda | Consulta HTML devolvió dos resultados: recurso de HTML y tutorial accesible | Prueba puntual superada; filtros, paginación, caracteres especiales y errores pendientes |
| Noticia individual | Se abrió una noticia desde la portada; aparecieron título, fecha, resumen, fuente y relacionados | Lectura de una muestra superada; no acredita todas las noticias |
| Imágenes | Imagen del artículo sobre modelos de IA para huracanes se veía pixelada al tamaño mostrado | Problema visual de esa muestra; faltan dimensiones originales, compresión y revisión del catálogo |
| Cuenta y Pro | Existen formularios de login y registro. Portada anuncia Pro anual a COP 19.999; botón de checkout está inicialmente oculto en HTML | Autenticación, cobro y permisos Pro sin verificar. Ocultación inicial no demuestra avería: puede depender de sesión o configuración |
| Contacto y newsletter | Formularios apuntan a /api/contact y /api/newsletter; incluyen campo señuelo | Entrega, persistencia, consentimiento y protección contra abuso pendientes |
| Asistente | El panel se abrió y mostró mensaje de bienvenida | Respuestas del servicio, fuentes, límites, coste y disponibilidad pendientes |
| Vista estrecha | Cabecera se adapta con menú; menú abrió y mostró enlaces; búsqueda y noticia resultaron legibles en la vista observada | Comprobación parcial. No se emuló un teléfono ni se cubrieron Safari, teclado móvil u orientaciones |
| SEO básico | Hay lang=es, viewport, canonical, descripción, metadatos sociales, robots y sitemap | Base presente. Cobertura de artículos, indexación real y resultados enriquecidos pendientes |
| Recursos | CSS global descargado de 101.855 bytes; dependencia pública supabase-js@2 y fuentes externas | Tamaños de archivo y dependencias observados; no son métricas de rendimiento ni prueba de vulnerabilidad |
| Seguridad superficial | HTTPS, HSTS y CSP en meta; uso de textContent en módulos inspeccionados; enlaces externos con noopener/noreferrer | Señales positivas parciales; no certifican seguridad del sistema |

La respuesta de la portada inspeccionada no incluía cabeceras CSP, X-Content-Type-Options ni Referrer-Policy. La CSP estaba en HTML. Revisar protección contra incrustación mediante cabecera frame-ancestors y compatibilidad antes de endurecerla. Access-Control-Allow-Origin: * en HTML público no demuestra una fuga de datos: las API y recursos privados requieren revisión separada. robots.txt tampoco es un control de autorización.

No hay mediciones de Lighthouse, Core Web Vitals, tiempos reales de API ni pruebas de carga. No se verificaron políticas de acceso a datos, secretos del servidor, copias de seguridad, administración, webhooks o automatizaciones. No inferir que faltan ni que funcionan.

## 3. Alcance de la versión completa

Inventariar todas las rutas y funciones reales y asignar a cada una: propósito, usuario, fuente de datos, estado, responsable y prueba de aceptación. Una función solo pasa a «verificada» con evidencia reproducible. Estados: inventariada, pendiente de acceso, reproducida, corregida en pruebas, verificada en producción, descartada explícitamente.

Recorridos mínimos: descubrir contenido → buscar o filtrar → leer detalle → abrir fuente; encontrar tutorial → completar ejercicio; registrarse → confirmar correo → iniciar/cerrar sesión → recuperar acceso; contacto → entrega; newsletter → alta confirmada → baja; consulta al asistente → respuesta útil y enlace válido. Pro y productos necesitan decisión expresa de alcance y, si entran en la versión, un recorrido comercial completo.

## 4. Hoja de ruta priorizada

Estimaciones orientativas en días laborables de esfuerzo, sujetas al inventario del repositorio. No constituyen una fecha de lanzamiento; problemas de datos, pagos y accesos pueden ampliarlas.

| ID / prioridad | Trabajo y responsable sugerido | Dependencia / esfuerzo | Criterio de aceptación |
|---|---|---|---|
| A1 / P0 | Vincular repositorio, rama y commit de producción; identificar equipo y proyecto Vercel. Responsable técnico | Acceso de lectura / 0,5–1 día | Relación documentada dominio → proyecto → despliegue → commit; compilación o ejecución reproducible |
| A2 / P0 | Inventario de páginas, API, datos, roles, integraciones y tareas programadas. Técnico + propietario | A1 / 1–2 días | Matriz sin funciones supuestas; cada ruta enlazada tiene estado y prueba; alcance aprobado |
| A3 / P0 | Preparar entorno de pruebas aislado, datos ficticios y cuentas de visitante, usuario y administrador. Técnico | A1 / 1–2 días | Pruebas no generan cobros ni correo real; restauración y reversión documentadas |
| S1 / P0 | Auditar autorización y acceso a datos: lectura/escritura por rol, administración, archivos y endpoints privados. Backend | A2–A3 / 2–4 días | Visitante y usuario A no leen ni modifican datos de B; usuario común no administra; políticas verificadas con pruebas positivas y negativas |
| S2 / P0 | Revisar secretos, validación de servidor, HTML no confiable, URLs externas, límites y dependencias. Backend | A2 / 1–3 días | Sin secretos privilegiados en cliente; entradas maliciosas rechazadas o escapadas; protección de abuso comprobada; hallazgos críticos cerrados |
| C1 / P1 | Corregir Daily: fuentes permitidas, relevancia, clasificación, duplicados, fecha original y revisión editorial. Contenido + automatización | A2–A3 / 2–4 días | Caso IMDb no aparece como JavaScript; conjunto fijo de casos válidos e inválidos pasa; explicaciones corresponden a cada noticia; fallo del proveedor no publica basura |
| F1 / P1 | Completar pruebas y correcciones de noticias, detalle, búsqueda, filtros y recursos. Frontend + backend | A3 / 2–4 días | Enlaces válidos; resultados coherentes; vacíos, errores y reintentos útiles; sin cargas infinitas; consultas mantienen estado al navegar |
| F2 / P1 | Verificar registro, confirmación, login, logout y recuperación; permisos de sesión. Backend | S1 / 2–4 días | Todos los recorridos pasan con correo de pruebas; sesión expirada se maneja; redirecciones no permiten destinos arbitrarios |
| F3 / P1 | Cerrar contacto y newsletter: persistencia o entrega, deduplicación, errores, baja y protección de abuso. Backend + operación | A3, S2 / 1–3 días | Mensaje recibido una vez en buzón de pruebas; alta confirmada y baja efectiva; fallo del proveedor se informa y registra sin exponer datos |
| I1 / P1 | Auditar y sustituir imágenes deficientes; registrar fuente, derechos, dimensiones y uso. Diseño + contenido | A2 / 2–4 días | Todas las imágenes principales pasan revisión visual; ninguna miniatura se amplía de forma perceptiblemente borrosa; enlaces sin roturas |
| U1 / P1 | Revisar móvil y accesibilidad en páginas y estados críticos. Diseño + frontend | F1–F3, I1 / 2–4 días | Sin desbordamiento a 320, 360, 390, 768, 1024 y 1440 px; menú, formularios, cookies y asistente utilizables; teclado, foco y etiquetas comprobados |
| P1 / P1 | Medir y optimizar rendimiento según cuellos reales. Frontend | I1, U1 / 1–3 días | Medición repetible por plantilla; objetivos y presupuesto cumplidos o excepción documentada; sin regresión funcional |
| M1 / P1 si se vende | Definir oferta Pro y productos: beneficio, precio, acceso y entrega. Propietario + backend | A2, F2, S1 / 3–6 días técnicos tras definir alcance | En sandbox: éxito, rechazo, pendiente, reintento, duplicado y reembolso; permisos se actualizan en servidor; retorno del navegador no concede Pro por sí solo |
| B1 / P2 | Verificar asistente contra el contenido existente, errores y abuso. Técnico + contenido | F1, S2 / 1–3 días | Respuestas enlazan destinos reales; admite límites; no afirma acciones que no hizo; caída tiene alternativa; límites y consumo observables |
| E1 / P2 | Completar SEO, metadatos sociales, sitemap y coherencia editorial. Contenido + frontend | F1, I1 / 1–2 días | URLs canónicas coherentes; sitemap contiene las páginas indexables elegidas; imágenes sociales compatibles; fechas verificables; sin contenido pendiente presentado como disponible |
| O1 / P1 | Monitoreo, copias, restauración y procedimiento de publicación. Operación | A1, S1 / 1–3 días | Alertas de errores y fallos de automatización; restauración ensayada en pruebas; reversión de versión practicada |

P0 bloquea una intervención segura y una declaración de preparación. P1 es necesario para una versión confiable. P2 completa calidad y operación; subir de prioridad cualquier defecto que rompa un recorrido principal. No tratar la ausencia de acceso como un fallo del producto.

Orden recomendado: A1–A3 → S1–S2 y C1 → F1–F3 e I1 → U1 y P1 → cierre de B1/E1/O1 → lanzamiento. M1 requiere definición de producto y es condición previa a cobrar; el catálogo informativo y la suscripción Pro son alcances distintos.

## 5. Especificación de imágenes

Crear inventario por URL y ubicación: dimensiones originales/renderizadas, peso, formato, proporción, procedencia, derechos y resultado visual. Priorizar portada, Daily, noticia y tarjeta social. Una imagen nítida pero irrelevante no pasa.

Servir variantes con srcset/sizes o transformación equivalente, WebP/AVIF cuando convenga y respaldo compatible. Definir ancho/alto o aspect-ratio para reservar espacio; lazy loading bajo el primer pliegue y prioridad correcta para la imagen principal. Revisar recortes, legibilidad y modo oscuro. Alt descriptivo para información; alt vacío solo para decoración o contenido redundante.

Presupuesto inicial propuesto: tarjetas hasta 150 KB y hero hasta 300 KB, ajustable tras comparar calidad y rendimiento. Elegir resolución según tamaño y densidad; no ampliar una miniatura ni usar generación artificial para inventar evidencia de una noticia. Preparar imagen social raster de 1200×630 y comprobarla en los destinos elegidos; el SVG actual requiere validación de compatibilidad. Probar fallback ante imagen ausente o proveedor bloqueado.

## 6. Rendimiento y experiencia

Medir portada, listado, detalle, búsqueda y acceso en móvil y escritorio. Registrar dispositivo/perfil de red, fecha, versión y tres ejecuciones por plantilla. Obtener LCP, CLS, INP cuando haya datos de campo, peso transferido, recursos bloqueantes, solicitudes y errores. Usar medición de laboratorio como diagnóstico, no como sustituto de usuarios reales.

Objetivos propuestos de campo en percentil 75: LCP ≤2,5 s, INP ≤200 ms y CLS ≤0,1. Si aún no hay volumen de datos, dejar explícita esa limitación y fijar una línea base de laboratorio. Priorizar imagen principal, fuentes, CSS y JavaScript solo según las mediciones. Las cabeceras de caché vistas no acreditan rapidez de las consultas dinámicas.

Revisar Safari en iPhone y Chrome en Android reales o servicio equivalente, zoom 200 %, contraste AA, lector de pantalla y navegación completa sin ratón. El aviso de cookies ocupa una parte importante de la vista estrecha observada: probar su cierre, persistencia, foco y ausencia de bloqueo del contenido. Verificar tráfico de analítica antes y después de cada elección, sin asumir que el texto del aviso refleja la ejecución real.

## 7. Matriz de validación obligatoria

| Flujo | Casos mínimos | Evidencia de cierre |
|---|---|---|
| Noticias/Daily | Datos válidos, vacíos, proveedor caído, noticia vieja, duplicado, categoría errónea | Casos automatizados cuando aporten valor + revisión editorial y capturas |
| Búsqueda | HTML, acentos, sin resultados, texto largo, caracteres especiales, filtros y navegación atrás | Resultado esperado frente a datos conocidos; error recuperable |
| Cuenta | Registro, correo, duplicado, contraseña incorrecta, expiración, logout, recuperación | Cuentas de pruebas y prueba de aislamiento entre usuarios |
| Formularios | Válido, inválido, duplicado, abuso, proveedor caído | Registro o entrega comprobada; mensaje visible consistente con resultado |
| Pro | Visitante, gratuito, Pro vigente y vencido; eventos repetidos o fuera de orden | Eventos de sandbox y permisos comprobados en servidor |
| Asistente | Pregunta sobre contenido existente, inexistente, entrada excesiva y caída del servicio | Respuestas verificables y límites sin bloqueo de la página |
| Imágenes/móvil | Catálogo, fallback, recorte, DPR alto, teclado abierto, cookies y chat | Inventario revisado y pruebas por ancho/dispositivo |
| Operación | Despliegue, fallo, reversión, backup y restauración | Procedimientos ejecutados en entorno de pruebas y responsables asignados |

Cada ticket debe incluir: problema, evidencia inicial, resultado esperado, responsable, dependencia, cambio/commit, entorno, pasos reproducibles y resultado. Un test que solo comprueba HTTP 200 no cierra un flujo.

## 8. Condiciones de lanzamiento

1. Alcance acordado y todas las funciones visibles clasificadas; ninguna promesa comercial depende de una función no verificada.
2. Cero defectos críticos o altos abiertos de seguridad, pérdida de datos o bloqueo de recorridos incluidos.
3. Todos los recorridos principales pasan en pruebas y se verifican después de publicar con acciones controladas.
4. Imágenes principales nítidas, pertinentes y con procedencia registrada; revisión móvil y accesibilidad completada.
5. Rendimiento medido con evidencia y limitaciones explícitas; monitoreo operativo y reversión disponibles.
6. Si se incluye Pro: validación de pagos y permisos terminada antes de aceptar ventas.
7. Responsable de publicación identifica commit y entorno; observa errores y métricas tras lanzar. Seguimiento inicial durante 48 horas y revisión posterior de datos reales.

No se puede prometer ausencia permanente de fallos. El objetivo verificable es cumplir estas condiciones, detectar incidentes y recuperarse con rapidez.

## 9. Acceso necesario para completar la auditoría

Compartir URL del repositorio GitHub/GitLab o carpeta con código e historial disponible. En Vercel, proporcionar acceso de lectura al proyecto mi-portal dentro del equipo correcto: la conexión actual lo enumera, pero devuelve 403 al inspeccionarlo. No hace falta enviar secretos por chat.

Después del repositorio: solicitar solo lo necesario para cada bloque — esquema y migraciones, políticas de autorización, cuentas de prueba, registros sin datos sensibles, automatización del Daily, proveedor de correo y sandbox de pagos. Confirmar si Pro y venta de productos forman parte del lanzamiento y quién aprueba los contenidos.

El siguiente hito es convertir esta hoja de ruta en un inventario exacto del código, con causas reproducidas y estimaciones ajustadas. Hasta entonces, la estructura observada es la de documentos HTML, CSS global y módulos JavaScript públicos; la arquitectura del servidor, organización del repositorio y configuración de despliegue siguen sin comprobarse.

## 10. Ampliación tras recibir el repositorio

Repositorio: https://github.com/emilebb/MiPortal. Rama revisada: main. Último commit mostrado por GitHub: `1b6eb4ba35688d613b8c502a826f386bf6e9995b` (8 de octubre de 2026). El repositorio es público y su sección About enlaza el despliegue compartido. Esto acredita la relación declarada, pero no identifica el commit actualmente desplegado en Vercel.

La descarga mediante Git falló por un problema de resolución de red del entorno. Se pudo revisar el código en la interfaz de GitHub. No se instaló nada, no se ejecutaron pruebas del repositorio ni se modificó su código. El 403 de acceso a la configuración y despliegues de Vercel sigue pendiente.

### Arquitectura confirmada en código

- Páginas HTML, CSS global y JavaScript sin framework de interfaz declarado en package.json.
- `npm run build` ejecuta `scripts/generate-config.mjs` y `scripts/build-static.mjs`; Vercel declara `public` como salida.
- `build-static.mjs` copia una lista permitida de recursos y transforma HTML: sustituye cabecera/pie, textos y bloques concretos e inyecta el asistente. Por tanto, editar un HTML fuente no garantiza que ese texto aparezca igual en producción: hay que revisar el resultado compilado.
- Carpeta `api`: assistant, contact, mp-preference, newsletter, newsletter-send y webhook-mercadopago. Carpeta `lib` para utilidades; `admin` para interfaz administrativa; `supabase` para esquema y migraciones; `scripts` para compilación y verificaciones.
- `api/contact.js` deriva mensajes a n8n; `api/assistant.js` también usa n8n y exige una credencial de servidor. Newsletter usa RPC de Supabase y Resend. No asumir vigentes las instrucciones antiguas que describen contacto exclusivamente con Resend.
- La dependencia declarada es `@supabase/supabase-js: ^2.116.0`, con package-lock presente. No se auditó todo el árbol transitivo ni el historial buscando secretos.
- Hay comandos específicos de pruebas para build, búsqueda, asistente, contacto, newsletter, admin y Mercado Pago. También se observan archivos de pruebas de autenticación, RLS, noticias, Daily e imágenes. package.json no declara un comando general `test`: incorporar un punto de entrada que cubra todas las suites pertinentes y registrar resultados de CI.

### Hallazgos concretos de la revisión estática

| ID / prioridad | Evidencia del código y consecuencia | Cambio requerido | Verificación de cierre |
|---|---|---|---|
| R1 / P1 | `api/assistant.js`, reserveRateLimit: recorre las cuatro ventanas/límites tanto para IP como para sesión. El límite de sesión de 5 por día también se aplica a IP, aunque se declaran 40 diarios para IP | Separar reglas por tipo de clave; decidir límites reales del producto | Cinco solicitudes de una sesión distribuidas en una hora bloquean esa sesión según política; una sesión nueva de la misma IP no queda bloqueada por ese tope hasta alcanzar el límite IP. Probar minuto/hora/día por separado |
| R2 / P0 antes de cobrar | `record_pro_payment` en `supabase/migrations/20260917_pro_payments.sql` actualiza cualquier perfil a role='pro'. Un administrador que pague puede perder su rol admin si esta función está instalada y se ejecuta para él | Separar permisos administrativos de derechos de suscripción; preservar administradores | Un pago para admin no revoca administración; uno para viewer habilita el beneficio contratado; aislamiento entre usuarios |
| R3 / P0 antes de cobrar | La migración Pro guarda el pago y cambia el rol, pero no registra inicio/vencimiento anual. El webhook ignora pagos no aprobados, sin implementar revocación por reembolso o contracargo en el archivo revisado | Modelar vigencia y ciclo de vida comercial, incluida política de renovación y cancelación; revisar posibles mecanismos externos | Reloj de prueba verifica expiración anual y renovación; reembolso/contracargo modifica acceso según política; eventos repetidos y fuera de orden no reactivan beneficios indebidamente |
| R4 / P0 antes de cobrar | `api/mp-preference.js` acepta user_id del cuerpo, valida UUID y origen, pero no valida un token de sesión ni deriva identidad del servidor. El encabezado Origin no acredita identidad | Autenticar la petición y obtener el usuario del token validado; limitar abuso | Sin sesión devuelve rechazo; usuario A no puede crear una preferencia atribuida a B; precio y moneda permanecen controlados por servidor |
| R5 / P1 | `api/newsletter.js` captura el error de envío de bienvenida y aun así responde 202 con instrucciones de confirmar por correo | Distinguir alta almacenada de correo enviado; habilitar reintento o cola observable y evitar confirmación engañosa | Simular fallo de Resend: resultado informa estado real, queda reintento trazable y no se generan duplicados |
| R6 / P1 | Contacto y asistente usan Map en memoria por proceso para limitar solicitudes. Reinicios e instancias separadas no comparten contadores | Centralizar límites cuando deban proteger volumen o coste global; documentar confianza en cabeceras de IP | Prueba con dos instancias y reinicio conserva los límites exigidos; IP no falsificable en despliegue real |
| R7 / P1 | `api/contact.js` envía a webhook n8n sin credencial en la petición revisada y responde «Mensaje enviado correctamente» tras HTTP satisfactorio | Comprobar protección del webhook y la semántica de su respuesta; verificar recepción final e idempotencia | Llamada no autorizada al webhook se rechaza según diseño; solicitud duplicada entrega una sola vez; fallo posterior se registra y permite recuperación |
| R8 / P1 | `api/webhook-mercadopago.js` exige firma solo cuando existe MERCADOPAGO_WEBHOOK_SECRET; el analizador usa split(';'). La función RPC usa consulta previa + inserción, y una actualización de rol independiente de si el pago ya estaba registrado | Verificar formato de firma contra notificaciones reales y documentación vigente; exigir configuración apropiada; revisar concurrencia y repetición del mismo pago | Notificación válida real de sandbox pasa; firma inválida y replay se manejan; dos entregas concurrentes no producen fallo ni efecto doble. No se declara aquí probado un bypass de firma |

R1 se contrastó con una reproducción aislada de las comparaciones: con cinco solicitudes separadas diez minutos, el sexto intento queda bloqueado por la ventana diaria de cinco, aunque no llega al límite declarado de cuarenta. Esta comprobación no ejecutó el handler original ni constituye resultado de su suite.

R2–R8 describen comportamiento o riesgos del código inspeccionado, no incidentes confirmados en producción. La vigencia efectiva de las migraciones y controles externos debe comprobarse antes de atribuir impacto real.

### Controles positivos encontrados

El webhook consulta el pago a Mercado Pago y verifica estado aprobado, importe y moneda antes de invocar la base. La tabla payments tiene identificador de pago único, RLS y revocación de acceso para roles públicos; la RPC se concede a service_role. La migración de autenticación crea perfiles viewer, limita lectura/edición al perfil propio y protege cambios de rol mediante trigger. El asistente tiene validación de texto, timeout y respuesta alternativa, y no llama a n8n si falta su secreto. Contacto limita tamaño y campos y usa un señuelo. Son controles presentes en código; falta validarlos en el entorno desplegado.

### Ajuste de ejecución

1. A1 ahora parte de un repositorio identificado: confirmar commit de producción y obtener copia local o archivo ZIP de la rama revisada. No volver a pedir la URL del repositorio.
2. Ejecutar todas las suites disponibles y compilación en entorno de pruebas; revisar qué pruebas usan mocks y cuáles validan integración real. Registrar fallos sin declararlos corregidos por su nombre o comentario.
3. Antes de activar ventas, cerrar R2–R4 y validar R8 con sandbox. Mantener la separación entre catálogo de productos en preparación y la oferta Pro ya anunciada.
4. Corregir R1 y R5, verificar n8n y revisar el proceso que produce el Daily. Su implementación completa no se localizó en los archivos leídos: no asignar aún una causa técnica al caso IMDb.
5. Mantener I1/U1/P1: no se han resuelto los problemas de imágenes, relevancia editorial ni las mediciones pendientes por disponer ahora del código.
6. Añadir revisión del HTML compilado a los criterios de aceptación. El proceso actual cambia contenido y estructura mediante sustituciones de texto; centralizar plantillas sería una mejora de mantenibilidad, posterior a cerrar defectos operativos.

Accesos restantes: configuración y registros de Vercel del equipo correcto, estado real de migraciones/políticas de Supabase y workflows de n8n utilizados por contacto, asistente y Daily. Obtenerlos con permisos de lectura y datos de prueba, sin compartir secretos en el chat.

Archivos leídos directamente: package.json, vercel.json, scripts/build-static.mjs, api/mp-preference.js, api/webhook-mercadopago.js, api/assistant.js, api/contact.js, api/newsletter.js y las migraciones 20260917_auth_roles.sql y 20260917_pro_payments.sql. No se ha completado una auditoría línea por línea de todo el repositorio.

## 11. Implementación local y acceso ampliado

La carpeta local compartida permitió trabajar en una copia completa, rama `codex/miportal-critical-fixes`, sin cambiar la carpeta original. Se implementaron R1–R5 en código, con migraciones y regresiones locales; siguen pendientes las condiciones de lanzamiento. Además se corrigió la visibilidad invertida de anuncios, la falsa confirmación de pago, el arranque de GTM tras rechazar cookies y el uso de React como verbo en el falso positivo observado. La relevancia editorial completa, el contacto n8n y la protección global de este último siguen pendientes.

**Acceso de lectura a Supabase confirmado:** el sitio usa miportal-backend. Se comprobó la función instalada que cambia el rol a pro, la ausencia de la nueva tabla de vigencia y una cuenta Pro sin historial de pagos. La migración propuesta se detiene en ese caso: no puede aplicarse en producción hasta reconciliar esa cuenta. El historial remoto no coincide completamente con los archivos locales antiguos; no realizar una migración masiva.

**Verificación:** pruebas de API simulada y SQL en PostgreSQL embebido; lectura local en navegador integrado, búsqueda HTML con dos resultados y medición sin desbordamiento en portada y estado Pro a seis anchos. Los registros de entrega contienen los recuentos finales. Cuatro suites de navegador automático siguen bloqueadas por el arranque de Chrome; falta PostgreSQL 17 aislado y sandbox de proveedores. CI está preparado pero no ejecutado en GitHub.

**Imágenes:** inventario de 340 entradas públicas, 322 con URL y 18 sin ella. Miniatura de una noticia medida en 120 px y ampliación limitada en la versión local. PNG derivados de marca, sin alterar los SVG originales. Calidad/licencia de cada fotografía y variantes responsive siguen pendientes.

**Próximo hito:** revisar la rama y resolver la cuenta Pro heredada; habilitar acceso a Vercel/n8n, completar sandbox, pruebas de navegador y restauración. Solo después solicitar aprobación concreta para migraciones y producción. No se ha fusionado ni publicado esta implementación.

Resultado final de la fase: 150 pruebas unitarias/integración satisfactorias; cuatro suites de navegador automático bloqueadas. Auditoría técnica de 313 URLs de imagen únicas: 306 con metadatos obtenidos, 233 por debajo de 640 px, siete comprobaciones incompletas y ningún HTTP 404 observado. La revisión visual completa, los derechos y los originales adecuados siguen pendientes.

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

### Último control de calidad

154 pruebas unitarias e integración aprobadas; 4 suites de navegador bloqueadas antes de sus aserciones funcionales. Prioridad inmediata: lecturas mínimas documentadas, evidencia sobre Pro y entorno aislado compatible para navegador/PostgreSQL 17. Los beneficios Pro se conservan y la migración permanece detenida. La auditoría visual, accesibilidad interactiva y rendimiento medido siguen abiertos; no se declara el proyecto listo para producción.
