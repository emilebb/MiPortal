// ============================================================================
// Copia el sitio estático final a public/ para Vercel, que sirve esa carpeta
// como Output Directory. Se usa una allowlist: solo lo que el portal necesita
// en producción. Nada de scripts/, supabase/, docs ni variables.
// ============================================================================
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const outDir = fileURLToPath(new URL('../public/', import.meta.url));

const entries = [
  'index.html',
  'noticias.html',
  'recursos.html',
  'contacto.html',
  'sobre-nosotros.html',
  'politica-de-privacidad.html',
  'terminos-y-condiciones.html',
  'login.html',
  'register.html',
  'recovery.html',
  'reset-password.html',
  'gracias-pro.html',
  'styles.css',
  'main.js',
  'robots.txt',
  'sitemap.xml',
  'og-image.svg',
  'favicon.svg',
  'apple-touch-icon.svg',
  'supabase-config.js',
  'js',
  'admin'
];

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const entry of entries) {
  cpSync(root + entry, outDir + entry, { recursive: true });
}

console.log(`[build] Sitio estático copiado a public/ (${entries.length} entradas).`);
