# Productos digitales: alcance y pendientes

El catálogo consulta exclusivamente `public.digital_products` y solo muestra filas con `published = true`. Mientras la tabla no exista o no sea accesible, la interfaz informa que el esquema no está disponible. No se usan fixtures ni datos de `resources`, `profiles` o `payments`; no hay productos cargados por esta implementación. Las categorías disponibles se derivan de los productos publicados. La propuesta contempla destacados, novedades, gratuidad, características, tecnologías, versión, requisitos, licencia, galería y relaciones opcionales; la interfaz los muestra solo cuando contienen datos. Los importes se expresan en COP y la propuesta restringe esa moneda.

## Pendientes antes de habilitar ventas

- **Administración:** no existe CRUD, flujo de revisión ni control administrativo para crear, editar, publicar o retirar productos. La propuesta de esquema no habilita mutaciones desde el navegador.
- **Pago:** no hay checkout, integración de proveedor, creación/validación de pedidos, conciliación, reembolsos ni tratamiento de impuestos. `payments` corresponde exclusivamente a MiPortal Pro y no se reutiliza.
- **Descargas:** falta un bucket privado, política de acceso por compra verificada, generación limitada de URL firmadas, expiración, auditoría y gestión de archivos. No enlazar objetos privados desde el catálogo.
- **Operación:** definir estados, términos, soporte, privacidad/retención, controles antifraude y procedimiento de publicación antes de aceptar compras.

`supabase/migrations/PROPUESTA_20261009_productos_digitales.sql` es documentación/propuesta no aplicada. **Requiere autorización explícita antes de ejecutarse** y revisión por responsable de base de datos. No ejecutar SQL como parte de esta tarea ni modificar datos reales.
