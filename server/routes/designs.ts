import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { MultipartFile } from "@fastify/multipart";
import { FLOOR_FINISHES } from "../../client/src/catalog.ts";
import { env } from "../env.ts";
import { insertDesign } from "../db.ts";
import { newDesignId, writePhoto, writePreview } from "../storage.ts";

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

export async function registerDesignRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/designs", postDesign);
}
