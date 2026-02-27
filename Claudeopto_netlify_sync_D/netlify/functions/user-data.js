// Netlify Function: secure per-user storage using Netlify Identity + Netlify Blobs
// Endpoints:
//   GET  /.netlify/functions/user-data  -> returns {schemaVersion, updatedAt, patients}
//   POST /.netlify/functions/user-data  -> saves body and returns saved object

import { getStore } from '@netlify/blobs';

function json(statusCode, body){
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(body)
  };
}

function getUserId(context){
  // Netlify Functions provide Identity user in clientContext
  const u = context?.clientContext?.user || context?.user || null;
  // Typical fields: sub, email
  const id = u?.sub || u?.id || u?.email || null;
  return id ? String(id) : null;
}

export default async (request, context) => {
  const userId = getUserId(context);
  if(!userId) return json(401, { error: 'Not authenticated' });

  const store = getStore('claudeopto');
  const key = `users/${userId}/data.json`;

  if(request.method === 'GET'){
    const raw = await store.get(key, { type: 'json' });
    if(!raw) return json(200, { schemaVersion: 1, updatedAt: 0, patients: [] });
    return json(200, raw);
  }

  if(request.method === 'POST'){
    let body;
    try{ body = await request.json(); }
    catch(_){ return json(400, { error: 'Invalid JSON' }); }

    // Minimal validation
    const schemaVersion = Number(body?.schemaVersion || 1);
    const updatedAt = Number(body?.updatedAt || Date.now());
    const patients = Array.isArray(body?.patients) ? body.patients : [];

    // Server-side stamp (helps debugging; UI still uses updatedAt for LWW)
    const saved = {
      schemaVersion: isFinite(schemaVersion) ? schemaVersion : 1,
      updatedAt: isFinite(updatedAt) ? updatedAt : Date.now(),
      serverUpdatedAt: Date.now(),
      patients
    };

    await store.set(key, saved);
    return json(200, saved);
  }

  return json(405, { error: 'Method not allowed' });
};
