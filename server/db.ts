import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { env } from "./env.ts";

export type DesignRow = {
  id: string;
  created_at: number;
  expires_at: number;
  photo_path: string | null;
  mask_data: string | null;
  flake_id: string | null;
  settings_json: string | null;
  preview_path: string | null;
  emailed_to: string | null;
};

const dbPath = join(env.DATA_DIR, "designer.sqlite");
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS designs (
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
  CREATE INDEX IF NOT EXISTS idx_designs_expires ON designs(expires_at);
`);

const insertStmt = db.prepare(`
  INSERT INTO designs
    (id, created_at, expires_at, photo_path, mask_data, flake_id, settings_json, preview_path, emailed_to)
  VALUES
    (@id, @created_at, @expires_at, @photo_path, @mask_data, @flake_id, @settings_json, @preview_path, @emailed_to)
`);

const selectStmt = db.prepare(`SELECT * FROM designs WHERE id = ?`);
const expiredStmt = db.prepare(`SELECT id, photo_path, preview_path FROM designs WHERE expires_at < ?`);
const deleteStmt = db.prepare(`DELETE FROM designs WHERE id = ?`);
const countActiveStmt = db.prepare(`SELECT COUNT(*) as n FROM designs WHERE expires_at >= ?`);
const countExpiredStmt = db.prepare(`SELECT COUNT(*) as n FROM designs WHERE expires_at < ?`);
const listRecentStmt = db.prepare(`
  SELECT id, created_at, expires_at, photo_path, flake_id, preview_path, emailed_to
  FROM designs
  WHERE expires_at >= ?
  ORDER BY created_at DESC
  LIMIT ?
`);

export function insertDesign(row: DesignRow): void {
  insertStmt.run(row);
}

export function getDesign(id: string): DesignRow | undefined {
  return selectStmt.get(id) as DesignRow | undefined;
}

export type ExpiredRow = { id: string; photo_path: string | null; preview_path: string | null };

export function listExpiredDesigns(nowMs: number = Date.now()): ExpiredRow[] {
  return expiredStmt.all(nowMs) as ExpiredRow[];
}

export function deleteDesignRow(id: string): void {
  deleteStmt.run(id);
}

export function countActiveDesigns(nowMs: number = Date.now()): number {
  return (countActiveStmt.get(nowMs) as { n: number }).n;
}

export function countExpiredDesigns(nowMs: number = Date.now()): number {
  return (countExpiredStmt.get(nowMs) as { n: number }).n;
}

export type DesignSummary = Pick<DesignRow, "id" | "created_at" | "expires_at" | "photo_path" | "flake_id" | "preview_path" | "emailed_to">;

export function listRecentDesigns(limit: number = 100, nowMs: number = Date.now()): DesignSummary[] {
  return listRecentStmt.all(nowMs, limit) as DesignSummary[];
}

export function databaseFilePath(): string {
  return dbPath;
}
