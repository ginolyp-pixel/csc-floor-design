# Deploy

After the one-time setup in `VPS-SETUP.md`, a normal deploy is:

```bash
ssh root@162.254.37.181
cd /opt/csc-floor-design
./scripts/deploy.sh
```

The script:

1. `git fetch` and hard-resets to `origin/main`
2. `npm ci` (clean install of locked deps)
3. `npm run build` (rebuilds `dist/client/`)
4. `pm2 restart csc-designer` (or starts it if not running)
5. Hits `/api/health` to confirm it's alive

## Rollback

```bash
cd /opt/csc-floor-design
git log --oneline -10                 # find the last-good SHA
git reset --hard <SHA>
npm ci && npm run build
pm2 restart csc-designer
```

## Health monitoring

- `pm2 status` — process state
- `pm2 logs csc-designer` — live tail
- `pm2 logs csc-designer --err` — errors only
- `curl http://127.0.0.1:3001/api/health` — direct health probe

## Logs

- PM2: `/var/log/csc-designer/{out,error}.log`
- Caddy: `journalctl -u caddy -f`
