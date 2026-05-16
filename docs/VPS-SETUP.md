# VPS Setup — First Time

Run these once. After this, redeploys are a single `./scripts/deploy.sh`.

## Prerequisites already in place on this VPS

- Ubuntu 24.04, root SSH
- Node 20.x (`v20.20.2`)
- Caddy 2.x on :80 and :443 (existing site blocks for `n8n.powerhousemediapartners.com` and `ranklens.localseospider.com`)
- Docker (used for n8n, not for this app)
- 2 GB swap at `/swapfile`
- PM2 v7.x (`npm install -g pm2`)

## 1. DNS

At Namecheap → `concreteshieldcoatingsinc.com` → Advanced DNS, add:

| Type     | Host       | Value             | TTL       |
|----------|------------|-------------------|-----------|
| A Record | `designer` | `162.254.37.181`  | Automatic |

Verify from any machine:

```bash
dig designer.concreteshieldcoatingsinc.com +short
# → 162.254.37.181
```

## 2. Clone the repository

```bash
mkdir -p /opt && cd /opt
git clone https://github.com/ginolyp-pixel/csc-floor-design.git
cd csc-floor-design
cp .env.example .env
```

## 3. Build and start

```bash
npm ci
npm run build
mkdir -p /var/log/csc-designer
mkdir -p /var/lib/csc-designer        # SQLite + uploaded photos + previews
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd -u root --hp /root
# Copy/paste the command pm2 prints, then run `pm2 save` once more.
```

> `/var/lib/csc-designer/` is the **persistent data root** — it holds
> `designer.sqlite`, uploaded customer photos, and composed previews.
> Deploys never touch it; back it up if you care about saved designs.

Verify it's listening:

```bash
curl http://127.0.0.1:3001/api/health
# → {"status":"ok","version":"0.1.0",...}
```

## 4. Caddy site block

Append to `/etc/caddy/Caddyfile`:

```caddy
designer.concreteshieldcoatingsinc.com {
    reverse_proxy localhost:3001
}
```

Validate and reload:

```bash
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

Caddy will provision a Let's Encrypt cert automatically on first request.

## 5. Smoke test

From anywhere:

```bash
curl -I https://designer.concreteshieldcoatingsinc.com
# → HTTP/2 200
```

In a browser, visit https://designer.concreteshieldcoatingsinc.com — you should
see the "Floor Designer is booting up" placeholder with a green "Server online"
status dot.

## Troubleshooting

- **`pm2 status` shows `errored`** — `pm2 logs csc-designer --lines 50`
- **Caddy reload fails** — `caddy validate --config /etc/caddy/Caddyfile`
- **502 from designer subdomain** — check `pm2 status` and that port 3001 is
  bound: `ss -tlnp | grep :3001`
- **Cert not issued** — confirm DNS has propagated (`dig designer.concreteshieldcoatingsinc.com`)
  and check `journalctl -u caddy --since '5 min ago'`
