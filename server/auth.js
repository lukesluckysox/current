// Username/password auth backed by Postgres.
//
// Required env (server-only):
//   DATABASE_URL      Postgres URL. Required in production for login. In
//                     production a missing DATABASE_URL surfaces an
//                     `auth_unavailable` state to the client rather than
//                     silently rendering the app unauthenticated.
//
// Recommended:
//   SESSION_SECRET    Secret used to sign session cookies. In production this
//                     SHOULD be set; otherwise an ephemeral random secret is
//                     used and sessions do not survive restarts.
//
// Registration:
//   By default registration is OPEN — multiple users can sign up. To close
//   registration on a deployed instance, set:
//     CURRENT_OPEN_REGISTRATION=false
//
// Optional one-time admin seed:
//   CURRENT_ADMIN_USERNAME / CURRENT_ADMIN_PASSWORD
//                     If both are set and no users exist, this user is seeded
//                     on startup. Does not change the open-registration
//                     default; it just guarantees one known account exists.
//
// Local dev escape hatch (NEVER honored in production):
//   CURRENT_AUTH_DISABLED=true
//                     With NODE_ENV != 'production', skip the login gate
//                     entirely. Useful when running `npm run web` against a
//                     bare server with no Postgres. Ignored in production.

const crypto = require('crypto');
const { Pool } = require('pg');

const SESSION_COOKIE = 'current_session';
const SESSION_TTL_DAYS = 30;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT_BYTES = 16;

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;
const MIN_PASSWORD_LEN = 6;
const MAX_PASSWORD_LEN = 200;

let pool = null;
let dbReady = false;
let dbInitPromise = null;

function isProd() {
  return process.env.NODE_ENV === 'production';
}

// Registration is open by default. Only the explicit string "false" closes it.
function isRegistrationOpen() {
  return process.env.CURRENT_OPEN_REGISTRATION !== 'false';
}

// Local-dev escape hatch only. Production always requires auth.
function isAuthDisabled() {
  if (isProd()) return false;
  return process.env.CURRENT_AUTH_DISABLED === 'true';
}

function sessionSecret() {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (isProd()) {
    console.warn('[auth] SESSION_SECRET is missing or too short in production. Using an ephemeral random secret; sessions will not survive restarts.');
  } else {
    console.warn('[auth] SESSION_SECRET not set — using a development fallback.');
  }
  return crypto.randomBytes(32).toString('hex');
}
const SECRET = sessionSecret();

function getPool() {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  // Railway internal Postgres URLs don't need TLS; external ones do. Accept
  // both by enabling TLS without strict cert verification when the URL looks
  // external.
  const isExternal = /\.proxy\.rlwy\.net|\.railway\.app/.test(url);
  pool = new Pool({
    connectionString: url,
    ssl: isExternal ? { rejectUnauthorized: false } : undefined,
    max: 5,
    idleTimeoutMillis: 30_000,
  });
  pool.on('error', (err) => {
    console.warn('[auth] pg pool error:', err?.message || err);
  });
  return pool;
}

async function initDb() {
  if (dbReady) return true;
  if (dbInitPromise) return dbInitPromise;
  const p = getPool();
  if (!p) return false;
  dbInitPromise = (async () => {
    await p.query(`
      CREATE TABLE IF NOT EXISTS users (
        id           SERIAL PRIMARY KEY,
        username     TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await p.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (LOWER(username))`);
    await maybeSeedAdmin();
    dbReady = true;
    return true;
  })().catch((err) => {
    console.warn('[auth] initDb failed:', err?.message || err);
    dbInitPromise = null;
    return false;
  });
  return dbInitPromise;
}

async function maybeSeedAdmin() {
  const u = process.env.CURRENT_ADMIN_USERNAME;
  const pw = process.env.CURRENT_ADMIN_PASSWORD;
  if (!u || !pw) return;
  if (!USERNAME_RE.test(u)) {
    console.warn('[auth] CURRENT_ADMIN_USERNAME is invalid; skipping seed.');
    return;
  }
  if (pw.length < MIN_PASSWORD_LEN) {
    console.warn('[auth] CURRENT_ADMIN_PASSWORD is too short; skipping seed.');
    return;
  }
  const p = getPool();
  const exists = await p.query('SELECT 1 FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1', [u]);
  if (exists.rowCount > 0) return;
  const hash = await hashPassword(pw);
  try {
    await p.query('INSERT INTO users (username, password_hash) VALUES ($1, $2)', [u, hash]);
    console.log(`[auth] seeded admin user "${u}".`);
  } catch (err) {
    console.warn('[auth] admin seed failed:', err?.message || err);
  }
}

// ─── Password hashing (Node scrypt — no native deps) ─────────────────────────

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(SCRYPT_SALT_BYTES);
    crypto.scrypt(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }, (err, derived) => {
      if (err) return reject(err);
      resolve(`scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${derived.toString('hex')}`);
    });
  });
}

function verifyPassword(password, stored) {
  return new Promise((resolve) => {
    if (typeof stored !== 'string') return resolve(false);
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return resolve(false);
    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    const salt = Buffer.from(parts[4], 'hex');
    const expected = Buffer.from(parts[5], 'hex');
    if (!salt.length || !expected.length) return resolve(false);
    crypto.scrypt(password, salt, expected.length, { N, r, p }, (err, derived) => {
      if (err) return resolve(false);
      try {
        resolve(crypto.timingSafeEqual(derived, expected));
      } catch {
        resolve(false);
      }
    });
  });
}

// ─── Sessions (signed HMAC cookie — stateless, no session table) ─────────────

function signSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifySession(token) {
  if (typeof token !== 'string' || !token) return null;
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;
  if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
  if (typeof payload.uid !== 'number' || typeof payload.name !== 'string') return null;
  return payload;
}

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  const out = {};
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function setSessionCookie(res, token) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (isProd()) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res) {
  const parts = [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (isProd()) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function hasAnyUser() {
  const p = getPool();
  if (!p) return false;
  const r = await p.query('SELECT 1 FROM users LIMIT 1');
  return r.rowCount > 0;
}

async function findUserByUsername(username) {
  const p = getPool();
  if (!p) return null;
  const r = await p.query(
    'SELECT id, username, password_hash FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1',
    [username],
  );
  return r.rows[0] || null;
}

function isDbConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

// True when this process actually requires the user to log in. Production is
// always required. In dev, required unless CURRENT_AUTH_DISABLED=true.
function isAuthRequired() {
  if (isProd()) return true;
  return !isAuthDisabled();
}

// ─── Express middleware + routes ─────────────────────────────────────────────

function authMiddleware(req, _res, next) {
  const cookies = parseCookies(req);
  const session = verifySession(cookies[SESSION_COOKIE]);
  req.user = session ? { id: session.uid, username: session.name } : null;
  next();
}

function requireAuth(req, res, next) {
  if (!isAuthRequired()) return next();
  if (!isDbConfigured()) return res.status(503).json({ error: 'auth_unavailable' });
  if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
  next();
}

function mountAuthRoutes(app) {
  app.get('/api/auth/status', async (_req, res) => {
    // mode is what the client uses to decide whether to gate the app.
    //   'disabled' -> no login gate (dev only)
    //   'required' -> login gate. Combined with `configured` to know whether
    //                 the DB is reachable; if not, the client shows an
    //                 "auth unavailable" message rather than the app.
    if (!isAuthRequired()) {
      return res.json({
        mode: 'disabled',
        configured: false,
        hasUser: false,
        openRegistration: false,
      });
    }
    if (!isDbConfigured()) {
      return res.status(503).json({
        mode: 'required',
        configured: false,
        hasUser: false,
        openRegistration: false,
        error: 'auth_unavailable',
      });
    }
    const ok = await initDb();
    if (!ok) {
      return res.status(503).json({
        mode: 'required',
        configured: false,
        hasUser: false,
        openRegistration: false,
        error: 'auth_unavailable',
      });
    }
    const has = await hasAnyUser();
    res.json({
      mode: 'required',
      configured: true,
      hasUser: has,
      openRegistration: isRegistrationOpen(),
    });
  });

  app.get('/api/auth/me', async (req, res) => {
    if (!isAuthRequired()) return res.status(404).json({ error: 'auth_disabled' });
    if (!isDbConfigured()) return res.status(503).json({ error: 'auth_unavailable' });
    if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
    res.json({ user: { id: req.user.id, username: req.user.username } });
  });

  app.post('/api/auth/register', async (req, res) => {
    if (!isAuthRequired()) return res.status(404).json({ error: 'auth_disabled' });
    if (!isDbConfigured()) return res.status(503).json({ error: 'auth_unavailable' });
    const ok = await initDb();
    if (!ok) return res.status(503).json({ error: 'auth_unavailable' });

    if (!isRegistrationOpen()) {
      return res.status(403).json({ error: 'registration_closed' });
    }

    const body = req.body || {};
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!USERNAME_RE.test(username)) {
      return res.status(400).json({ error: 'invalid_username', message: '3–32 chars, letters, numbers, _ . -' });
    }
    if (password.length < MIN_PASSWORD_LEN || password.length > MAX_PASSWORD_LEN) {
      return res.status(400).json({ error: 'invalid_password', message: `password must be ${MIN_PASSWORD_LEN}–${MAX_PASSWORD_LEN} chars` });
    }

    const exists = await findUserByUsername(username);
    if (exists) return res.status(409).json({ error: 'username_taken' });

    let hash;
    try {
      hash = await hashPassword(password);
    } catch (err) {
      console.warn('[auth] hash error:', err?.message || err);
      return res.status(500).json({ error: 'server_error' });
    }
    let row;
    try {
      const r = await getPool().query(
        'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
        [username, hash],
      );
      row = r.rows[0];
    } catch (err) {
      if (err && err.code === '23505') return res.status(409).json({ error: 'username_taken' });
      console.warn('[auth] register insert error:', err?.message || err);
      return res.status(500).json({ error: 'server_error' });
    }
    const token = signSession({ uid: row.id, name: row.username, exp: Date.now() + SESSION_TTL_MS });
    setSessionCookie(res, token);
    res.json({ user: { id: row.id, username: row.username } });
  });

  app.post('/api/auth/login', async (req, res) => {
    if (!isAuthRequired()) return res.status(404).json({ error: 'auth_disabled' });
    if (!isDbConfigured()) return res.status(503).json({ error: 'auth_unavailable' });
    const ok = await initDb();
    if (!ok) return res.status(503).json({ error: 'auth_unavailable' });
    const body = req.body || {};
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!username || !password) return res.status(400).json({ error: 'invalid_credentials' });

    const user = await findUserByUsername(username);
    const valid = user
      ? await verifyPassword(password, user.password_hash)
      : await verifyPassword(password, 'scrypt$16384$8$1$00$00');
    if (!user || !valid) return res.status(401).json({ error: 'invalid_credentials' });

    const token = signSession({ uid: user.id, name: user.username, exp: Date.now() + SESSION_TTL_MS });
    setSessionCookie(res, token);
    res.json({ user: { id: user.id, username: user.username } });
  });

  app.post('/api/auth/logout', (_req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });
}

module.exports = {
  initDb,
  isDbConfigured,
  isAuthRequired,
  authMiddleware,
  requireAuth,
  mountAuthRoutes,
};
