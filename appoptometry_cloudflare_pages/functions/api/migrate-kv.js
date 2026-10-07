// /api/migrate-kv — migração única dos dados da versão anterior (chave de sync no KV).
// Exige login no app. Só LÊ o KV antigo (binding OPTO_KV); não grava nada nele.
// Depois que os dados forem trazidos, o binding OPTO_KV pode ser removido do projeto.
import { json, authenticate } from '../../lib/auth.js';

export async function onRequestGet({ request, env }) {
  const auth = await authenticate(request, env);
  if (auth.error) return auth.error;
  if (!env.OPTO_KV) return json({ error: 'O KV da versão anterior (OPTO_KV) não está vinculado a este projeto.' }, 501);

  const key = String(new URL(request.url).searchParams.get('key') || '').trim();
  if (!key || key.length > 200) return json({ error: 'Informe a chave de sync da versão anterior.' }, 400);

  const raw = await env.OPTO_KV.get(`users/${key}/data.json`);
  if (!raw) return json({ error: 'Nenhum dado encontrado para essa chave.' }, 404);
  let data;
  try { data = JSON.parse(raw); } catch { return json({ error: 'Dados antigos ilegíveis.' }, 500); }
  return json({
    patients: Array.isArray(data.patients) ? data.patients : [],
    updatedAt: Number(data.updatedAt) || 0,
  });
}
