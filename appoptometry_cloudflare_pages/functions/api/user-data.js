// Cloudflare Pages Function — GET/POST /api/user-data
//
// Autenticação: Cloudflare Access. O Access protege o site inteiro e envia,
// a cada requisição, um JWT assinado (header Cf-Access-Jwt-Assertion ou
// cookie CF_Authorization). Aqui o token é VERIFICADO (assinatura RS256,
// validade, audience e emissor) antes de qualquer leitura ou escrita.
// Nunca confiamos só no header de e-mail, que pode ser forjado fora do Access.
//
// Armazenamento: D1 (binding DB). Uma linha por paciente, para não esbarrar
// no limite de tamanho de linha e gravar só o que mudou.
//
// Variáveis de ambiente (Pages → Settings → Variables):
//   ACCESS_TEAM_DOMAIN  ex.: suaequipe.cloudflareaccess.com  (sem https://)
//   ACCESS_AUD          "Application Audience (AUD) Tag" da aplicação no Access
// Binding D1 (Pages → Settings → Bindings):  DB

import { json, authenticate } from '../../lib/access.js';

const HISTORY_DAYS = 30;           // histórico diário de cada paciente
const MAX_BODY_BYTES = 20 * 1024 * 1024;

// ------------------------------------------------------------------- handlers
async function readBundle(env, userId) {
  const meta = await env.DB
    .prepare('SELECT updated_at, schema_version FROM user_meta WHERE user_id = ?')
    .bind(userId)
    .first();
  const rows = await env.DB
    .prepare('SELECT data FROM patients WHERE user_id = ? ORDER BY pos ASC')
    .bind(userId)
    .all();
  const patients = [];
  for (const r of rows.results || []) {
    try { patients.push(JSON.parse(r.data)); } catch { /* linha corrompida: ignora */ }
  }
  return {
    schemaVersion: meta ? meta.schema_version : 1,
    updatedAt: meta ? meta.updated_at : 0,
    patients,
  };
}

export async function onRequestGet({ request, env }) {
  const auth = await authenticate(request, env);
  if (auth.error) return auth.error;
  const bundle = await readBundle(env, auth.userId);
  return json({ ...bundle, user: auth.email });
}

export async function onRequestPost({ request, env }) {
  const auth = await authenticate(request, env);
  if (auth.error) return auth.error;

  const text = await request.text();
  if (!text) return json({ error: 'Corpo vazio' }, 400);
  if (text.length > MAX_BODY_BYTES) return json({ error: 'Corpo grande demais' }, 413);

  let body;
  try { body = JSON.parse(text); } catch { return json({ error: 'JSON inválido' }, 400); }
  if (!Array.isArray(body.patients)) return json({ error: 'Campo "patients" ausente' }, 400);

  const incomingUpdatedAt = Number(body.updatedAt) || 0;
  const schemaVersion = Number(body.schemaVersion) || 1;
  const force = new URL(request.url).searchParams.get('force') === '1';

  // Proteção contra sobrescrita: um aparelho com dados mais antigos (ou vazio)
  // não apaga a nuvem. O cliente recebe 409 e baixa a versão da nuvem.
  const meta = await env.DB
    .prepare('SELECT updated_at FROM user_meta WHERE user_id = ?')
    .bind(auth.userId)
    .first();
  const storedUpdatedAt = meta ? meta.updated_at : 0;
  if (!force && incomingUpdatedAt < storedUpdatedAt) {
    return json({ error: 'conflict', remoteUpdatedAt: storedUpdatedAt }, 409);
  }

  // Grava só o que mudou.
  const existing = await env.DB
    .prepare('SELECT id, pos, data FROM patients WHERE user_id = ?')
    .bind(auth.userId)
    .all();
  const current = new Map((existing.results || []).map((r) => [r.id, r]));

  const today = new Date().toISOString().slice(0, 10);
  const now = Date.now();
  const stmts = [];
  const seen = new Set();

  body.patients.forEach((p, pos) => {
    if (!p || typeof p !== 'object' || !p.id) return;
    const id = String(p.id);
    if (seen.has(id)) return;
    seen.add(id);
    const data = JSON.stringify(p);
    const old = current.get(id);
    if (old && old.data === data && old.pos === pos) return;

    stmts.push(
      env.DB.prepare(
        `INSERT INTO patients (user_id, id, pos, data, saved_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id, id) DO UPDATE SET pos = excluded.pos, data = excluded.data, saved_at = excluded.saved_at`,
      ).bind(auth.userId, id, pos, data, now),
    );
    if (!old || old.data !== data) {
      stmts.push(
        env.DB.prepare(
          `INSERT INTO patients_history (user_id, id, day, data) VALUES (?, ?, ?, ?)
           ON CONFLICT(user_id, id, day) DO UPDATE SET data = excluded.data`,
        ).bind(auth.userId, id, today, data),
      );
    }
  });

  for (const id of current.keys()) {
    if (!seen.has(id)) {
      stmts.push(env.DB.prepare('DELETE FROM patients WHERE user_id = ? AND id = ?').bind(auth.userId, id));
    }
  }

  stmts.push(
    env.DB.prepare(
      `INSERT INTO user_meta (user_id, updated_at, schema_version) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET updated_at = excluded.updated_at, schema_version = excluded.schema_version`,
    ).bind(auth.userId, incomingUpdatedAt || now, schemaVersion),
  );

  const cutoff = new Date(now - HISTORY_DAYS * 86400_000).toISOString().slice(0, 10);
  stmts.push(
    env.DB.prepare('DELETE FROM patients_history WHERE user_id = ? AND day < ?').bind(auth.userId, cutoff),
  );

  await env.DB.batch(stmts);
  return json({ ok: true, updatedAt: incomingUpdatedAt || now });
}
