# MiPortal — tienda digital

## Estado local

El commit local de OpenCode `a6f19a5` aporta el catálogo informativo y sus filtros. El catálogo ya consulta directamente `public.digital_products` y solo muestra filas publicadas; no contiene fixtures, ni se inventaron productos o precios. En la base Supabase `miportal-backend` revisada en modo de solo lectura no existen tablas `digital_*`; sí existen `profiles`, `payments` (reservada a MiPortal Pro) y el bucket privado `miportal-marketing`. El código local mantiene checkout apagado salvo que el servidor reciba `DIGITAL_PRODUCTS_CHECKOUT_ENABLED=true`.

Se preparó `supabase/migrations/PROPUESTA_20261009_productos_digitales.sql`, que todavía **no se aplicó**. No se creó ni alteró ningún objeto remoto. La propuesta solo añade objetos `digital_*` y dos buckets nuevos: `miportal-digital-products` privado para archivos pagados y `miportal-product-images` público y limitado a imágenes de portada. Si alguno de esos IDs ya existe al momento de aplicar, el `INSERT` falla en vez de alterar su configuración.

## Datos y seguridad propuestos

- Nuevas tablas: `digital_products`, `digital_product_files`, `digital_product_orders`, `digital_product_order_items`, `digital_product_payments` y `digital_product_download_grants`.
- Se reutiliza `auth.users` como identidad y `profiles`/`public.is_admin()` para los permisos administrativos existentes. `payments` y `record_pro_payment` no se reutilizan ni modifican.
- No hace falta una tabla de categorías: cada producto guarda una categoría. El catálogo deriva sus filtros de los productos visibles.
- Los visitantes solo pueden leer productos publicados. Los administradores pueden gestionar el catálogo y metadatos de archivos, y consultar pagos. Usuarios autenticados solo pueden leer sus propios pedidos, ítems y derechos de descarga. No hay escritura directa de clientes a órdenes, pagos ni grants. Los RPC de orden, conciliación, preferencia y descarga se conceden únicamente a `service_role`.
- `create_digital_product_order` toma usuario del servidor, precio y nombre de Supabase, hace snapshot de la línea y usa una clave de idempotencia por usuario. Producto, archivos, precio y moneda se comprueban dentro del servidor/base.
- La función de webhook exige firma de Mercado Pago, luego consulta el pago a la API oficial. El RPC vuelve a verificar orden, importe y moneda y registra cada ID de pago de forma idempotente. Una orden con otra captura aprobada conserva sus grants aunque se reembolse uno de sus intentos. Una disputa revoca los grants; se restauran solo si Mercado Pago resuelve el contracargo a favor del vendedor (`charged_back/settled`). La tabla separada `digital_product_payments` no toca los pagos de Pro.
- `api/digital-products/download.js` comprueba token de Supabase, identidad del dueño, orden pagada y grant, y entrega una URL firmada de 60 segundos. No hay URL pública permanente de archivos pagados. Los administradores no pueden borrar metadatos de archivos por la API; pueden retirarlos para compras futuras conservando el archivo anterior.
- El bucket de descargas es privado y acepta tipos permitidos y hasta 50 MB. Las imágenes van a otro bucket, público, con lista de MIME y tope de 5 MB; el panel no permite subir SVG. Ningún archivo descargable debe guardarse en el bucket de imágenes.

## APIs locales preparadas

- `POST /api/digital-products/order`: autenticación de usuario, origen permitido, JSON limitado, UUID del producto y clave de idempotencia; la base toma el precio. En modo apagado responde 503 antes de crear orden o llamar a Mercado Pago. En modo habilitado crea la preferencia con referencia externa a la orden.
- `POST /api/digital-products/webhook`: valida firma y timestamp, obtiene el pago directamente del proveedor y delega la conciliación idempotente a Postgres.
- `POST /api/digital-products/download`: solo emite enlace temporal para un grant del usuario que presenta el token.
- El checkout se controla con `DIGITAL_PRODUCTS_CHECKOUT_ENABLED`; debe permanecer apagado hasta autorizar cobros y aplicar la migración. El código también necesita las variables server-side existentes `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY` (o alias de anon), `MERCADOPAGO_ACCESS_TOKEN` y `MERCADOPAGO_WEBHOOK_SECRET`. No se leyeron ni cambiaron sus valores. No se creó ningún secreto.

## Frontend

- `productos.html` y `js/products-page.mjs` conservan el diseño y los filtros existentes, muestran acciones de compra/obtención y envían solo el identificador de producto y clave de idempotencia. El precio del navegador no se envía al servidor.
- `mis-compras.html` lista solo órdenes propias con RLS y permite pedir una descarga autorizada.
- `admin/productos.html` y `js/admin/digital-products.js` reutilizan el guard de admin existente y RLS para crear/editar/publicar productos, subir imágenes y archivos con validación del navegador y consultar las 100 órdenes más recientes. La autorización real está en Postgres/Storage, no en la pantalla.
- El build incluye `mis-compras.html`; Vercel ya detecta rutas bajo `api/`. No se rehízo el sitio ni se migró de tecnología.

## Tablas/políticas y plan de aplicación

1. Tablas nuevas: las seis `digital_*` arriba descritas; tablas existentes reutilizadas: `auth.users`, `public.profiles` y `public.is_admin()` solo para identidad/autorización. `public.payments`, `resources` y las demás tablas quedan fuera.
2. RLS nueva: lectura pública de publicados; gestión administrativa de productos y archivos; lectura propia de pedidos, líneas y grants; lectura administrativa de pagos y escritura de pagos solo para servicio. No se añade lectura de pagos al comprador ni acceso público a bucket privado.
3. RPC server-only: crear orden, guardar referencia de preferencia, registrar/conciliar pago y buscar grant de descarga.
4. Riesgo de compatibilidad: si el proyecto usa una versión de `is_admin()` diferente a la inspeccionada o si uno de los dos IDs de bucket ya existe, la migración necesita revisión antes de ejecutar. La migración utiliza arrays y JSONB ya comunes en el esquema actual. `payments` de Pro se deja intacta.
5. Reversión: antes de aplicar, conservar el SQL revisado. Si se aplica sin datos todavía, un script de reversión separado puede retirar políticas, funciones, tablas y buckets nuevos en orden inverso. Una vez existan órdenes o archivos reales, no ejecutar DROP ni eliminar buckets: requiere migración de reversión con copia/exportación y decisión del responsable.

## Verificación y pendientes

Las pruebas locales de API usan fetch/fixtures simulados; no generan pagos ni llamadas reales a Mercado Pago. No se ejecutó una migración ni una prueba real Supabase porque el esquema aún no existe allí. Sin aprobación, esta integración no se despliega ni puede ofrecer compras reales. Antes de prod faltan aplicar la migración, configurar/validar variables del servidor sin cambiar credenciales de Pro, probar contra sandbox de Mercado Pago, hacer build y pruebas de roles/Storage en Supabase y, después de revisión, autorizar deployment. No se usó dinero real.

## Auditoría técnica y seguridad (2026-10-09)

Se corrigieron estos hallazgos antes de solicitar permiso de aplicación:

- La consulta de producto usaba `FOR SHARE`, que exige privilegio `UPDATE` y hacía fallar el RPC con permisos mínimos. Se sustituyó por un bloqueo asesor compartido entre cambios de precio/publicación y creación de orden, sin otorgar `UPDATE` al rol del backend.
- La conciliación tenía una referencia de tabla inválida en el `ON CONFLICT`, y los cambios aprobada→reembolsada podían conservar el estado anterior en el ledger. Se corrigieron el alias y las transiciones; una aprobación antigua posterior al reembolso se rechaza y no recrea grants.
- El check de `paid_at` habría impedido registrar un reembolso cuyo aviso llega antes del de aprobación. Ahora solo requiere `paid_at` para órdenes pagadas, no para órdenes ya reembolsadas.
- La lectura de una preferencia almacenada no asume que la API incluya `external_reference` en toda respuesta: si viene, debe coincidir; ID de preferencia y URL siguen siendo obligatorios.
- Se quitó una política SELECT redundante del bucket de imágenes públicas. Supabase sirve la lectura de buckets públicos sin esa política; la escritura y borrado de imágenes se reservan a admins. En el bucket privado, lectura/carga/actualización/borrado se limitan a usuarios autenticados que `public.is_admin()` reconoce como administradores. El borrado permite al panel revertir un objeto si falla el registro de sus metadatos; anon y compradores no administradores no pueden borrarlo.
- Se revocan primero los permisos de las seis tablas para `PUBLIC`, `anon`, `authenticated` y `service_role`; luego se conceden solo las operaciones requeridas. Los clientes no pueden insertar o cambiar órdenes, pagos ni grants. Los RPC de servidor quedan ejecutables solo por `service_role`.
- Los pagos solo son visibles para administradores mediante `public.is_admin()`; compradores y visitantes no pueden consultarlos. Se verificó que la función existente autoriza con `profiles.role` y `auth.uid()`.
- Se añadieron claves foráneas compuestas para impedir que un grant combine un usuario distinto al dueño de la orden, un producto ajeno a la línea de compra o una ruta de archivo de otro producto.
- `create_digital_product_order` usa la identidad verificada por Auth en el servidor y toma nombre, precio y moneda del producto publicado. La idempotencia se serializa por usuario; los productos gratuitos solo otorgan acceso a sus archivos activos. Los cambios concurrentes de precio/publicación y el checkout se serializan con un lock asesor por producto.
- La conciliación bloquea la orden, comprueba importe/moneda y deduplica por ID único de pago. Cancelaciones/rechazos posteriores no revierten una captura aprobada. Los reembolsos y contracargos actualizan el ledger; los grants se revocan cuando ya no queda una captura vigente.
- Los reintentos de checkout recuperan la preferencia ya asociada a la orden. Si dos solicitudes compiten, el endpoint devuelve la preferencia que quedó guardada y valida ID, referencia si viene en la respuesta, HTTPS y hostname permitido.
- El bucket de pago es privado y no tiene política de lectura para visitantes o compradores. Las URLs se firman en backend tras comprobar identidad, grant y orden pagada. Storage limita las políticas administrativas por bucket y formato de ruta. El bucket público queda reservado a imágenes y solo admins pueden escribir allí.
- La inspección remota en modo de solo lectura encontró únicamente `miportal-marketing` privado; los dos IDs nuevos están libres. Se inspeccionó `public.is_admin()` sin cambiar la base.

Limitaciones: la lista MIME y tamaño de Storage valida metadatos de carga, no escanea bytes ni busca malware. El webhook requiere firma HMAC y consulta el pago a Mercado Pago; estas pruebas son simuladas. La migración y sus RPC/RLS se ejecutaron en un Postgres temporal PGlite con stubs mínimos para Auth/Storage; esto valida sintaxis y flujos centrales, pero no reemplaza una prueba de integración contra Supabase real ni sus Database Advisors.

### Plan de reversión

1. La propuesta está dentro de una transacción. Si falla al aplicarla, PostgreSQL debe revertir las tablas, funciones, políticas y registros de buckets hechos en esa transacción.
2. Si se aplica sin órdenes ni archivos, desactivar checkout, verificar que ambos buckets estén vacíos, eliminar primero las políticas Storage y los buckets creados por esta migración, luego funciones/triggers y tablas en orden inverso de dependencias. No eliminar un bucket que contenga objetos.
3. Si ya existen compras o archivos, no ejecutar `DROP` ni borrar buckets. Desactivar checkout, conservar el ledger para conciliación/reembolsos, exportar y respaldar órdenes, pagos y archivos, revocar escrituras de forma planificada y preparar una migración compensatoria. Eliminar datos requeriría autorización aparte.

La SQL definitiva propuesta continúa sin aplicar en `supabase/migrations/PROPUESTA_20261009_productos_digitales.sql`. `payments`, RPC y endpoints de MiPortal Pro no se alteran ni reutilizan.

## Verificación final de estados y permisos (2026-10-09)

Se corrigieron dos casos antes de solicitar autorización para una prueba Supabase aislada:

- Mercado Pago puede informar `in_mediation` mientras revisa una disputa. El webhook ahora la mapea a contracargo para retirar temporalmente los grants. Si luego informa `charged_back/reimbursed`, se mantiene revocado; si informa `charged_back/settled` (fondos retenidos por el vendedor), el estado lógico `chargeback_won` restaura el acceso.
- Una orden puede tener más de un ID de pago. Reembolsar/contracargar una captura solo revoca acceso cuando no existe otra captura aprobada o con contracargo resuelto a favor del vendedor. Un intento distinto que se apruebe después de un reembolso puede volver a dejar la orden pagada. Cancelaciones/rechazos tardíos no reemplazan una aprobación del mismo ID. Una aprobación tardía del mismo pago reembolsado/contracargado se rechaza.

Resultados locales verificables:

- La migración completa se ejecutó en una instancia temporal PGlite con stubs de Auth/Storage; los escenarios de pagos devolvieron: dos aprobaciones → `paid`/1 grant; rechazo y cancelación de otros intentos → sigue `paid`; reembolso de la primera captura → sigue `paid`/1 grant; reembolso de la última → `refunded`/0 grants; aprobación distinta posterior → `paid`/1 grant; disputa → `refunded`/0 grants; `chargeback_won` → `paid`/1 grant.
- Las ACL comprobadas en PGlite dieron `EXECUTE=false` para `anon` y `authenticated` y `true` para `service_role` en los cuatro RPC; una simulación de RLS permitió al comprador leer su orden, ocultó pagos al comprador y limitó el catálogo público a productos publicados.
- `npm run test:digital-products`, `npm run test:products`, `node --check api/digital-products/webhook.js` y `git diff --check`: OK.
- Esta comprobación local **no es una instancia Supabase real**: los stubs no prueban el middleware/API de Storage ni las particularidades del entorno Supabase.

Estado remoto y Database Advisors (solo lectura):

- No existe branch de prueba registrado. La organización `laoyvxdcfmjmsjpireis` está en plan Free, donde Branching no está incluido. El proyecto activo `miportal-backend` es producción; no se aplicó la propuesta. Otros dos proyectos listados están inactivos y no se reutilizaron.
- Producción conserva cero tablas `digital_*` y solo el bucket existente `miportal-marketing`; `payments`, `record_pro_payment`, `profiles`, `resources` y otros objetos existentes no se alteraron. Los buckets propuestos no existen.
- Los Advisors de producción son solo una línea base del esquema actual; no analizan la migración propuesta. Informaron 12 tablas existentes con RLS sin políticas, 2 funciones `SECURITY DEFINER` ejecutables por authenticated (`current_profile_role`, `is_admin`), protección de contraseñas filtradas desactivada; además 3 FKs sin índice, 2 avisos `auth_rls_initplan` en políticas existentes de `profiles` y 5 índices no usados. No se cambiaron esos objetos fuera de alcance. Ver [Security Advisors](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [funciones SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [protección contra contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [FK sin índice](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), [auth RLS initplan](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan) e [índices no usados](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

### Procedimiento pendiente para Supabase de pruebas

1. Habilitar Branching en una organización/plan que lo incluya o proporcionar un proyecto staging dedicado. No apuntar comandos ni migraciones a `miportal-backend`.
2. Crear el entorno aislado y comprobar URL/ref, que no sea producción, su esquema base, roles/Auth y Storage. Mantener checkout y credenciales de Mercado Pago apagados; no realizar pagos.
3. Aplicar ahí el SQL propuesto dentro de una transacción. Confirmar seis tablas con RLS, cuatro RPC server-only, dos buckets con configuración esperada y que todas las demás tablas/funciones/buckets sigan iguales.
4. Con usuarios de prueba `anon`, comprador A, comprador B y admin, probar lectura pública de publicado/no publicado; pedidos/grants propios y ajenos; denegación de escrituras/RPC a clientes; subida de archivos privada solo por admin; lectura privada denegada a compradores; lectura de imagen pública y carga/admin de portada.
5. Ejecutar repetidamente los escenarios de pagos documentados arriba mediante llamadas directas al RPC con fixtures, sin proveedor ni dinero real. Ejecutar Security y Performance Advisors en ese branch, resolver todo hallazgo nuevo de objetos `digital_*` y guardar resultados.
6. Destruir el entorno aislado al terminar o confirmar explícitamente cuánto tiempo/costo conservarlo. Después presentar resultados y solicitar una autorización separada antes de tocar producción.

La organización está en plan Free y la documentación de Supabase indica que Branching no está incluido en ese plan; los Preview Branches tienen facturación por uso (Compute desde US$0,01344/h en tamaño Micro), así que no se creó ningún recurso ni se aceptó ningún costo. [Precio y condiciones de Branching](https://supabase.com/docs/guides/platform/manage-your-usage/branching).
