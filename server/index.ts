import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { env } from "./env.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const clientDist = resolve(__dirname, "../dist/client");

const app = Fastify({
  logger: {
    level: env.NODE_ENV === "production" ? "info" : "debug",
  },
  trustProxy: true,
  bodyLimit: 15 * 1024 * 1024,
});

app.get("/api/health", async () => ({
  status: "ok",
  version: "0.1.0",
  uptime: process.uptime(),
  timestamp: Date.now(),
}));

if (existsSync(clientDist)) {
  await app.register(fastifyStatic, {
    root: clientDist,
    prefix: "/",
    index: ["index.html"],
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

const shutdown = async (signal: string) => {
  app.log.info(`received ${signal}, shutting down`);
  await app.close();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
