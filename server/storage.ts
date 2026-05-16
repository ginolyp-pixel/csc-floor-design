import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { customAlphabet } from "nanoid";
import { env } from "./env.ts";

const PHOTO_DIR = join(env.DATA_DIR, "photos");
const PREVIEW_DIR = join(env.DATA_DIR, "previews");

mkdirSync(PHOTO_DIR, { recursive: true });
mkdirSync(PREVIEW_DIR, { recursive: true });

/** 8-char alphanumeric IDs — ~10^14 keyspace, short URLs. */
const ID_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
const generateId = customAlphabet(ID_ALPHABET, 8);

export function newDesignId(): string {
  return generateId();
}

export function photoPathFor(id: string, ext: "jpg" | "png" | "webp"): string {
  return join(PHOTO_DIR, `${id}.${ext}`);
}

export function previewPathFor(id: string): string {
  return join(PREVIEW_DIR, `${id}.png`);
}

export function writePhoto(id: string, ext: "jpg" | "png" | "webp", data: Buffer): string {
  const path = photoPathFor(id, ext);
  writeFileSync(path, data);
  return path;
}

export function writePreview(id: string, data: Buffer): string {
  const path = previewPathFor(id);
  writeFileSync(path, data);
  return path;
}
