// ============================================================================
// Genera supabase-config.js a partir de variables de entorno.
//
// Variables requeridas (configurar en Vercel → Settings → Environment Variables
// y/o en un archivo .env local):
//   SUPABASE_URL             → Project URL (ej: https://xxxx.supabase.co)
//   SUPABASE_PUBLISHABLE_KEY → publishable / anon public key
//
// Se conserva SUPABASE_ANON_KEY como alias de compatibilidad: si
// SUPABASE_PUBLISHABLE_KEY no está definida, se usa la anon key.
//
// Estos valores son PÚBLICOS por diseño (viven en el navegador). Las claves
// privadas de api/contact.js nunca se incluyen en la configuración generada.
//
// Si faltan, se genera un archivo con placeholders y se advierte: el sitio
// mostrará un mensaje de "configuración pendiente" en lugar de romperse.
// ============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Carga ligera de .env SOLO para desarrollo local (sin dependencias). En Vercel
// las variables las inyecta la plataforma y no hay archivo .env.
function loadLocalEnv() {
  const envFile = fileURLToPath(new URL('../.env', import.meta.url));
  try {
    const content = readFileSync(envFile, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const key = match[1];
      if (process.env[key] === undefined) {
        process.env[key] = match[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    // Sin .env local: es válido (p. ej. en Vercel).
  }
}

loadLocalEnv();

const url = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const publishableKey = (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();

const output = `// Archivo GENERADO automáticamente por scripts/generate-config.mjs.
// NO editar a mano: se regenera en cada build. Los valores provienen de las
// variables de entorno SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY de Vercel.
window.MIPORTAL_SUPABASE = Object.freeze({
  url: ${JSON.stringify(url || 'https://REEMPLAZAR.supabase.co')},
  publishableKey: ${JSON.stringify(publishableKey || 'REEMPLAZAR_CON_PUBLISHABLE_KEY')}
});
`;

writeFileSync(new URL('../supabase-config.js', import.meta.url), output);

if (!url || !publishableKey) {
  console.warn(
    '[config] Atención: faltan SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY. ' +
    'Se escribió supabase-config.js con placeholders. El sitio funcionará con estado "configuración pendiente".'
  );
} else {
  console.log('[config] supabase-config.js generado correctamente.');
}
