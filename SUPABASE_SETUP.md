# MiPortal · Backend Supabase para el CRUD de Recursos

Guía completa de instalación, configuración y riesgos. Todo el código SQL está
en `supabase/schema.sql` (idempotente).

---

## 1. Variables de entorno y credenciales

| Dónde | Variable | Valor (sin valores reales) | ¿Se expone al navegador? |
|---|---|---|---|
| Supabase → Settings → API → Project URL | `SUPABASE_URL` | `https://TU-PROYECTO.supabase.co` | Sí (es pública por diseño) |
| Supabase → Settings → API → publishable / anon public | `SUPABASE_PUBLISHABLE_KEY` | `eyJhbGciOi...` (publishable, no service_role) | Sí (es pública por diseño) |
| Supabase → API → `service_role` | — | **NO USAR** en Vercel ni en el repo | Nunca |

> `SUPABASE_ANON_KEY` sigue aceptada como alias de compatibilidad: el build usa
> `SUPABASE_PUBLISHABLE_KEY` y, si no existe, cae a `SUPABASE_ANON_KEY`.

> La publishable/anon key y la Project URL viven en el navegador: eso es normal
> en Supabase. La seguridad NO depende de ocultarlas, sino de Row Level Security
> (el servidor rechaza lo que un cliente no debería hacer). La `service_role`
> key **bypasea RLS**: jamás debe configurarse en Vercel ni commitearse.

### Configuración en Vercel
1. `Settings → Environment Variables`:
   - `SUPABASE_URL` (Production, Preview, Development si querés probar)
   - `SUPABASE_PUBLISHABLE_KEY`
   - Como mínimo, dejarlas solo en **Production**.
2. `Settings → Build & Deployment`:
   - Framework Preset: **Other**
   - Build Command: `npm run build`
   - Output Directory: dejar vacío (los HTML ya están en la raíz)
3. Redeploy.

> El build corre `scripts/generate-config.mjs`, que lee esas variables y genera
> `supabase-config.js` (ignorado por git). Si un build corre sin las variables,
> la página muestra un estado de "configuración pendiente" en lugar de romperse.

### Entorno local (opcional)
Crear un `.env` (ver `.env.example`) y correr `npm run build` (o `npm run dev`)
antes de servir la carpeta:

```bash
SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_PUBLISHABLE_KEY=eyJhbGciOi...publishable...
```

---

## 2. Configuración en Supabase (una sola vez)

1. Crear el proyecto (o usar uno existente).
2. `Authentication → Providers → Email`: habilitado (default).
3. `Authentication → Users → Add user`: crear el administrador (email +
   contraseña) y confirmar el email desde el inbox.
4. `SQL Editor → New query`: pegar TODO el contenido de
   `supabase/schema.sql` y ejecutarlo (crea `profiles`, `resources`,
   políticas RLS, `is_admin()` y los 3 recursos iniciales).
5. Promover al administrador (comando final, descomentado):

```sql
update public.profiles
set role = 'admin', updated_at = now()
where email = 'TU_EMAIL_ADMIN@ejemplo.com';
```

Validar: `select email, role from public.profiles;`

> Si querés que el correo no pida confirmación, desactivá `Confirm email` en
> `Authentication → Providers → Email` (recomendado solo durante pruebas).

El seed reconstituye los 3 recursos fijos actuales (MDN, CSS-Tricks, WebAIM)
como filas de la base, así la página pública no cambia visualmente.

---

## 3. Arquitectura y archivos

### Base de datos (seguridad)
- `profiles`: perfil por usuario; el rol lo fija el **servidor** (trigger
  `handle_new_user` con `SECURITY DEFINER` — el cliente jamás puede asignarse
  admin). Promoción solo vía SQL.
- `is_admin()`: función `SECURITY DEFINER` que consulta `profiles` por
  `auth.uid()`. Es la única puerta de salida de las políticas.
- Row Level Security en `resources`:
  - SELECT público (`anon` + `authenticated`): solo `published = true`.
  - SELECT admin: todo (incluye borradores).
  - INSERT / UPDATE / DELETE: solo si `is_admin()`.
- `created_by` default `auth.uid()`; `updated_at` se actualiza solo con un
  trigger `BEFORE UPDATE`.
- `url`/`image_url` validadas con `CHECK` y categoría restringida. El formulario
  admin exige además `https://` (misma regla que la parte pública).

### Frontend (estático, sin build de framework)
| Archivo | Rol |
|---|---|
| `supabase/schema.sql` | SQL completo para Supabase |
| `scripts/generate-config.mjs` | Genera `supabase-config.js` desde env vars |
| `supabase-config.js` | **Generado, gitignored** (`window.MIPORTAL_SUPABASE`) |
| `js/supabase-client.js` | Crea el cliente supabase-js v2 (o `null` si falta config) |
| `recursos.html` + `main.js` | Sección pública: solo `published = true`, estados loading/empty/error, URLs validadas, `textContent` (sin HTML inyectado) |
| `login.html` + `js/admin/login.js` | Login email/contraseña, chequeo de rol admin y redirección si ya hay sesión admin |
| `admin/index.html` + `js/admin/index.js` | Listado admin (búsqueda + filtro por estado/categoría), publicar/despublicar, eliminar con `<dialog>`, toasts |
| `admin/recurso-form.html` + `js/admin/recurso-form.js` | Crear/editar recurso (`?id=`), validación https accesible |
| `js/admin/shared.js` | Guard `requireAdmin()` + API + toasts (JS del nivel admin) |
| `admin/admin.css` | Estilos del panel (reusa variables de `styles.css`) |

### Cómo funciona el guard de `/admin`
Cada página admin corre `requireAdmin()` → `getSession()` → si no hay sesión
redirige a `../login.html?next=…`; con sesión consulta `profiles.role`; si no
es `admin`, cierra sesión y redirige. El login anula `?next=` a destinos
externos (solo redirige dentro del mismo sitio). **Esto es solo de interfaz**:
la seguridad autoritativa es RLS en Supabase.

---

## 4. Pruebas realizadas (entorno local)

- `node --check` sobre todos los JS (`main.js`, `js/supabase-client.js`,
  `js/admin/*.js`): sin errores de sintaxis.
- `npm run build` (y `dev`) con y sin variables: genera `supabase-config.js`
  correctamente; sin variables escribe placeholders y avisa en consola.
- `@supabase/supabase-js` instalado como dependencia (se usa vía CDN en el
  sitio estático; el paquete queda declarado en `package.json`).
- Validación SQL: ejecutado el `schema.sql` en una base Supabase de prueba
  (creación idempotente, triggers y políticas ok; seed insertado).
- Verificación RLS de lectura: anon ve solo `published = true`.
- Flujo público: `recursos.html` renderiza tarjetas desde Supabase con estados
  de carga / vacío / error y valida URLs (solo `https:`).

### Pruebas manuales que debés hacer en producción
1. Entrar a `/recursos.html` público → deben verse MDN, CSS-Tricks, WebAIM.
2. Ir a `/login.html` → error al usar credenciales inválidas.
3. Ingresar con el admin → listado con los 3 recursos.
4. Crear un recurso, guardarlo, volver al listado, publicarlo/despublicarlo,
   eliminarlo (con el modal de confirmación).
5. Buscar y filtrar el listado por estado/categoría.
6. Con otro navegador anónimo verificar que el borrador **no** aparece en
   `/recursos.html` y que el recurso publicado **sí**.
7. Probar editar desde el listado y que `Actualizado` cambie.
8. Cerrar sesión desde el panel y entrar al login estando autenticado: debe
   redirigir directo a `/admin/`.

---

## 5. Riesgos de seguridad y tareas pendientes

- [ ] **Seguridad de la línea base**: RLS es la única barrera real. Si alguien
      obtiene la publishable key (es pública), igual no puede escribir.
- [ ] **MFA**: Supabase permite habilitar 2FA en Auth; recomendado como capa
      extra para la cuenta admin antes de producción real.
- [ ] **Contraseña admin**: el flujo actual no permite restablecerla en el
      frontend; el propietario la resetea desde `Authentication → Users` o
      recibe el mail de recuperación de Supabase.
- [ ] **`service_role`**: nunca configurarla en Vercel. Si alguien la tuviera
      en algún lado, rotarla desde Supabase Dashboard.
- [ ] **Email de confirmación**: en producción conviene dejar `Confirm email`
      habilitado para impedir cuentas no deseadas (aunque solo el admin editado
      manualmente a `admin` puede escribir).
- [ ] **Quota del free tier**: el plan gratuito de Supabase tiene límites de
      filas y de tráfico; monitorizar el Dashboard.
- [ ] **`image_url` remoto**: la página pública renderiza imágenes con `loading
      = lazy` y oculta las que fallen; el `referrer`/privacidad de esas peticiones
      depende del host externo. Opcional: subir imágenes al Storage de Supabase
      (fuera de alcance) y servir desde ahí.
- [ ] **Newsletter**: sigue sin backend (fuera de alcance de este cambio).
- [ ] **Dominio en producción**: cambiar `miportal.com` por el dominio real en
      SEO/OG/canonical/sitemap cuando exista.

---

## 6. Convenciones de código

- Conventional commits (la regla: `feat:`, `fix:`, `chore:`…).
- `textContent` y `createElement` para cualquier dato de la base (sin
  `innerHTML` con datos dinámicos).
- URLs de la base siempre validadas con `new URL()` y protocolo `https`.