import { unlinkSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { env } from "./env.ts";
import { deleteDesignRow, listExpiredDesigns } from "./db.ts";

const PHOTO_DIR = join(env.DATA_DIR, "photos");
const PREVIEW_DIR = join(env.DATA_DIR, "previews");

export type PurgeResult = {
  rowsDeleted: number;
  filesDeleted: number;
  filesMissing: number;
};

function unlinkIfExists(path: string | null): "deleted" | "missing" {
  if (!path) return "missing";
  try {
    unlinkSync(path);
    return "deleted";
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return "missing";
    throw err;
  }
}

export function purgeExpired(nowMs: number = Date.now()): PurgeResult {
  const rows = listExpiredDesigns(nowMs);
  let filesDeleted = 0;
  let filesMissing = 0;
  for (const row of rows) {
    if (unlinkIfExists(row.photo_path) === "deleted") filesDeleted++; else filesMissing++;
    if (unlinkIfExists(row.preview_path) === "deleted") filesDeleted++; else filesMissing++;
    deleteDesignRow(row.id);
  }
  return { rowsDeleted: rows.length, filesDeleted, filesMissing };
}

function dirBytes(dir: string): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;
  try {
    for (const name of readdirSync(dir)) {
      try {
        const stats = statSync(join(dir, name));
        if (stats.isFile()) {
          files++;
          bytes += stats.size;
        }
      } catch { /* ignore individual file errors */ }
    }
  } catch { /* dir might not exist yet */ }
  return { files, bytes };
}

export function diskStats(): { photos: { files: number; bytes: number }; previews: { files: number; bytes: number } } {
  return {
    photos: dirBytes(PHOTO_DIR),
    previews: dirBytes(PREVIEW_DIR),
  };
}
