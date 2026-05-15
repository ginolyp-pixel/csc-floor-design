# CSC Floor Designer

Interactive concrete floor coating visualizer for Concrete Shield Coatings Inc.
Deployed at **https://designer.concreteshieldcoatingsinc.com**.

## Status

**Phase 0** — scaffold + deploy pipeline. Serves a "booting up" placeholder.
The interactive 3D + photo tools land in subsequent phases.

## Stack

- **Server**: Fastify 5 (Node 20) on `127.0.0.1:3001`
- **Client**: Vanilla TypeScript + Vite 6 (Three.js arrives in Phase 1)
- **Process manager**: PM2
- **Reverse proxy / TLS**: Caddy 2 (auto Let's Encrypt)
- **Storage**: better-sqlite3 (added in Phase 2)

## Local development

```bash
npm install
npm run dev:server   # Fastify on :3001
npm run dev:client   # Vite on :5173 with /api proxy
```

Visit `http://localhost:5173`.

## Production build

```bash
npm run build        # → dist/client
npm start            # serves dist/client + /api
```

## VPS deploy

See `docs/VPS-SETUP.md` for first-time setup and `docs/DEPLOY.md` for updates.
TL;DR for a redeploy:

```bash
ssh root@VPS_IP
cd /opt/csc-floor-design && ./scripts/deploy.sh
```

## Repository

`github.com/ginolyp-pixel/csc-floor-design` (default branch: `main`).
