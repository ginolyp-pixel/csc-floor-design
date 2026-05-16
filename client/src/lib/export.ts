/**
 * Branded screenshot composer + share helpers.
 *
 * Composes the visualizer canvas (3D viewport or photo composite) into a
 * larger canvas with a footer strip showing the flake name and CSC brand.
 */

const FOOTER_HEIGHT = 64;
const BRAND_RED = "#c0392b";
const FOOTER_BG = "#15181d";
const FOOTER_TEXT = "#f5f5f5";
const FOOTER_MUTED = "#9aa0a6";

export type ScreenshotInput = {
  source: HTMLCanvasElement;
  finishName: string;
  finishCategory?: "standard" | "custom";
};

export function composeBrandedCanvas(input: ScreenshotInput): HTMLCanvasElement {
  const { source, finishName, finishCategory } = input;
  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = source.height + FOOTER_HEIGHT;

  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Screenshot: 2D context unavailable");

  ctx.drawImage(source, 0, 0);

  ctx.fillStyle = FOOTER_BG;
  ctx.fillRect(0, source.height, out.width, FOOTER_HEIGHT);

  ctx.fillStyle = BRAND_RED;
  ctx.fillRect(0, source.height, 4, FOOTER_HEIGHT);

  const fontStack = `Montserrat, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  const padX = 22;
  const baseY = source.height + FOOTER_HEIGHT / 2;

  ctx.fillStyle = FOOTER_TEXT;
  ctx.font = `700 18px ${fontStack}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(finishName, padX, baseY - 8);

  ctx.fillStyle = FOOTER_MUTED;
  ctx.font = `500 11px ${fontStack}`;
  const sub = finishCategory ? `${finishCategory.toUpperCase()} BLEND` : "FLAKE BLEND";
  ctx.fillText(sub, padX, baseY + 12);

  ctx.fillStyle = FOOTER_TEXT;
  ctx.font = `700 13px ${fontStack}`;
  ctx.textAlign = "right";
  ctx.fillText("CONCRETE SHIELD COATINGS INC.", out.width - padX, baseY - 6);

  ctx.fillStyle = FOOTER_MUTED;
  ctx.font = `500 11px ${fontStack}`;
  ctx.fillText("designer.concreteshieldcoatingsinc.com", out.width - padX, baseY + 12);

  return out;
}

export function downloadCanvasAsPng(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to encode PNG"));
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      resolve();
    }, "image/png");
  });
}

export function buildScreenshotFilename(finishId: string): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `csc-${finishId}-${yyyy}-${mm}-${dd}.png`;
}

/** Best-effort copy with a textarea fallback for non-secure contexts. */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to legacy
    }
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
