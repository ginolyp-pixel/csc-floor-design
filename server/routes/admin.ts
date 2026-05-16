import type { FastifyInstance, FastifyRequest, FastifyReply, preHandlerHookHandler } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { env } from "../env.ts";
import { listRecentDesigns } from "../db.ts";
import { FLOOR_FINISHES } from "../../client/src/catalog.ts";

const ADMIN_COOKIE = "csc_admin";
const SESSION_VALUE = "ok";
const SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60; // 7 days

const FLAKE_NAME_BY_ID = new Map(FLOOR_FINISHES.map((f) => [f.id, f.name] as const));

function constantTimeEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

const requireAdmin: preHandlerHookHandler = async (req, reply) => {
  if (!env.ESTIMATOR_PASSWORD) {
    return reply.code(503).send({ error: "admin features not configured (ESTIMATOR_PASSWORD unset on the server)" });
  }
  const cookie = (req.cookies as Record<string, string | undefined>)[ADMIN_COOKIE];
  if (!cookie) return reply.code(401).send({ error: "auth required" });
  const unsigned = req.unsignCookie(cookie);
  if (!unsigned.valid || unsigned.value !== SESSION_VALUE) {
    return reply.code(401).send({ error: "invalid session" });
  }
};

async function postLogin(req: FastifyRequest<{ Body: { password?: string } }>, reply: FastifyReply): Promise<void> {
  if (!env.ESTIMATOR_PASSWORD) {
    return reply.code(503).send({ error: "admin features not configured" });
  }
  const password = String(req.body?.password ?? "");
  if (password.length === 0 || !constantTimeEquals(password, env.ESTIMATOR_PASSWORD)) {
    return reply.code(401).send({ error: "wrong password" });
  }
  reply.setCookie(ADMIN_COOKIE, SESSION_VALUE, {
    signed: true,
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  });
  reply.send({ ok: true });
}

async function postLogout(_req: FastifyRequest, reply: FastifyReply): Promise<void> {
  reply.clearCookie(ADMIN_COOKIE, { path: "/" });
  reply.send({ ok: true });
}

async function getStatus(req: FastifyRequest, _reply: FastifyReply): Promise<unknown> {
  const cookie = (req.cookies as Record<string, string | undefined>)[ADMIN_COOKIE];
  if (!cookie) return { authenticated: false, configured: !!env.ESTIMATOR_PASSWORD };
  const unsigned = req.unsignCookie(cookie);
  return {
    authenticated: unsigned.valid && unsigned.value === SESSION_VALUE,
    configured: !!env.ESTIMATOR_PASSWORD,
  };
}

async function getDesigns(req: FastifyRequest<{ Querystring: { limit?: string } }>, reply: FastifyReply): Promise<void> {
  const requested = Number(req.query?.limit ?? 100);
  const limit = Number.isFinite(requested) ? Math.max(1, Math.min(100, Math.floor(requested))) : 100;
  const rows = listRecentDesigns(limit);
  const designs = rows.map((row) => ({
    id: row.id,
    created_at: row.created_at,
    expires_at: row.expires_at,
    flake_id: row.flake_id,
    flake_name: row.flake_id ? FLAKE_NAME_BY_ID.get(row.flake_id) ?? null : null,
    share_url: `/d/${row.id}`,
    photo_url: row.photo_path ? `/api/designs/${row.id}/photo` : null,
    preview_url: row.preview_path ? `/api/designs/${row.id}/preview` : null,
    emailed_to: row.emailed_to,
  }));
  reply.send({ designs, count: designs.length, limit });
}

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { password?: string } }>("/api/admin/login", postLogin);
  app.post("/api/admin/logout", postLogout);
  app.get("/api/admin/status", getStatus);
  app.get<{ Querystring: { limit?: string } }>("/api/admin/designs", { preHandler: requireAdmin }, getDesigns);
}
