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
