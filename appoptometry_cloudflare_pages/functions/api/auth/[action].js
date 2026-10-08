// /api/auth/status | setup | login | logout | forgot | reset | reset-key
//
// Recuperação de senha:
//   forgot     envia por e-mail (Resend) um link de uso único, válido por 30 min
//   reset      troca a senha usando o código do link
//   reset-key  troca a senha usando a chave de instalação (AUTH_SECRET), sem e-mail
// Variáveis: RESEND_API_KEY (Secret) e, opcional, MAIL_FROM (padrão: Instituto Olhar <onboarding@resend.dev>)
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

const RESET_MINUTES = 30;
const enc = new TextEncoder();
async function sha256(text) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}
function randomToken() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  let s = ''; for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function sendResetEmail(env, to, link) {
  const from = env.MAIL_FROM || 'Instituto Olhar <onboarding@resend.dev>';
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#0a0a0a">
    <div style="border-bottom:2px solid #1e2d68;padding-bottom:10px;margin-bottom:16px">
      <div style="letter-spacing:.16em;font-weight:700;color:#1e2d68;font-size:14px">INSTITUTO OLHAR</div>
      <div style="color:#8a5f3a;font-size:12px">Optometria comportamental</div></div>
    <p>Recebemos um pedido para redefinir a senha do app de optometria comportamental.</p>
    <p style="margin:22px 0"><a href="${escHtml(link)}" style="background:#1e2d68;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;display:inline-block">Criar nova senha</a></p>
    <p style="font-size:13px;color:#4f5a70">O link vale por ${RESET_MINUTES} minutos e só pode ser usado uma vez. Se você não pediu a troca, ignore este e-mail: a senha atual continua valendo.</p>
    <p style="font-size:12px;color:#4f5a70;word-break:break-all">Se o botão não abrir, copie este endereço: ${escHtml(link)}</p></div>`;
  const text = `Instituto Olhar — redefinição de senha\n\nAbra o link para criar uma nova senha (vale ${RESET_MINUTES} minutos, uso único):\n${link}\n\nSe você não pediu a troca, ignore este e-mail.`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject: 'Redefinir senha — Instituto Olhar', html, text }),
  });
  return res.ok;
}

// Cria a tabela sozinho na primeira vez (dispensa rodar SQL no painel do D1).
async function ensureResetTable(env) {
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS password_resets (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires_at INTEGER NOT NULL)').run();
}

async function setPassword(env, email, password) {
  await ensureResetTable(env);
  const h = await hashPassword(password);
  await env.DB.prepare('UPDATE users SET pass_hash = ?, salt = ?, iterations = ? WHERE email = ?')
    .bind(h.hash, h.salt, h.iterations, email).run();
  await env.DB.prepare('DELETE FROM password_resets WHERE email = ?').bind(email).run();
  await clearFails(env, 'login:' + email);
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

  if (action === 'forgot') {
    if (!env.RESEND_API_KEY) return json({ error: 'A recuperação por e-mail ainda não foi configurada (falta RESEND_API_KEY). Use a chave de instalação.' }, 501);
    // Resposta igual exista ou não a conta, para não revelar quais e-mails têm acesso.
    const generic = json({ ok: true, message: 'Se este e-mail tiver acesso, enviamos um link para criar uma nova senha. Confira também a caixa de spam.' });
    if (!EMAIL_RE.test(email)) return generic;
    const key = 'reset:' + email;
    const lk = await lockState(env, key);
    if (lk.locked_until > Date.now()) return generic;
    const u = await env.DB.prepare('SELECT email FROM users WHERE email = ?').bind(email).first();
    if (!u) return generic;
    // no máximo 3 pedidos seguidos; depois disso, espera
    const f = await registerFail(env, key);
    if (f.fails >= 3) {
      await env.DB.prepare('UPDATE login_attempts SET locked_until = ? WHERE key = ?').bind(Date.now() + 60 * 60000, key).run();
    }
    const token = randomToken();
    await ensureResetTable(env);
    await env.DB.prepare('DELETE FROM password_resets WHERE email = ? OR expires_at < ?').bind(email, Date.now()).run();
    await env.DB.prepare('INSERT INTO password_resets (token_hash, email, expires_at) VALUES (?, ?, ?)')
      .bind(await sha256(token), email, Date.now() + RESET_MINUTES * 60000).run();
    const link = `${new URL(request.url).origin}/?reset=${token}`;
    const sent = await sendResetEmail(env, email, link);
    if (!sent) return json({ error: 'Não foi possível enviar o e-mail agora. Tente de novo ou use a chave de instalação.' }, 502);
    return generic;
  }

  if (action === 'reset') {
    const token = String(b.token || '');
    if (!/^[A-Za-z0-9_-]{30,64}$/.test(token)) return json({ error: 'Link inválido.' }, 400);
    if (password.length < MIN_PASS) return json({ error: `A senha precisa ter pelo menos ${MIN_PASS} caracteres.` }, 400);
    await ensureResetTable(env);
    const row = await env.DB.prepare('SELECT email, expires_at FROM password_resets WHERE token_hash = ?').bind(await sha256(token)).first();
    if (!row || row.expires_at < Date.now()) return json({ error: 'Este link expirou ou já foi usado. Peça um novo.' }, 410);
    await setPassword(env, row.email, password);
    await clearFails(env, 'reset:' + row.email);
    return json({ ok: true, user: row.email }, 200, { 'Set-Cookie': await sessionCookie(env, row.email) });
  }

  if (action === 'reset-key') {
    const lk = await lockState(env, 'resetkey');
    if (lk.locked_until > Date.now()) return json({ error: 'Muitas tentativas. Aguarde alguns minutos.' }, 429);
    if (!safeEqual(String(b.setupKey || ''), env.AUTH_SECRET)) {
      await registerFail(env, 'resetkey');
      return json({ error: 'Chave de instalação incorreta.' }, 403);
    }
    if (password.length < MIN_PASS) return json({ error: `A senha precisa ter pelo menos ${MIN_PASS} caracteres.` }, 400);
    const u = await env.DB.prepare('SELECT email FROM users WHERE email = ?').bind(email).first();
    if (!u) return json({ error: 'Não existe conta com este e-mail.' }, 404);
    await clearFails(env, 'resetkey');
    await setPassword(env, email, password);
    return json({ ok: true, user: email }, 200, { 'Set-Cookie': await sessionCookie(env, email) });
  }

  return json({ error: 'Não encontrado' }, 404);
}
