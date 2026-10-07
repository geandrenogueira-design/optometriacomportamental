// /api/anamnese/submit — rota pública da API (sem login): só recebe o envio dos pais.
// Os pais só conseguem: (1) verificar se um código é válido e (2) enviar as
// respostas uma única vez. Não conseguem ler nada que já esteja guardado.
import { json } from '../../../lib/auth.js';

const MAX_BODY = 300 * 1024;
const MAX_STR = 8000;
const CODE_RE = /^[A-Za-z0-9_-]{16,64}$/;

async function findInvite(env, code) {
  if (!code || !CODE_RE.test(code)) return null;
  return env.DB.prepare('SELECT code, label, expires_at, status FROM anamnese WHERE code = ?').bind(code).first();
}

function inviteState(row) {
  if (!row) return 'invalido';
  if (row.status !== 'aguardando') return 'respondido';
  if (Date.now() > row.expires_at) return 'expirado';
  return 'aberto';
}

// Aceita só objetos simples, com strings, números, booleanos e objetos aninhados rasos.
function clean(value, depth = 0) {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') return value.slice(0, MAX_STR);
  if (depth >= 3 || typeof value !== 'object' || Array.isArray(value) && value.length > 100) return null;
  if (Array.isArray(value)) return value.map((v) => clean(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value).slice(0, 400)) {
    if (!/^[A-Za-z0-9_]{1,60}$/.test(k)) continue;
    out[k] = clean(v, depth + 1);
  }
  return out;
}

export async function onRequestGet({ request, env }) {
  const code = new URL(request.url).searchParams.get('c');
  const row = await findInvite(env, code);
  const state = inviteState(row);
  return json({ state, label: state === 'aberto' ? row.label : null });
}

export async function onRequestPost({ request, env }) {
  const text = await request.text();
  if (!text || text.length > MAX_BODY) return json({ error: 'Envio vazio ou grande demais.' }, 413);
  let body;
  try { body = JSON.parse(text); } catch { return json({ error: 'Dados inválidos.' }, 400); }

  const row = await findInvite(env, body && body.c);
  const state = inviteState(row);
  if (state !== 'aberto') {
    const msg = { invalido: 'Link inválido.', respondido: 'Este questionário já foi enviado.', expirado: 'Este link expirou. Peça um novo ao consultório.' }[state];
    return json({ error: msg, state }, state === 'invalido' ? 404 : 409);
  }

  const answers = clean(body.answers);
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return json({ error: 'Respostas ausentes.' }, 400);
  const missing = ['respondente', 'crianca_nome', 'crianca_nasc', 'motivo'].filter((k) => !String(answers[k] || '').trim());
  if (missing.length) return json({ error: 'Preencha os campos obrigatórios.', missing }, 400);
  if (answers.consentimento !== true) return json({ error: 'É preciso aceitar o termo de consentimento.' }, 400);

  const now = Date.now();
  const payload = {
    schema: String(body.schema || 'anamnese-olhar'),
    schemaVersion: Number(body.schemaVersion) || 1,
    submittedAt: new Date(now).toISOString(),
    answers,
  };
  // UPDATE condicional: garante envio único mesmo com dois envios simultâneos.
  const res = await env.DB.prepare(
    `UPDATE anamnese SET data = ?, submitted_at = ?, consent_at = ?, status = 'respondida'
     WHERE code = ? AND status = 'aguardando' AND expires_at >= ?`,
  ).bind(JSON.stringify(payload), now, now, row.code, now).run();
  if (!res.meta || res.meta.changes !== 1) return json({ error: 'Este questionário já foi enviado.' }, 409);
  return json({ ok: true });
}
