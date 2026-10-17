# Accesos de lectura necesarios — MiPortal.me

Alcance: terminar la verificación sin cobros, despliegues, migraciones, ejecución de flujos ni cambios de configuración. No se necesitan contraseñas, claves privadas, tokens de servicio ni acceso de escritura. Compartir acceso mediante la plataforma o exportaciones saneadas.

| Plataforma y recurso exacto | Lectura necesaria | Para qué | Estado conocido |
|---|---|---|---|
| Vercel, proyecto `mi-portal`, equipo `emiles-projects-c997f3b7` | Configuración legible: versión de Node, framework, dominios, protección y despliegues | Correlacionar servicio y checkout | Lectura disponible; Node 24.x, dominio propio verificado, framework reportado `null`, SSO habilitado para previews salvo dominios personalizados |
| Mismo proyecto Vercel | Historial/detalle de despliegues, rama/SHA, estado y registros de compilación; logs saneados de funciones | Correlacionar versión activa y errores | SHA de producción `1b6eb4b` en `main`; preview del SHA `86c0961` está `READY`. No se leyeron logs de función |
| Mismo proyecto Vercel | Nombres de variables y entornos asignados, sin valores | Revisar los contratos de configuración | Inventario leído con `decrypt=false`; `MERCADOPAGO_MODE` no aparece. No se leyeron secretos |
| Supabase `miportal-backend`, ref `lfflmyqjoxntoatbbwtf` | Esquema, migraciones, funciones, triggers, grants, políticas RLS, asesores y estadísticas agregadas | Revisar permisos, compatibilidad y diferencias con el repositorio | Disponible en esta sesión; PostgreSQL 17.6.1; no ampliar a otros proyectos |
| Mismo Supabase | Estado agregado de roles y registros de pago; historial de cambios de rol si existe | Aclarar el origen de Pro sin leer datos personales | 1 perfil `pro`, 0 filas en `payments`, `pro_subscriptions` no existe; origen sigue sin prueba |
| Mismo Supabase | Logs saneados de Auth/API/Database en una ventana acordada y metadatos de copias de seguridad/PITR (existencia, última fecha y retención) | Correlacionar fallos y preparar recuperación; no descargar copias ni datos completos | Pendiente; el historial puede no conservar el cambio antiguo |
| n8n `https://n8n.miportal.me` | Definiciones/exportaciones saneadas de los flujos de contacto, asistente, ingestión de noticias e informe Daily; estado activo, versión, configuración de webhook/respuesta y manejo de errores | Verificar contratos, autenticación entre servicios, imágenes originales y filtro editorial | Solo se alcanzó el inicio de sesión; sin acceso a los flujos |
| Mismo n8n | Ejecuciones recientes: fecha, resultado, duración, nodo fallido, código de error; entradas/salidas mínimas anonimizadas | Comprobar entrega real y explicar errores sin generar nuevas ejecuciones | Pendiente; no incluir mensajes privados ni respuestas completas del asistente |
| Mismo n8n | Nombre/tipo/presencia de las credenciales enlazadas; nunca valores | Detectar referencias ausentes y dependencias | Pendiente |

Si el plan de n8n o el rol de Vercel no permite lectura granular, sirven exportaciones saneadas por el propietario. No conceder un rol de escritura solo para facilitar esta auditoría. No hace falta instalar otra plataforma ni compartir secretos por el chat.

La investigación de Pro debe terminar con evidencia del origen y una decisión explícita del propietario sobre su continuidad y duración. Hasta entonces se conserva el beneficio y no se ejecuta la migración. Resolver el origen no autoriza por sí solo a reducir beneficios ni a migrar producción.

## Pasos para completar el acceso sin compartir secretos

Comprobación del 16 de octubre de 2026: Supabase permite lectura; Vercel permite leer el proyecto, previews y nombres de variables con valores cifrados. No se leyeron valores secretos ni logs con datos de usuarios. n8n sigue requiriendo inicio de sesión y no hay conexión autorizada disponible en esta tarea. No hace falta volver a conceder acceso general a Supabase o Vercel ni invitar una cuenta del agente.

### Vercel — lectura completada; configuración sandbox pendiente

No es necesaria otra concesión de acceso. Antes de activar pagos, confirma desde tu panel que `MERCADOPAGO_MODE` se configure como `test` con credenciales sandbox y que la notificación sandbox esté firmada. No envíes valores de secretos por chat. La variable no aparecía en el inventario leído; no la añadí ni cambié configuración.

Referencia: [roles oficiales de Vercel](https://vercel.com/docs/rbac/access-roles). La disponibilidad y el alcance dependen de tu plan.

### Supabase

1. Mantén la conexión actual al proyecto `miportal-backend` (`lfflmyqjoxntoatbbwtf`); ya puedo leer esquema y datos mínimos de auditoría.
2. No entregues la clave `service_role`, claves secretas ni contraseña de base de datos. No hace falta una nueva clave.
3. Desde el dashboard del proyecto, revisa Database Backups: entrega únicamente última copia disponible, retención, disponibilidad de PITR y evidencia de un ensayo previo de restauración si existe. No pulses Restore.
4. Para el origen Pro, aporta cualquier comprobante ya existente de concesión/pago/importación o histórico de cambios. Las fechas del perfil, por sí solas, no prueban el origen. No modifiques el perfil para probar nada.
5. Si en otro momento se usa una cuenta humana de auditoría: Organization Settings > Team permite roles por proyecto según plan. Read-Only/No-access requieren Team/Enterprise según documentación; además Read-Only puede acceder a secretos. Por ello, para un alcance estrictamente sin secretos y limitado a esta revisión, se prefieren exportaciones saneadas a crear una cuenta amplia. No invitar al agente con un correo inventado.

Referencia: [control de acceso oficial de Supabase](https://supabase.com/docs/guides/platform/access-control).

### n8n

1. Entra tú en `https://n8n.miportal.me`; el navegador del agente llega al inicio de sesión. No envíes tu contraseña ni pegues una API key.
2. Abre los flujos de contacto, asistente, noticias y Daily. Descarga su definición JSON desde el menú del workflow; no los ejecutes ni publiques.
3. Antes de adjuntar el JSON, elimina `pinData`, datos de ejecuciones y valores sensibles en nodos (Authorization, tokens, contraseñas, cookies y URLs que contengan claves). Conserva estructura de nodos, conexiones, nombres/tipos de credenciales y configuración de respuestas. Los nombres de credenciales bastan; sus valores no.
4. En Executions, comparte para esos flujos una tabla saneada con fecha, estado, duración, nodo fallido y error. Revisa y elimina cuerpos con correos o conversaciones. No pulses Retry ni Execute.
5. Si el plan es Enterprise y se utiliza una cuenta humana de auditoría, el propietario puede asignar Project Viewer al proyecto correspondiente desde la gestión de miembros del proyecto. Este rol no permite ejecutar flujos, pero puede ver credenciales y todas las ejecuciones del proyecto. Si ese alcance es excesivo o el plan no lo ofrece, utiliza las exportaciones anteriores; no concedas Editor/Admin.

Referencia: [roles oficiales de n8n](https://docs.n8n.io/administer/manage-users-and-access/set-permissions-and-roles-rbac/see-available-roles/).

Con estos archivos adjuntos se puede continuar la revisión sin nuevos permisos de escritura. La autorización para desplegar o modificar producción seguirá siendo independiente.

## Actualización de esta fase

Lecturas comprobadas nuevamente: Supabase disponible; Vercel permite leer el proyecto y sus despliegues; n8n requiere iniciar sesión. No se modificaron permisos. No se necesita volver a compartir la URL del repositorio, conceder escritura ni crear una cuenta del agente.

Para Pro, el estado y las funciones actuales no acreditan el origen histórico. Conserva el perfil y aporta únicamente evidencia existente. Los metadatos de backup/PITR siguen pendientes de lectura/confirmación del propietario; no pulses Restore.
