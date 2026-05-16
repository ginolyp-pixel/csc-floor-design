# Phase 3 spike — tap-to-segment floor detection

Self-contained research spike for Phase 3 ML-driven floor detection.
Lives entirely under `client/public/spike/sam.html` so it can be deployed,
tested, and thrown away without touching the production app.

## How to use

After deploy, open: <https://designer.concreteshieldcoatingsinc.com/spike/sam.html>

1. Click **Load model** (one-shot; ~30 MB download for SlimSAM, cached in IndexedDB).
2. Pick a garage photo via the file picker.
3. Wait for the image encoder to run (one-shot per photo, scales with photo size).
4. **Tap the floor**: green dot is "include this", `Shift`+tap is "exclude this".
5. The mask appears tinted teal. Add more taps to refine.
6. The simplified polygon shows in the bottom panel — same shape used by `/api/designs` `mask_data`.

## What we're measuring

| Question | Target |
|---|---|
| Does one tap reliably catch the whole floor? | Yes on ≥ 70 % of photos |
| Image encoder time per photo (1024px long edge) | < 5 s mobile, < 2 s desktop |
| Decoder time per tap | < 200 ms |
| Model download size | < 50 MB |
| Mask boundary follows real floor edge? | Within ~10 px |
| Can shift-tap fix mistakes? | Yes |

## Photos to test

Range that matches real customers:

- Empty garage, even lighting
- Garage with car parked on the floor
- Cluttered floor (tools, boxes, oil stains)
- Strong shadow from open garage door
- Wide-angle phone photo (fisheye-ish)
- Photo taken at an oblique angle
- Two-bay or oddly-shaped garage

## Next steps depending on findings

| Outcome | Next move |
|---|---|
| SlimSAM works on most photos with one tap | Slice 3b: integrate into photo mode, fall back to manual on failure |
| SlimSAM works but slow on mobile | Try quantized model or smaller variant; consider running encoder server-side |
| SlimSAM produces bad masks | Try SAM-ViT-base for comparison (also wired into the spike) |
| Both models miss the floor systematically | Reconsider the approach — possibly server-side segmentation, or hybrid CV+ML |

## Why a CDN-served spike

The spike uses transformers.js from `cdn.jsdelivr.net` so:

- No build step changes to the main app
- Easy to iterate or replace
- Real production-like environment (HTTPS, Caddy, HTTP/2)
- Throwaway: when we land on a model, we'll vendor it locally for the production integration in slice 3b
