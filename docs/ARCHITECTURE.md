# Architecture

## Current (Phase 0)

```
Browser
   │  HTTPS
   ▼
Caddy 2 (:443) ──┬── n8n.powerhousemediapartners.com → docker :5678
                 ├── ranklens.localseospider.com    → :5000
                 └── designer.concreteshieldcoatingsinc.com → 127.0.0.1:3001
                                                              │
                                                              ▼
                                                       Fastify 5 (PM2)
                                                       │
                                                       ├── /api/health
                                                       └── /  → dist/client/*
```

- **Caddy** terminates TLS and reverse-proxies. Existing site blocks untouched.
- **Fastify** binds to localhost only — never directly exposed.
- **PM2** keeps Fastify alive, restarts on crash, autostarts on boot.

## Planned phases

| Phase | Adds | Notes |
|-------|------|-------|
| 0     | scaffold, Fastify, deploy pipeline, Caddy site | this commit |
| 1     | port existing 3D garage + manual polygon photo mode, all 28 flake catalog | code-split Three.js to keep initial JS small |
| 2     | better-sqlite3 storage, `designs` table, save / share-link endpoints | local disk uploads to `/opt/csc-floor-design/data/` |
| 3     | @mediapipe/tasks-vision ImageSegmenter for in-browser floor detection | replaces manual polygon trace |
| 4     | Mailgun-based "email me my design" + lead capture | reuse marketing site Mailgun creds |
| 5     | GHL integration (lead drop into CRM), salesperson preset library | deferred per owner direction |

## Data model (introduced in Phase 2)

```sql
CREATE TABLE designs (
  id            TEXT    PRIMARY KEY,
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  photo_path    TEXT,
  mask_data     TEXT,
  flake_id      TEXT,
  settings_json TEXT,
  preview_path  TEXT,
  emailed_to    TEXT
);
CREATE INDEX idx_designs_expires ON designs(expires_at);
```

Public access — no login. Share URLs use the random `id` as an unguessable
slug. Old rows auto-purge after `expires_at` via a daily cron.
