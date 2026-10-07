// Utilitários compartilhados pelas Pages Functions:
// resposta JSON e autenticação pelo Cloudflare Access (verificação do JWT).
//
// Variáveis de ambiente: ACCESS_TEAM_DOMAIN (ex.: suaequipe.cloudflareaccess.com) e ACCESS_AUD.

// ---------------------------------------------------------------- utilidades
export const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const b64urlToJson = (s) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

export function getCookie(request, name) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

// ------------------------------------------------------- verificação do JWT
let certsCache = { keys: null, at: 0 };

async function getAccessKeys(teamDomain, force = false) {
  if (!force && certsCache.keys && Date.now() - certsCache.at < 3600_000) return certsCache.keys;
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Falha ao obter certificados do Access (${res.status})`);
  const body = await res.json();
  certsCache = { keys: Array.isArray(body.keys) ? body.keys : [], at: Date.now() };
  return certsCache.keys;
}

async function verifyAccessJwt(token, env) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  let header, payload;
  try {
    header = b64urlToJson(parts[0]);
    payload = b64urlToJson(parts[1]);
  } catch {
    return null;
  }
  if (header.alg !== 'RS256' || !header.kid) return null;

  let keys = await getAccessKeys(env.ACCESS_TEAM_DOMAIN);
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    // chave rotacionada: recarrega uma vez
    keys = await getAccessKeys(env.ACCESS_TEAM_DOMAIN, true);
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) return null;

  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlToBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!valid) return null;

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp < now) return null;
  if (typeof payload.nbf === 'number' && payload.nbf > now + 60) return null;

  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(env.ACCESS_AUD)) return null;
  if (payload.iss && payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return null;

  return payload;
}

export async function authenticate(request, env) {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    return { error: json({ error: 'Servidor sem configuração do Access (ACCESS_TEAM_DOMAIN / ACCESS_AUD).' }, 500) };
  }
  const token = request.headers.get('Cf-Access-Jwt-Assertion') || getCookie(request, 'CF_Authorization');
  if (!token) return { error: json({ error: 'Não autenticado' }, 401) };

  const payload = await verifyAccessJwt(token, env);
  if (!payload) return { error: json({ error: 'Token do Access inválido ou expirado' }, 401) };

  const userId = String(payload.email || payload.sub || '').trim().toLowerCase();
  if (!userId) return { error: json({ error: 'Token sem identificação de usuário' }, 401) };
  return { userId, email: payload.email || null };
}

