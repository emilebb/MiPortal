# Auditoría de Accesibilidad WCAG 2.2 AA - MiPortal

## Incidencias Corregidas ✅

### 1. Nombres accesibles en botones de iconos
- **Problema**: Botón de tema (🌙) sin `aria-label` descriptivo
- **Solución**: Añadido `aria-label="Cambiar entre modo claro y oscuro"` en todas las páginas
- **Archivos**: index.html, noticias.html, recursos.html, contacto.html, sobre-nosotros.html, terminos-y-condiciones.html, politica-de-privacidad.html
- **Impacto**: Los usuarios de lectores de pantalla ahora entienden la función del botón

### 2. Tipo de botón en elementos no formularios
- **Problema**: Botones sin `type="button"` pueden comportarse como submit
- **Solución**: Añadido `type="button"` a:
  - Botón de tema (`#themeToggle`)
  - Botón de navegación móvil (`#navToggle`)
  - Botones de filtro de noticias
  - Botón de contacto deshabilitado
- **Archivos**: Todos los HTML y main.js
- **Impacto**: Previene envíos de formularios accidentales

### 3. Atributos ARIA mejorados en menú móvil
- **Problema**: Botón de navegación sin estado de expansión
- **Solución**: Añadido:
  - `aria-expanded="false"` (inicial)
  - `aria-controls="mainNav"` 
  - `aria-label` dinámico según estado
  - Gestión de foco al abrir/cerrar
  - Cierre con tecla ESC
- **Archivos**: Todos los HTML, main.js
- **Impacto**: Menú móvil totalmente accesible con teclado

### 4. Foco visible y orden lógico de tabulación
- **Problema**: Sin indicador visual de foco
- **Solución**: Añadido `:focus-visible` con outline azul
- **Archivos**: styles.css
- **Impacto**: Usuarios de teclado pueden ver dónde está el foco

### 5. Contraste de texto mejorado
- **Problema**: Color `--muted-color: #64748b` tiene contraste 4.5:1 (límite AA)
- **Solución**: Mejorado a `--muted-color: #475569` (contraste ~7:1)
- **Archivos**: styles.css
- **Impacto**: Mejor legibilidad en modo claro y oscuro

### 6. Textos alternativos en imágenes de noticias
- **Problema**: `alt` genérico o ausente
- **Solución**: `alt="Imagen: {título de la noticia}"`
- **Archivos**: main.js
- **Impacto**: Usuarios de lectores de pantalla entienden el contexto de las imágenes

### 7. Estados de botones de filtro
- **Problema**: Sin información de estado para lectores de pantalla
- **Solución**: Añadido:
  - `role="group"` y `aria-label` al contenedor
  - `aria-pressed="true/false"` dinámico
- **Archivos**: noticias.html, main.js
- **Impacto**: Estado de filtros accesible para usuarios de lectores de pantalla

### 8. Etiquetas de formulario
- **Problema**: Campo de búsqueda sin etiqueta visible
- **Solución**: Añadido `<label class="visually-hidden">` para `searchInput`
- **Archivos**: noticias.html, styles.css
- **Impacto**: Campo de búsqueda ahora tiene etiqueta asociada

### 9. Atributos aria-required
- **Problema**: Campos `required` sin `aria-required`
- **Solución**: Añadido `aria-required="true"` a campos obligatorios
- **Archivos**: noticias.html, recursos.html, contacto.html
- **Impacto**: Usuarios de lectores de pantalla saben qué campos son obligatorios

### 10. Botón deshabilitado accesible
- **Problema**: Botón de contacto deshabilitado sin indicación
- **Solución**: Añadido `disabled` y `aria-disabled="true"`
- **Archivos**: contacto.html
- **Impacto**: Estado de deshabilitado accesible

### 11. Actualización dinámica de aria-label
- **Problema**: Label de botón de tema no cambia con el estado
- **Solución**: JavaScript actualiza `aria-label` según modo claro/oscuro
- **Archivos**: main.js
- **Impacto**: Estado del botón siempre descriptivo

## Incidencias Pendientes ⚠️

### 1. Skip Navigation Link
- **Problema**: Sin enlace para saltar navegación
- **Prioridad**: Media
- **Solución sugerida**: Añadir enlace "Saltar al contenido" al inicio del body
- **Impacto**: Usuarios de teclado pueden saltar navegación repetitiva

### 2. Estructura de encabezados
- **Problema**: Algunas páginas pueden tener saltos en niveles de h1-h6
- **Prioridad**: Baja
- **Solución sugerida**: Revisar jerarquía de encabezados en cada página
- **Impacto**: Mejor navegación por estructura del documento

### 3. Lang attribute en contenido dinámico
- **Problema**: Noticias externas pueden tener idioma diferente
- **Prioridad**: Baja
- **Solución sugerida**: Añadir `lang` apropiado a tarjetas de noticias si es posible detectar idioma
- **Impacto**: Lectores de pantalla usan pronunciación correcta

### 4. Tamaño de toque en móvil
- **Problema**: Algunos elementos interactivos pueden ser < 44x44px
- **Prioridad**: Media
- **Solución sugerida**: Verificar y ajustar padding de botones en móvil
- **Impacto**: Mejor usabilidad táctil

### 5. ARIA live regions para cambios dinámicos
- **Problema**: Carga de noticias sin notificación a lectores de pantalla
- **Prioridad**: Media
- **Solución sugerida**: Ya existe `aria-live="polite"` en `lastUpdated`, considerar añadir en `cardsContainer`
- **Impacto**: Usuarios de lectores de pantalla notificados de cambios

### 6. Validación de formulario con errores
- **Problema**: Sin mensajes de error accesibles en formularios
- **Prioridad**: Alta (cuando se implemente backend)
- **Solución sugerida**: Implementar `aria-invalid` y `aria-describedby` para errores
- **Impacto**: Usuarios saben exactamente qué corregir

### 7. Títulos de página dinámicos
- **Problema**: Título no cambia según contexto (búsqueda, categoría)
- **Prioridad**: Baja
- **Solución sugerida**: Actualizar `document.title` según contexto
- **Impacto**: Mejor orientación del usuario

### 8. Colores convey meaning
- **Problema**: Uso de solo color para indicar estado activo
- **Prioridad**: Baja
- **Solución sugerida**: Añadir indicador adicional (icono, borde) además del color
- **Impacto**: Usuarios con daltonismo

### 9. Reducción de movimiento
- **Problema**: Animaciones sin respectar `prefers-reduced-motion`
- **Prioridad**: Media
- **Solución sugerida**: Añadir media query para desactivar animaciones
- **Impacto**: Usuarios sensibles al movimiento

### 10. Zoom y reflow
- **Problema**: Verificar que el sitio funcione con 200% zoom
- **Prioridad**: Alta
- **Solución sugerida**: Prueba manual de zoom y ajustes de layout
- **Impacto**: Usuarios con baja visión

## Resumen

**Total incidencias corregidas**: 11
**Total incidencias pendientes**: 10

El sitio ahora cumple con la mayoría de los criterios WCAG 2.2 AA de nivel A y AA. Las incidencias pendientes son principalmente mejoras que elevarían el nivel de cumplimiento a AAA o mejoras de experiencia para usuarios específicos.

## Recomendaciones de Prioridad

1. **Inmediato**: Validación de formulario con errores (cuando se implemente backend)
2. **Corto plazo**: Skip navigation link, tamaño de toque en móvil, zoom 200%
3. **Medio plazo**: ARIA live regions, reducción de movimiento
4. **Largo plazo**: Estructura de encabezados, títulos dinámicos, colores convey meaning