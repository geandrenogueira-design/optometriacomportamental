export async function onRequest(context) {
  const { request, env } = context;

  if (!env.OPTO_KV) {
    return new Response(JSON.stringify({ error: "OPTO_KV binding not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const key = request.headers.get("X-Sync-Key");
  if (!key || key.length < 6) {
    return new Response(JSON.stringify({ error: "Missing X-Sync-Key (min 6 chars)" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const kvKey = `users/${key}/data.json`;

  if (request.method === "GET") {
    const raw = await env.OPTO_KV.get(kvKey);
    return new Response(
      raw || JSON.stringify({ patients: [], updatedAt: 0, schemaVersion: 1 }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  if (request.method === "POST") {
    const bodyText = await request.text();
    let parsed;
    try { parsed = JSON.parse(bodyText); }
    catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400, headers: { "Content-Type": "application/json" }
      });
    }

    const payload = {
      schemaVersion: parsed.schemaVersion ?? 1,
      updatedAt: parsed.updatedAt ?? Date.now(),
      patients: Array.isArray(parsed.patients) ? parsed.patients : [],
    };

    await env.OPTO_KV.put(kvKey, JSON.stringify(payload));
    return new Response(JSON.stringify({ ok: true, updatedAt: payload.updatedAt }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(null, { status: 405, headers: { Allow: "GET, POST" } });
}