// Validate bearer tokens with Auth, never with client-supplied identity or claims.
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function databaseConfig() {
  const env = process.env;
  let database;
  try { database = new URL(env.SUPABASE_URL); } catch { /* fail closed */ }
  const key = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || env.SUPABASE_SECRET_KEY;
  if (!database || database.protocol !== 'https:' || database.pathname !== '/' ||
      database.username || database.password || !key) return null;
  return { database, key };
}
async function verifyUser(req) {
  const header = req.headers?.authorization;
  if (typeof header !== 'string' || !/^Bearer [^\s]{1,8192}$/i.test(header)) return { status: 401 };
  const configured = databaseConfig();
  if (!configured) return { status: 503 };
  try {
    const response = await fetch(`${configured.database.origin}/auth/v1/user`, {
      method: 'GET', redirect: 'error',
      headers: { apikey: configured.key, Authorization: header }, signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return { status: [401, 403].includes(response.status) ? 401 : 503 };
    const user = await response.json();
    if (!uuidPattern.test(user?.id || '') || user.is_anonymous === true) return { status: 401 };
    return { user, header, configured };
  } catch { return { status: 503 }; }
}
module.exports = { databaseConfig, verifyUser };
