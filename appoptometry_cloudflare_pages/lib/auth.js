// Login próprio do app (sem Cloudflare Access, sem cartão de crédito).
//
// - Senha guardada com PBKDF2-SHA256 (100.000 iterações, sal aleatório por usuário).
// - Sessão em cookie HttpOnly + Secure + SameSite=Strict, assinado com HMAC-SHA256 (AUTH_SECRET), 8 horas.
// - Bloqueio progressivo após senhas erradas: 5 → 15 min, 10 → 1 h, 15+ → 6 h.
//
// Variável de ambiente (Pages → Settings → Variables and Secrets, tipo Secret):
//   AUTH_SECRET  texto aleatório longo (32+ caracteres). Também é a "chave de instalação"
//                pedida uma única vez, para criar a primeira conta.
// Binding D1: DB (tabelas users e login_attempts, ver schema.sql)

export const COOKIE = 'olhar_sess';
const SESSION_SECONDS = 8 * 3600;
const PBKDF2_ITER = 100000;               // máximo aceito pelo WebCrypto do Cloudflare
const enc = new TextEncoder();

export const json = (obj, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders },
  });

export function getCookie(request, name) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

const toB64u = (buf) => {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ''; for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64u = (s) => {
  s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
  const bin = atob(s); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

// Comparação em tempo constante
export function safeEqual(a, b) {
  const x = enc.encode(String(a)), y = enc.encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

export function secretOk(env) {
  return typeof env.AUTH_SECRET === 'string' && env.AUTH_SECRET.length >= 32;
}

// ----------------------------------------------------------------- senhas
export async function hashPassword(password, saltB64u) {
  const salt = saltB64u ? fromB64u(saltB64u) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITER }, key, 256);
  return { hash: toB64u(bits), salt: toB64u(salt), iterations: PBKDF2_ITER };
}

// ----------------------------------------------------------------- sessão
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toB64u(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

export async function sessionCookie(env, email) {
  const payload = toB64u(enc.encode(JSON.stringify({ e: email, x: Math.floor(Date.now() / 1000) + SESSION_SECONDS })));
  const sig = await hmac(env.AUTH_SECRET, payload);
  return `${COOKIE}=${payload}.${sig}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;
}
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

export async function readSession(request, env) {
  if (!secretOk(env)) return null;
  const raw = getCookie(request, COOKIE);
  if (!raw || !raw.includes('.')) return null;
  const [payload, sig] = raw.split('.');
  if (!safeEqual(sig, await hmac(env.AUTH_SECRET, payload))) return null;
  let data;
  try { data = JSON.parse(new TextDecoder().decode(fromB64u(payload))); } catch { return null; }
  if (!data || typeof data.e !== 'string' || !(data.x > Math.floor(Date.now() / 1000))) return null;
  // a conta precisa continuar existindo
  const u = await env.DB.prepare('SELECT email FROM users WHERE email = ?').bind(data.e).first();
  return u ? { email: data.e } : null;
}

// Usado pelas rotas protegidas: { userId, email } ou { error: Response }
export async function authenticate(request, env) {
  if (!secretOk(env)) return { error: json({ error: 'Servidor sem AUTH_SECRET configurado (mínimo 32 caracteres).' }, 500) };
  const s = await readSession(request, env);
  if (!s) return { error: json({ error: 'Não autenticado' }, 401) };
  return { userId: s.email, email: s.email };
}

// ------------------------------------------------- bloqueio por tentativas
export async function lockState(env, key) {
  const r = await env.DB.prepare('SELECT fails, locked_until FROM login_attempts WHERE key = ?').bind(key).first();
  return r || { fails: 0, locked_until: 0 };
}
export async function registerFail(env, key) {
  const cur = await lockState(env, key);
  const fails = (cur.fails || 0) + 1;
  const min = fails >= 15 ? 360 : fails >= 10 ? 60 : fails >= 5 ? 15 : 0;
  const until = min ? Date.now() + min * 60000 : 0;
  await env.DB.prepare(
    `INSERT INTO login_attempts (key, fails, locked_until) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET fails = excluded.fails, locked_until = excluded.locked_until`,
  ).bind(key, fails, until).run();
  return { fails, lockedMinutes: min };
}
export async function clearFails(env, key) {
  await env.DB.prepare('DELETE FROM login_attempts WHERE key = ?').bind(key).run();
}
