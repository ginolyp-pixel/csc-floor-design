import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyMultipart from "@fastify/multipart";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync, statSync } from "node:fs";
import { env } from "./env.ts";
import { registerDesignRoutes } from "./routes/designs.ts";
import { countActiveDesigns, countExpiredDesigns, databaseFilePath } from "./db.ts";
import { diskStats, purgeExpired } from "./purge.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const clientDist = resolve(__dirname, "../dist/client");

const app = Fastify({
  logger: {
    level: env.NODE_ENV === "production" ? "info" : "debug",
  },
  trustProxy: true,
  bodyLimit: 15 * 1024 * 1024,
});

await app.register(fastifyMultipart, {
  limits: {
    fileSize: env.MAX_PHOTO_BYTES,
    files: 2,
    fields: 8,
  },
});

app.get("/api/health", async () => ({
  status: "ok",
  version: "0.3.0",
  uptime: process.uptime(),
  timestamp: Date.now(),
}));

app.get("/api/stats", async () => {
  const now = Date.now();
  const disk = diskStats();
  let dbBytes = 0;
  try { dbBytes = statSync(databaseFilePath()).size; } catch { /* db not yet created */ }
  return {
    designs: {
      active: countActiveDesigns(now),
      expired_pending_purge: countExpiredDesigns(now),
    },
    storage: {
      photos: disk.photos,
      previews: disk.previews,
      database_bytes: dbBytes,
      total_bytes: disk.photos.bytes + disk.previews.bytes + dbBytes,
    },
    ttl_days: env.DESIGN_TTL_DAYS,
    uptime_seconds: Math.round(process.uptime()),
    timestamp: now,
  };
});

await registerDesignRoutes(app);

if (existsSync(clientDist)) {
  await app.register(fastifyStatic, {
    root: clientDist,
    prefix: "/",
    index: ["index.html"],
  });

  // Saved-design deep links — serve the SPA shell, client-side hydrates
  // from /api/designs/:id. ID format is 8 alphanumeric chars (storage.ts).
  app.get<{ Params: { id: string } }>("/d/:id", (req, reply) => {
    if (!/^[0-9A-Za-z]{8}$/.test(req.params.id)) {
      return reply.code(404).send({ error: "not found" });
    }
    return reply.sendFile("index.html");
  });
} else {
  app.log.warn(`client bundle not found at ${clientDist} — run \`npm run build\``);
  app.get("/", async () => ({
    status: "no-bundle",
    message: "Run `npm run build` to produce the client bundle.",
  }));
}

try {
  await app.listen({ host: env.HOST, port: env.PORT });
  app.log.info(`csc-floor-design listening on http://${env.HOST}:${env.PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

// Daily TTL purge — runs once 60s after boot to catch anything left over from
// downtime, then every 24h. Using setInterval over an external cron keeps the
// deploy story single-process and avoids a stray purge if the app is stopped.
const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const runPurge = (): void => {
  try {
    const result = purgeExpired();
    if (result.rowsDeleted > 0 || result.filesMissing > 0) {
      app.log.info({ purge: result }, "ttl purge complete");
    }
  } catch (err) {
    app.log.error({ err }, "ttl purge failed");
  }
};
const initialPurgeTimer = setTimeout(runPurge, 60_000);
const periodicPurgeTimer = setInterval(runPurge, PURGE_INTERVAL_MS);

const shutdown = async (signal: string) => {
  app.log.info(`received ${signal}, shutting down`);
  clearTimeout(initialPurgeTimer);
  clearInterval(periodicPurgeTimer);
  await app.close();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
