# Copernicus Proxy (Cloudflare Worker)

Dieses Worker-Backend ergänzt das GitHub-Pages-Frontend um eine serverseitige Risiko-API.

## 1) Deploy

```bash
cd copernicus-worker
npm create cloudflare@latest . -- --existing-script
npx wrangler login
npx wrangler deploy
```

Merke dir danach die Worker-URL, z. B.:

`https://flood-risk-copernicus-proxy.<subdomain>.workers.dev`

## 2) Frontend verbinden

In `index.html`:

```js
const RISK_API_BASE = 'https://REPLACE_WITH_WORKER_URL';
```

ersetzen durch deine Worker-URL.

## 3) Optional: Copernicus Credentials setzen

```bash
npx wrangler secret put COPERNICUS_CLIENT_ID
npx wrangler secret put COPERNICUS_CLIENT_SECRET
npx wrangler deploy
```

Ohne Secrets läuft automatisch ein Fallback ohne Copernicus-Boost.

## Hinweis

Aktuell ist der Copernicus-Teil in `src/index.js` als MVP-Platzhalter implementiert (`getCopernicusFeatures`).
Dort kannst du echte CDS/Sentinel-Abfragen ergänzen, ohne Frontend-Token offenzulegen.
