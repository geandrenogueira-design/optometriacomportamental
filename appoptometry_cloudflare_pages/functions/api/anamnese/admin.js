// /api/anamnese/admin — área do clínico (protegida pelo Cloudflare Access).
//   GET                 lista os links do usuário (sem as respostas)
//   GET  ?code=XXX      um link com as respostas
//   POST {action:'create', label, patientId?, days?}   gera um link novo
//   POST {action:'mark_imported', code, patientId?}    marca como importada no app
//   POST {action:'delete', code}                        apaga o link e as respostas
import { json, authenticate } from '../../../lib/access.js';

const DEFAULT_DAYS = 14;
const MAX_DAYS = 60;
const PURGE_UNANSWERED_AFTER_DAYS = 30;  // links nunca respondidos somem 30 dias após expirar

function newCode() {
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const pub = (r) => ({
  code: r.code, label: r.label, patientId: r.patient_id, status: r.status,
  createdAt: r.created_at, expiresAt: r.expires_at, submittedAt: r.submitted_at,
  consentAt: r.consent_at, importedAt: r.imported_at,
});

export async function onRequestGet({ request, env }) {
  const auth = await authenticate(request, env);
  if (auth.error) return auth.error;
  const code = new URL(request.url).searchParams.get('code');

  if (code) {
    const r = await env.DB.prepare('SELECT * FROM anamnese WHERE code = ? AND owner = ?').bind(code, auth.userId).first();
    if (!r) return json({ error: 'Não encontrado' }, 404);
    let data = null;
    try { data = r.data ? JSON.parse(r.data) : null; } catch { /* ignora */ }
    return json({ ...pub(r), data });
  }

  const purgeBefore = Date.now() - PURGE_UNANSWERED_AFTER_DAYS * 86400_000;
  await env.DB.prepare("DELETE FROM anamnese WHERE owner = ? AND status = 'aguardando' AND expires_at < ?")
    .bind(auth.userId, purgeBefore).run();
  const rows = await env.DB.prepare(
    'SELECT code, label, patient_id, status, created_at, expires_at, submitted_at, consent_at, imported_at FROM anamnese WHERE owner = ? ORDER BY created_at DESC LIMIT 200',
  ).bind(auth.userId).all();
  return json({ items: (rows.results || []).map(pub) });
}

export async function onRequestPost({ request, env }) {
  const auth = await authenticate(request, env);
  if (auth.error) return auth.error;
  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
  const action = body && body.action;

  if (action === 'create') {
    const label = String(body.label || '').trim().slice(0, 120);
    if (!label) return json({ error: 'Informe o nome da criança.' }, 400);
    const days = Math.min(MAX_DAYS, Math.max(1, Number(body.days) || DEFAULT_DAYS));
    const now = Date.now();
    const code = newCode();
    await env.DB.prepare(
      'INSERT INTO anamnese (code, owner, label, patient_id, created_at, expires_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).bind(code, auth.userId, label, body.patientId ? String(body.patientId).slice(0, 80) : null, now, now + days * 86400_000, 'aguardando').run();
    const origin = new URL(request.url).origin;
    return json({ code, url: `${origin}/anamnese/?c=${code}`, expiresAt: now + days * 86400_000 });
  }

  const code = String(body.code || '');
  if (!code) return json({ error: 'Código ausente' }, 400);

  if (action === 'mark_imported') {
    const r = await env.DB.prepare(
      "UPDATE anamnese SET status = 'importada', imported_at = ?, patient_id = COALESCE(?, patient_id) WHERE code = ? AND owner = ? AND status IN ('respondida','importada')",
    ).bind(Date.now(), body.patientId ? String(body.patientId).slice(0, 80) : null, code, auth.userId).run();
    return r.meta && r.meta.changes ? json({ ok: true }) : json({ error: 'Não encontrado ou ainda não respondido' }, 404);
  }

  if (action === 'delete') {
    const r = await env.DB.prepare('DELETE FROM anamnese WHERE code = ? AND owner = ?').bind(code, auth.userId).run();
    return r.meta && r.meta.changes ? json({ ok: true }) : json({ error: 'Não encontrado' }, 404);
  }

  return json({ error: 'Ação desconhecida' }, 400);
}
