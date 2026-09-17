# MiPortal · Backend Supabase para el CRUD de Recursos

Guía completa de instalación, configuración y riesgos. Todo el código SQL está
en `supabase/schema.sql`. Para una base existente usá la migración indicada abajo:
el seed del esquema completo puede duplicar recursos al volver a ejecutarlo.

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
2. `Settings → Build & Deployment` (o `vercel.json`, ya incluido):
   - Framework Preset: **Other**
   - Build Command: `npm run build`
   - Output Directory: `public`
   - El proyecto incluye `vercel.json` con `outputDirectory: "public"`, así que
     este ajuste del dashboard no es obligatorio.
3. Redeploy.

> El build corre `scripts/generate-config.mjs` (lee esas variables y genera
> `supabase-config.js`, ignorado por git) y `scripts/build-static.mjs` (copia
> el sitio final a `public/`, lo que Vercel sirve como Output Directory). Si un
> build corre sin las variables, la página muestra un estado de "configuración
> pendiente" en lugar de romperse.

### Entorno local (opcional)
Crear un `.env` (ver `.env.example`), correr `npm run build` y servir `public/`:

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
| `login.html` + `js/admin/login.js` | Login viewer/admin; conserva sesiones y redirige según rol |
| `recovery.html` + `reset-password.html` | Solicitud por correo y actualización de contraseña |
| `admin/index.html` + `js/admin/index.js` | Listado admin (búsqueda + filtro por estado/categoría), publicar/despublicar, eliminar con `<dialog>`, toasts |
| `admin/recurso-form.html` + `js/admin/recurso-form.js` | Crear/editar recurso (`?id=`), validación https accesible |
| `js/admin/shared.js` | Guard `requireAdmin()` + API + toasts (JS del nivel admin) |
| `admin/admin.css` | Estilos del panel (reusa variables de `styles.css`) |

### Cómo funciona el guard de `/admin`
Cada página admin corre `requireAdmin()` → `getSession()` → si no hay sesión
redirige a `../login.html?next=…`; con sesión consulta `profiles.role`; si no
es `admin`, conserva la sesión y redirige con un error visible. El login anula `?next=` a destinos
externos (solo redirige dentro del mismo sitio). **Esto es solo de interfaz**:
la seguridad autoritativa es RLS en Supabase.

---

## 4. Pruebas realizadas (entorno local)

- `node --check` sobre todos los JS (`main.js`, `js/supabase-client.js`,
  `js/admin/*.js`): sin errores de sintaxis.
- `npm run build` (y `dev`) con y sin variables: genera `supabase-config.js`
  correctamente y deja el sitio en `public/`; sin variables escribe placeholders
  y avisa en consola.
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
- [ ] **Recuperación de contraseña**: configurar URLs de redirección y correo
      siguiendo la sección siguiente; verificar la entrega real antes de publicar.
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

## 7. Viewer sessions, password recovery and RLS deployment

The frontend accepts both roles. Viewers land on `/index.html`; administrators
land on `/admin/`. Explicit same-origin destinations are retained when permitted.
Profile lookup errors never sign users out. A missing profile fails closed for
admin access and shows an error at login.

### Apply the backend update

For an existing installation, execute
`supabase/migrations/20260917_auth_roles.sql` in the Supabase SQL Editor as
`postgres`. For a new installation, execute `supabase/schema.sql` instead.
The migration is transactional and repeatable, preserves existing roles and
backfills email users as viewers. If the database has `private.is_admin()`, it
retains the existing resource policies and aligns that helper with `profiles`.
It refuses that conversion if legacy `user_roles` administrators need reconciliation.
Otherwise it reinstalls the repository's named resource policies.
Promote administrators only using the SQL in section 2, never user metadata.

Inspect `pg_policies` for `profiles` and `resources` after deployment. Additional
permissive policies installed outside this repository can widen access; this
migration deliberately does not delete unknown policies. Do not expose
`service_role` to the browser. Static `/admin/` HTML is publicly downloadable;
the JavaScript guard controls the UI, while RLS protects data and mutations.

### Configure recovery email

In **Authentication → URL Configuration**, set the production **Site URL** and
allow these exact URLs for each trusted deployment origin:

- `https://YOUR-DOMAIN/login.html` (signup confirmation).
- `https://YOUR-DOMAIN/reset-password.html` (password recovery).

Add corresponding localhost URLs with the actual development port when needed.
Enable the Email provider and configure working SMTP/delivery limits. Keep the
recovery email template's `{{ .ConfirmationURL }}` link: it validates the one-use
token and forwards to the requested callback. The client currently uses the
Supabase implicit callback (`#access_token=…&type=recovery`), not a custom
`token_hash` template or a server-side PKCE callback.

The callback waits for a validated `PASSWORD_RECOVERY` event (including events
received before its script loaded), accepts matching passwords, calls
`updateUser`, and signs out on success. Errors remain visible with retry/new-link
navigation. An ordinary stored session does not enable the reset form. Refreshing
the callback after tokens are consumed requires a new link. A failed sign-out
after a successful update is reported explicitly. The minimum client length is
six characters; stronger Supabase password requirements still apply on the server.

### Verification evidence and production acceptance

- `node --test scripts/auth.test.mjs`: deterministic role, navigation, validation,
  recovery and failure-path tests with a simulated Auth API.
- `node --test scripts/auth-browser.test.mjs`: Chrome, real Supabase JS SDK,
  simulated HTTP responses; viewer persistence across navigation, admin guards,
  visible/focused validation and recovery callback with delayed script loading.
- `node --test scripts/rls.test.mjs`: isolated ephemeral Docker PostgreSQL 16;
  real policy/trigger execution, repeatable setup/migration, metadata escalation,
  own-profile edits, public/draft visibility and viewer/admin CRUD permissions.
  Requires Docker and the local `postgres:16-alpine` image. Creates no host port
  or persistent volume and never connects to existing containers.

These checks do not prove deployed Supabase configuration or email delivery.
With real viewer/admin accounts, verify login, reload, logout, draft visibility,
direct unauthorized REST writes, recovery email, expired/reused links, and login
with the new password (the old password must fail). Use the publishable key and
each user's JWT for RLS acceptance; `service_role` bypasses the policies.

## 8. Verificación remota — 17 de septiembre de 2026

Proyecto comprobado: `miportal-backend` (`lfflmyqjoxntoatbbwtf`).

- Aplicada mediante el conector la migración `auth_roles_preserve_resource_policies`,
  correspondiente al archivo local `supabase/migrations/20260917_auth_roles.sql`
  adaptado a las políticas encontradas en producción.
- Antes había un usuario sin perfil; después hay cero perfiles faltantes y dos
  perfiles `viewer`. No se asignó permanentemente el rol administrador a nadie.
- El panel consultaba `profiles.role`, mientras el CRUD remoto consultaba
  `user_roles`, que estaba vacía. Ahora `private.is_admin()` consulta `profiles`.
- Se conservaron las cinco políticas existentes de `resources`, incluida la
  comprobación `created_by = auth.uid()` al insertar. La prueba no dejó recursos.
- Verificados en la base remota mediante SQL, dentro de una transacción revertida:
  viewer sin lectura de borradores ni escrituras; autoascenso a admin rechazado;
  administrador con lectura, creación, edición y eliminación; visitante con
  lectura de publicados, sin borradores ni inserción.
  Se usaron `SET LOCAL ROLE` y claims de Auth controlados para probar RLS, no un
  inicio de sesión real ni tokens emitidos por el servicio Auth. La promoción
  temporal de un perfil y los datos de prueba se deshicieron con `ROLLBACK`.
- Reejecutadas 26 pruebas locales: todas aprobadas. Chrome usó respuestas Auth
  simuladas y las pruebas PostgreSQL locales usaron una instancia aislada.
- Restringida la ejecución pública de `handle_new_user`, `current_profile_role`
  e `is_admin`; el trigger no requiere acceso RPC desde el navegador.
- Build y `git diff --check` aprobados después de los cambios.
- Security Advisor ya no informa funciones SECURITY DEFINER accesibles para
  visitantes anónimos. Conserva dos avisos por helpers de rol accesibles a
  usuarios autenticados: ambos solo consultan el rol de `auth.uid()` y forman
  parte del control de acceso. Véase la
  [explicación del aviso](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
  También informa protección de contraseñas filtradas desactivada; no se cambió
  esa opción de Auth. Véase
  [protección de contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

### Dashboard y despliegue público comprobados

- Sesión del Dashboard disponible y configuración de Auth revisada.
- Site URL existente: `https://mi-portal-seven.vercel.app`.
- Guardadas las redirecciones exactas a `/login.html` y `/reset-password.html`
  para ese dominio. Se conservó la regla previa `https://mi-portal-seven.vercel.app/**`.
- Proveedor Email habilitado y confirmación de correo activada.
- SMTP personalizado desactivado; el Dashboard indica que se utilizan plantillas
  predeterminadas. No se configuró ningún proveedor ni se comprobó entrega real.
- El propietario confirmó que no dispone de proveedor SMTP.
- Tras recibir la identificación explícita de la cuenta administradora, se
  promovió únicamente esa cuenta existente y con correo confirmado a `admin`.
  Se conservó el otro perfil como `viewer`. El correo personal no se incluye
  en esta documentación.
- Publicada por CLI la versión local en el proyecto existente `mi-portal` y
  su dominio `https://mi-portal-seven.vercel.app`. Estado confirmado: `READY`.
  [Despliegue](https://vercel.com/emiles-projects-c997f3b7/mi-portal/6Ju1eiPdeK1aCW753oeLk4mxJkWD).
- Comprobados por HTTP 12 archivos de autenticación y estados, incluidas
  `/recovery.html` y `/reset-password.html`: todos responden 200 y son idénticos
  byte a byte a los archivos locales probados. El 404 de recuperación quedó
  resuelto. La configuración pública apunta al proyecto Supabase correcto y
  no contiene placeholders.
- La publicación se hizo desde una copia de fuentes preparada sin `.env`, SQL
  ni dependencias locales. No se hizo commit ni push a GitHub: la rama remota
  sigue en la versión anterior. Antes de otro despliegue desde Git hay que
  sincronizar estos cambios para no reemplazar la corrección publicada.

Pendiente para completar la aceptación de extremo a extremo:

1. Configurar un proveedor SMTP con los datos reales del servicio que elija el
   propietario y verificar la entrega del correo.
2. Probar login y recuperación con cuentas reales, entrega del correo, enlace
   expirado/reutilizado y rechazo de la contraseña anterior.
3. Sincronizar el código local probado con GitHub antes del siguiente despliegue
   automático desde la rama `main`.

Estos pendientes no se consideran completados por las pruebas SQL o simuladas.
