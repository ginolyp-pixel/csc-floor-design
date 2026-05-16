# Phase 3 status — paused after slice 3b

Where we are after the server-side SAM build.

## What ships

- **Desktop / tablet**: `/spike/sam.html` runs SAM client-side via transformers.js.
  Works well — ~1–2 s per tap after the model loads (10–30 s cold). Currently
  unlinked from the main app, by design.
- **Phone**: client-side SAM is unreliable (iOS Safari tab-kill when the photo
  picker opens while the model is in memory). The spike now shows a "may not
  work on phones" warning and uses tighter caps (480 px, q8 weights) but it's
  best-effort. Phone users should use the manual trace flow, which already
  works fast.
- **Server-side**: `POST /api/designs/:id/segment` is live. Per-call timing on
  the current 1.9 GB / 2-core VPS:
  - Cold (first ever): ~2 m 27 s (model download + load + encoder)
  - Warm (model in memory): ~1 m per tap
  - Targeting <10 s per tap after VPS upgrade
- **Cache**: a multi-tensor disk cache (`$DATA_DIR/sam-cache/<id>.sam4`) is in
  place. It saves `pixel_values` + every key returned by `get_image_embeddings`.
  Whether `SamModel.forward()` actually skips the encoder when given full
  cached inputs is **untested** — would need a real second-call run to confirm.
  If it works: per-tap drops to ~2 s warm. If it doesn't: bypass SamModel and
  call ONNX sessions directly via onnxruntime-node (real engineering project).

## Why we paused

The VPS is the limiting factor:
- 1.9 GB RAM, no x86-64-v2 instructions (no AVX2)
- SAM encoder on these specs is 60 s per warm call
- Anything faster requires either a beefier VPS or a smaller model

Path forward when revisited:
1. Upgrade VPS (Hetzner CX32: 8 GB / 4 vCPU / ~$13 mo with modern AVX-512 is
   the recommended target — see `docs/VPS-SETUP.md`).
2. Re-test the segment endpoint warm call. Target <10 s.
3. Verify the cache actually skips the encoder. Target ~2 s per tap.
4. Slice 3c: wire a "Detect floor" button in photo mode (desktop/tablet
   primary, phone with warning) that calls the server-side endpoint.

## Dependencies left in place

- `@huggingface/transformers` 3.5
- `onnxruntime-node` 1.20
- `sharp` pinned to 0.32.6 (overrides) — last version with x86-64-v1 prebuilts.
  When the VPS upgrades to a v2-capable CPU, this pin can be removed.

If we ever need to strip server-side SAM, the changes are scoped to:
- `server/services/sam.ts` (delete)
- `server/routes/designs.ts` (drop the segment endpoint + imports)
- `package.json` (drop the four deps + overrides)
- Re-run `npm install` to shrink node_modules ~1.2 GB

## What's NOT done

- Slice 3c: photo-mode UI for the "Detect floor" button
- Slice 3d: polish (mask refinement UI, "Looks good" / "Adjust" buttons)
- Performance verification of the cache path
