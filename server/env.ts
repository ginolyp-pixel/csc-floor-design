import "dotenv/config";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number`);
  return n;
}

function str(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

const defaultDataDir = resolve(process.cwd(), "data");

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "production",
  HOST: str("HOST", "127.0.0.1"),
  PORT: num("PORT", 3001),

  /** Root directory for SQLite + uploaded photos + composed previews. */
  DATA_DIR: resolve(str("DATA_DIR", defaultDataDir)),

  /** Days before saved designs expire and are purged. */
  DESIGN_TTL_DAYS: num("DESIGN_TTL_DAYS", 90),

  /** Max sizes (bytes) for uploaded files. */
  MAX_PHOTO_BYTES: num("MAX_PHOTO_BYTES", 15 * 1024 * 1024),
  MAX_PREVIEW_BYTES: num("MAX_PREVIEW_BYTES", 10 * 1024 * 1024),
  MAX_MASK_BYTES: num("MAX_MASK_BYTES", 256 * 1024),

  /** Password for the /admin dashboard. If unset, admin features are
   *  disabled and the endpoints return 503. */
  ESTIMATOR_PASSWORD: str("ESTIMATOR_PASSWORD", ""),

  /** Secret used to sign the admin session cookie. Auto-generated on each
   *  boot if unset — set explicitly in prod so sessions survive restarts. */
  SESSION_SECRET: str("SESSION_SECRET", randomBytes(32).toString("hex")),
} as const;
