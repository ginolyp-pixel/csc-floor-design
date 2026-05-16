import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { MultipartFile } from "@fastify/multipart";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { FLOOR_FINISHES } from "../../client/src/catalog.ts";
import { env } from "../env.ts";
import { getDesign, insertDesign } from "../db.ts";
import { newDesignId, writePhoto, writePreview } from "../storage.ts";

const PHOTO_EXT_TO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const VALID_FLAKE_IDS = new Set(FLOOR_FINISHES.map((f) => f.id));

const PHOTO_MIME_TO_EXT: Record<string, "jpg" | "png" | "webp"> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

type MaskData = {
  polygon: [number, number][];
  photo_width: number;
  photo_height: number;
};

function validateMask(raw: string): MaskData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("mask_data is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("mask_data must be an object");
  const m = parsed as Partial<MaskData>;
  if (!Array.isArray(m.polygon) || m.polygon.length < 3) {
    throw new Error("mask_data.polygon must be an array of at least 3 points");
  }
  if (m.polygon.length > 4096) throw new Error("mask_data.polygon too large");
  for (const pt of m.polygon) {
    if (!Array.isArray(pt) || pt.length !== 2 || typeof pt[0] !== "number" || typeof pt[1] !== "number") {
      throw new Error("mask_data.polygon points must be [number, number]");
    }
  }
  if (typeof m.photo_width !== "number" || typeof m.photo_height !== "number") {
    throw new Error("mask_data.photo_width and photo_height are required numbers");
  }
  return m as MaskData;
}

async function bufferFromMultipart(file: MultipartFile, maxBytes: number, label: string): Promise<Buffer> {
  let total = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of file.file) {
    total += chunk.length;
    if (total > maxBytes) {
      throw new Error(`${label} exceeds max size of ${maxBytes} bytes`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function postDesign(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.isMultipart()) {
    return reply.code(415).send({ error: "Content-Type must be multipart/form-data" });
  }

  const parts = req.parts({ limits: { fileSize: env.MAX_PHOTO_BYTES } });

  let photoBuf: Buffer | null = null;
  let photoExt: "jpg" | "png" | "webp" | null = null;
  let previewBuf: Buffer | null = null;
  let maskRaw: string | null = null;
  let flakeId: string | null = null;
  let settingsRaw: string | null = null;

  try {
    for await (const part of parts) {
      if (part.type === "file") {
        if (part.fieldname === "photo") {
          const ext = PHOTO_MIME_TO_EXT[part.mimetype];
          if (!ext) {
            throw new Error(`Unsupported photo type: ${part.mimetype}`);
          }
          photoBuf = await bufferFromMultipart(part, env.MAX_PHOTO_BYTES, "photo");
          photoExt = ext;
        } else if (part.fieldname === "preview") {
          if (part.mimetype !== "image/png") {
            throw new Error("preview must be image/png");
          }
          previewBuf = await bufferFromMultipart(part, env.MAX_PREVIEW_BYTES, "preview");
        } else {
          // Drain unknown file parts to avoid hanging.
          for await (const _ of part.file) { /* drain */ }
        }
      } else if (part.type === "field") {
        if (part.fieldname === "mask_data") {
          const v = String(part.value ?? "");
          if (v.length > env.MAX_MASK_BYTES) throw new Error("mask_data too large");
          maskRaw = v;
        } else if (part.fieldname === "flake_id") {
          flakeId = String(part.value ?? "");
        } else if (part.fieldname === "settings") {
          const v = String(part.value ?? "");
          if (v.length > 4096) throw new Error("settings too large");
          settingsRaw = v;
        }
      }
    }
  } catch (err) {
    return reply.code(400).send({ error: (err as Error).message });
  }

  if (!photoBuf || !photoExt) return reply.code(400).send({ error: "photo file is required" });
  if (!maskRaw) return reply.code(400).send({ error: "mask_data field is required" });
  if (!flakeId || !VALID_FLAKE_IDS.has(flakeId)) {
    return reply.code(400).send({ error: "flake_id is required and must match a known finish" });
  }

  let mask: MaskData;
  try {
    mask = validateMask(maskRaw);
  } catch (err) {
    return reply.code(400).send({ error: (err as Error).message });
  }

  if (settingsRaw) {
    try { JSON.parse(settingsRaw); }
    catch { return reply.code(400).send({ error: "settings is not valid JSON" }); }
  }

  const id = newDesignId();
  const now = Date.now();
  const ttlMs = env.DESIGN_TTL_DAYS * 24 * 60 * 60 * 1000;

  const photoPath = writePhoto(id, photoExt, photoBuf);
  const previewPath = previewBuf ? writePreview(id, previewBuf) : null;

  insertDesign({
    id,
    created_at: now,
    expires_at: now + ttlMs,
    photo_path: photoPath,
    mask_data: JSON.stringify(mask),
    flake_id: flakeId,
    settings_json: settingsRaw,
    preview_path: previewPath,
    emailed_to: null,
  });

  reply.code(201).send({
    id,
    url: `${req.protocol}://${req.hostname}/d/${id}`,
    expires_at: now + ttlMs,
  });
}

type IdParams = { id: string };

const ID_RE = /^[0-9A-Za-z]{8}$/;

function validateId(id: string): boolean {
  return ID_RE.test(id);
}

async function getDesignMeta(req: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply): Promise<void> {
  const { id } = req.params;
  if (!validateId(id)) return reply.code(400).send({ error: "invalid id" });

  const row = getDesign(id);
  if (!row) return reply.code(404).send({ error: "not found" });
  if (row.expires_at < Date.now()) return reply.code(410).send({ error: "expired" });

  reply.send({
    id: row.id,
    created_at: row.created_at,
    expires_at: row.expires_at,
    flake_id: row.flake_id,
    mask_data: row.mask_data ? JSON.parse(row.mask_data) : null,
    settings: row.settings_json ? JSON.parse(row.settings_json) : null,
    photo_url: row.photo_path ? `/api/designs/${row.id}/photo` : null,
    preview_url: row.preview_path ? `/api/designs/${row.id}/preview` : null,
  });
}

function sendFileBuffer(reply: FastifyReply, path: string, mime: string): void {
  // Read into memory + send as Buffer. Photos cap at MAX_PHOTO_BYTES (15 MB),
  // previews at MAX_PREVIEW_BYTES (10 MB) — both fit comfortably. Avoids
  // Fastify+HTTP/2 stream-pipeline edge cases that produced empty bodies.
  let data: Buffer;
  try {
    data = readFileSync(path);
  } catch {
    reply.code(404).send({ error: "file missing" });
    return;
  }
  reply
    .header("Content-Type", mime)
    .header("Cache-Control", "public, max-age=31536000, immutable")
    .send(data);
}

async function getDesignPhoto(req: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply): Promise<void> {
  const { id } = req.params;
  if (!validateId(id)) return reply.code(400).send({ error: "invalid id" });
  const row = getDesign(id);
  if (!row?.photo_path) return reply.code(404).send({ error: "not found" });
  if (row.expires_at < Date.now()) return reply.code(410).send({ error: "expired" });
  const ext = extname(row.photo_path).toLowerCase();
  const mime = PHOTO_EXT_TO_MIME[ext] ?? "application/octet-stream";
  sendFileBuffer(reply, row.photo_path, mime);
}

async function getDesignPreview(req: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply): Promise<void> {
  const { id } = req.params;
  if (!validateId(id)) return reply.code(400).send({ error: "invalid id" });
  const row = getDesign(id);
  if (!row?.preview_path) return reply.code(404).send({ error: "not found" });
  if (row.expires_at < Date.now()) return reply.code(410).send({ error: "expired" });
  sendFileBuffer(reply, row.preview_path, "image/png");
}

export async function registerDesignRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/designs", postDesign);
  app.get<{ Params: IdParams }>("/api/designs/:id", getDesignMeta);
  app.get<{ Params: IdParams }>("/api/designs/:id/photo", getDesignPhoto);
  app.get<{ Params: IdParams }>("/api/designs/:id/preview", getDesignPreview);
}
