# AppOptometry — Cloudflare Pages (static + sync)

## Estrutura
- `public/` -> seu app (index.html, ui.js, etc.)
- `functions/api/user-data.js` -> endpoint para sincronização via Cloudflare KV
  - GET  `/api/user-data`  (header `X-Sync-Key`)
  - POST `/api/user-data`  (header `X-Sync-Key` + JSON)

## Deploy no Cloudflare Pages
1. Crie um projeto no Cloudflare Pages e conecte ao GitHub.
2. Build output directory: `public`
3. Functions: o Pages detecta automaticamente a pasta `functions/`.

## Criar KV e bindar
No Cloudflare Dashboard:
- Workers & Pages -> KV -> Create namespace (ex.: `appoptometry-kv`)
- No projeto Pages -> Settings -> Functions -> KV namespace bindings:
  - Variable name: `OPTO_KV`
  - KV namespace: (o que você criou)

## Uso no app
- Defina uma **Chave de Sync** igual em todos os dispositivos.
- Clique **Baixar da nuvem** no primeiro uso em um aparelho novo.
- Clique **Enviar para a nuvem** depois de salvar/atualizar pacientes.

> Segurança: esta versão usa uma chave compartilhada (sem login). Para algo clínico com usuários e permissões, o ideal é adicionar autenticação (ex.: Supabase Auth) e usar D1/DB com regras.
