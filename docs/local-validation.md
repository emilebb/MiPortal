# Auditoría reproducible sin CDP

Esta herramienta ejecuta axe-core 4.14.0 en un navegador normal, incluido el navegador integrado. No reemplaza las cuatro suites CDP ni certifica WCAG. No desactiva sandbox, CSP, antivirus ni autenticación.

1. Instala las dependencias fijadas: `npm ci --ignore-scripts`.
2. Genera el sitio: `npm run build`. No hacen falta claves reales para esta auditoría.
3. Ejecuta `npm run audit:serve -- --output=./artifacts/accessibility.json`.
4. Abre `http://127.0.0.1:4174/__audit/` en un navegador compatible y espera a «Completado: 76/76». El servidor solo escucha en 127.0.0.1.
5. Ejecuta `npm run audit:check -- ./artifacts/accessibility.json`.
6. Detén el servidor de pruebas al terminar.

La matriz actual tiene 19 páginas públicas raíz × 2 anchos (390/1440) × 2 temas (claro/oscuro). Usa fixtures ficticios y estado anónimo. Las páginas protegidas de administración, las sesiones reales, otros estados de interacción y los proveedores siguen requiriendo sus pruebas específicas. Las APIs locales responden 503; fetch externo se bloquea y las consultas de datos se simulan. Las fuentes tipográficas públicas pueden cargarse mediante CSS; el entorno no es una medición de rendimiento productivo.

El motor y los scripts de auditoría se sirven solo desde este servidor; quedan excluidos de la salida de producción. No se necesitan variables de producción. Los resultados contienen HTML ficticio o público y no deben combinarse con sesiones personales ni datos de usuarios.

El comprobador devuelve:

- 0: matriz completa, sin violaciones ni revisiones incompletas en las comprobaciones ejecutadas. Esto sigue sin equivaler a conformidad WCAG completa.
- 1: matriz incompleta, duplicada, inesperada, con errores, desbordamiento o violaciones detectadas.
- 2: sin violaciones detectadas en la matriz completa, pero existen resultados `incomplete` que requieren revisión manual. No eliminarlos ni contarlos como aprobados.

Conservar el JSON original junto con una revisión manual de sus casos incompletos. Un tema, una página o un ancho no se sustituyen por otro escenario repetido.

## Las cuatro suites de navegador

Continúan requiriendo Chrome/Chromium capaz de arrancar su renderizador y responder a CDP. El entorno actual falla con Chrome, Edge y Headless Shell; WSL no está instalado y no hay Docker/Podman disponible. No se han cambiado componentes del sistema.

Para ejecutarlas sin publicar la rama, copia el ZIP de código a una máquina de pruebas compatible, instala Node 24 y Chrome/Chromium estable, ejecuta `npm ci --ignore-scripts` y `npm test`, con `CHROME_BIN` apuntando al ejecutable existente si no se detecta automáticamente. No añadas `--no-sandbox`. No uses claves productivas. Devuelve el registro completo y el SHA del código probado. Si el navegador no arranca con sus protecciones activas, registra el bloqueo y utiliza otro entorno compatible; no reduzcas sus protecciones.

No es necesario subir cambios a GitHub ni activar CI/despliegues para hacer este ensayo. Cualquier publicación sigue requiriendo autorización.

## Resultado vigente de validación

La matriz consolidada tiene 76 escenarios (19 páginas × 2 anchos × 2 temas), sin combinaciones ausentes o duplicadas, sin errores de ejecución finales ni desbordamiento. El motor no detectó violaciones en esos escenarios; conserva 152 resultados `incomplete` que requieren revisión manual. No son 152 defectos distintos ni comprobaciones aprobadas.

Se conserva el primer registro posterior a las correcciones con cuatro timeouts de instrumentación en recuperación. El producto limpia la URL por seguridad y borraba el identificador del caso. La herramienta ahora lo captura antes de esa limpieza y mantiene un identificador por ejecución para rechazar mensajes de ejecuciones anteriores. No se cambió esa protección del producto. El reensayo específico de los cuatro escenarios de recuperación terminó correctamente y se incorporó al informe consolidado con referencias a los registros originales.

Archivos: `Accesibilidad-axe-ejecucion-principal.json`, `Accesibilidad-axe-retest-recuperacion.json`, `Accesibilidad-axe-local.json` y `Resumen-accesibilidad-axe.json`. El último comprobador devuelve código 2 (revisión manual), no aprobación total.

Se pueden repetir casos específicos añadiendo `--page=reset-password.html` al servidor y al comprobador; usa otro puerto con `AUDIT_PORT` si ya existe un servidor. Conserva los registros de fallos y reensayos. No consolides datos de versiones distintas del producto como si fueran una única prueba.

### Revisión adicional de las fechas

El motor marcó como incompleto el uso de `aria-label` en elementos `time`. Se conservó el dato de publicación como contenido textual accesible (prefijo y fecha relativa ocultos solo visualmente), sin sobreescribir el nombre del elemento. Se repitieron los cuatro escenarios de noticias y desapareció ese aviso. El consolidado final combina 68 escenarios del registro principal, cuatro de recuperación y cuatro de noticias; conserva referencias a ambos reensayos y al registro original. Quedan 152 avisos incompletos de contraste y nombres de controles con iconos, repetidos por escenario, que requieren revisión manual. No se declararon aprobados.
