# Accesos de lectura necesarios — MiPortal.me

Alcance: terminar la verificación sin cobros, despliegues, migraciones, ejecución de flujos ni cambios de configuración. No se necesitan contraseñas, claves privadas, tokens de servicio ni acceso de escritura. Compartir acceso mediante la plataforma o exportaciones saneadas.

| Plataforma y recurso exacto | Lectura necesaria | Para qué | Estado conocido |
|---|---|---|---|
| Vercel, proyecto `mi-portal`, equipo `emiles-projects-c997f3b7` | Configuración del proyecto: raíz, framework, órdenes de compilación, versión de Node, regiones y dominios | Verificar que el código y el proceso auditados corresponden al servicio real | Listado de proyectos accesible; detalle y despliegues devolvieron 403 |
| Mismo proyecto Vercel | Historial y detalle de despliegues, rama/SHA, estado y registros de compilación; registros de funciones con identificadores y datos personales redactados | Correlacionar versión activa y errores con cambios; comprobar origen/proxy del límite por IP | Falta autorización de lectura al proyecto |
| Mismo proyecto Vercel | Nombres de variables, presencia y entornos asignados; configuración efectiva de headers, protección y caché | Comprobar contratos de configuración sin revelar valores secretos | No leer ni exportar valores de secretos; si la interfaz no separa este permiso, entregar inventario saneado |
| Supabase `miportal-backend`, ref `lfflmyqjoxntoatbbwtf` | Esquema, migraciones, funciones, triggers, grants, políticas RLS, asesores y estadísticas agregadas | Revisar permisos, compatibilidad y diferencias con el repositorio | Ya disponible en la auditoría anterior; no ampliar a otros proyectos |
| Mismo Supabase | Fechas y estados de la cuenta Pro afectada y sus registros de pago, mediante consulta específica o exportación saneada; historial de cambios de rol si existe | Aclarar si el beneficio provino de una concesión manual, prueba, importación o pago externo | Solo se comprobó 1 Pro y 0 pagos; el origen sigue sin prueba. No hacen falta correos, documentos, direcciones ni conversaciones |
| Mismo Supabase | Logs saneados de Auth/API/Database en una ventana acordada y metadatos de copias de seguridad/PITR (existencia, última fecha y retención) | Correlacionar fallos y preparar recuperación; no descargar copias ni datos completos | Pendiente; el historial puede no conservar el cambio antiguo |
| n8n `https://n8n.miportal.me` | Definiciones/exportaciones saneadas de los flujos de contacto, asistente, ingestión de noticias e informe Daily; estado activo, versión, configuración de webhook/respuesta y manejo de errores | Verificar contratos, autenticación entre servicios, imágenes originales y filtro editorial | Solo se alcanzó el inicio de sesión; sin acceso a los flujos |
| Mismo n8n | Ejecuciones recientes: fecha, resultado, duración, nodo fallido, código de error; entradas/salidas mínimas anonimizadas | Comprobar entrega real y explicar errores sin generar nuevas ejecuciones | Pendiente; no incluir mensajes privados ni respuestas completas del asistente |
| Mismo n8n | Nombre/tipo/presencia de las credenciales enlazadas; nunca valores | Detectar referencias ausentes y dependencias | Pendiente |

Si el plan de n8n o el rol de Vercel no permite lectura granular, sirven exportaciones saneadas por el propietario. No conceder un rol de escritura solo para facilitar esta auditoría. No hace falta instalar otra plataforma ni compartir secretos por el chat.

La investigación de Pro debe terminar con evidencia del origen y una decisión explícita del propietario sobre su continuidad y duración. Hasta entonces se conserva el beneficio y no se ejecuta la migración. Resolver el origen no autoriza por sí solo a reducir beneficios ni a migrar producción.

## Pasos para completar el acceso sin compartir secretos

Comprobación de esta sesión: Supabase permite consultas de lectura y logs; Vercel mantiene HTTP 403 para el alcance `emiles-projects-c997f3b7`; no hay CLI Vercel disponible. No es necesario volver a conceder acceso general a Supabase. No existe una cuenta o correo del agente que debas invitar.

### Vercel

1. Entra en Vercel con tu propia cuenta y selecciona el equipo `emiles-projects-c997f3b7`; abre el proyecto `mi-portal`.
2. En la configuración de la integración/conexión de Vercel que utilizas con esta aplicación, revisa el equipo y los proyectos autorizados. Si ofrece selección granular, incluye únicamente `mi-portal` y las lecturas de la tabla anterior. No compartas un token en el chat.
3. Si no ofrece lecturas granulares, no amplíes a escritura: entrega exportaciones saneadas desde Project Settings, Deployments y Logs con los datos indicados. Una reconexión normal puede renovar la autorización del equipo, pero no garantiza corregir este 403 y no justifica permisos adicionales.
4. Si ya trabajas con un colaborador humano, los roles dependen del plan: Project Viewer está documentado para Enterprise; Pro Viewer ofrece lectura limitada a proyectos/despliegues. No cambies a Developer o Admin para esta auditoría. No crees un colaborador desconocido ni un acceso de equipo amplio para el agente.
5. Para variables, copia solo nombre, presencia y entorno; oculta valor. Incluye el SHA de producción y errores saneados de compilación/funciones. Después comprobaré nuevamente la lectura del proyecto, sin publicar nada.

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
