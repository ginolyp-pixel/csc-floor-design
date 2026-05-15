import "dotenv/config";

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number`);
  return n;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "production",
  HOST: process.env.HOST ?? "127.0.0.1",
  PORT: num("PORT", 3001),
} as const;
