// /api/auth/status | /api/auth/setup | /api/auth/login | /api/auth/logout
import {
  json, secretOk, safeEqual, hashPassword, sessionCookie, clearCookie, readSession,
  lockState, registerFail, clearFails,
} from '../../../lib/auth.js';

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const MIN_PASS = 10;

async function body(request) {
  try { return await request.json(); } catch { return null; }
}

export async function onRequestGet({ request, env, params }) {
  if (params.action !== 'status') return json({ error: 'Não encontrado' }, 404);
  if (!secretOk(env)) return json({ configured: false, error: 'AUTH_SECRET ausente ou curto (mínimo 32 caracteres).' }, 500);
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first();
  const s = await readSession(request, env);
  return json({ configured: true, setupNeeded: !n || n.n === 0, user: s ? s.email : null });
}

export async function onRequestPost({ request, env, params }) {
  if (!secretOk(env)) return json({ error: 'AUTH_SECRET ausente ou curto (mínimo 32 caracteres).' }, 500);
  const action = params.action;

  if (action === 'logout') return json({ ok: true }, 200, { 'Set-Cookie': clearCookie() });

  const b = await body(request);
  if (!b) return json({ error: 'Dados inválidos.' }, 400);
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');

  if (action === 'setup') {
    // Só funciona enquanto não existir nenhuma conta, e exige a chave de instalação (= AUTH_SECRET).
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first();
    if (n && n.n > 0) return json({ error: 'A conta já foi criada. Use a tela de entrar.' }, 409);
    const lk = await lockState(env, 'setup');
    if (lk.locked_until > Date.now()) return json({ error: 'Muitas tentativas. Aguarde alguns minutos.' }, 429);
    if (!safeEqual(String(b.setupKey || ''), env.AUTH_SECRET)) {
      await registerFail(env, 'setup');
      return json({ error: 'Chave de instalação incorreta.' }, 403);
    }
    if (!EMAIL_RE.test(email)) return json({ error: 'E-mail inválido.' }, 400);
    if (password.length < MIN_PASS) return json({ error: `A senha precisa ter pelo menos ${MIN_PASS} caracteres.` }, 400);
    const h = await hashPassword(password);
    await env.DB.prepare('INSERT INTO users (email, pass_hash, salt, iterations, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(email, h.hash, h.salt, h.iterations, Date.now()).run();
    await clearFails(env, 'setup');
    return json({ ok: true, user: email }, 200, { 'Set-Cookie': await sessionCookie(env, email) });
  }

  if (action === 'login') {
    if (!email || !password) return json({ error: 'Informe e-mail e senha.' }, 400);
    const key = 'login:' + email;
    const lk = await lockState(env, key);
    if (lk.locked_until > Date.now()) {
      const min = Math.ceil((lk.locked_until - Date.now()) / 60000);
      return json({ error: `Acesso bloqueado por tentativas erradas. Tente de novo em ${min} min.` }, 429);
    }
    const u = await env.DB.prepare('SELECT pass_hash, salt FROM users WHERE email = ?').bind(email).first();
    // Calcula o hash mesmo se o e-mail não existir, para não revelar quais e-mails têm conta.
    const h = await hashPassword(password, u ? u.salt : 'AAAAAAAAAAAAAAAAAAAAAA');
    if (!u || !safeEqual(h.hash, u.pass_hash)) {
      const f = await registerFail(env, key);
      return json({ error: 'E-mail ou senha incorretos.' + (f.lockedMinutes ? ` Acesso bloqueado por ${f.lockedMinutes} min.` : '') }, 401);
    }
    await clearFails(env, key);
    return json({ ok: true, user: email }, 200, { 'Set-Cookie': await sessionCookie(env, email) });
  }

  return json({ error: 'Não encontrado' }, 404);
}
