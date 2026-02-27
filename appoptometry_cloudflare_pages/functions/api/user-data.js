export async function onRequest(context) {
  const { request, env } = context;

  // --- Simple "shared key" auth (same key across devices) ---
  const url = new URL(request.url);
  const key = request.headers.get("X-Sync-Key") || url.searchParams.get("key") || "";
  const syncKey = String(key).trim();
  if (!syncKey) {
    return new Response(JSON.stringify({ error: "Missing X-Sync-Key" }), {
      status: 401,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  // KV binding name: OPTO_KV
  const kv = env.OPTO_KV;
  if (!kv) {
    return new Response(JSON.stringify({ error: "KV binding OPTO_KV not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  const storeKey = `users/${syncKey}/data.json`;

  try {
    if (request.method === "GET") {
      const raw = await kv.get(storeKey);
      if (!raw) return new Response(null, { status: 404 });
      return new Response(raw, {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    if (request.method === "POST") {
      const body = await request.text();
      if (!body) {
        return new Response(JSON.stringify({ error: "Empty body" }), {
          status: 400,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      }
      // basic JSON validation
      let parsed;
      try { parsed = JSON.parse(body); } catch {
        return new Response(JSON.stringify({ error: "Invalid JSON" }), {
          status: 400,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      }

      const payload = {
        schemaVersion: parsed.schemaVersion ?? 1,
        updatedAt: parsed.updatedAt ?? Date.now(),
        patients: Array.isArray(parsed.patients) ? parsed.patients : [],
      };

      await kv.put(storeKey, JSON.stringify(payload));
      return new Response(JSON.stringify({ ok: true, updatedAt: payload.updatedAt }), {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    return new Response(null, { status: 405, headers: { Allow: "GET, POST" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Function crashed", message: err?.message || String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
}
