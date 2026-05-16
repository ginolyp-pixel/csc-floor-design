/**
 * Photo mode — upload a garage photo, trace the floor as a polygon, fill it
 * with the selected flake. Lazy-loaded so the initial bundle stays small.
 *
 * Three-free: this module never imports `three`. The flake fallback is a
 * solid-color tile painted on a 2D canvas, which is sufficient because all
 * flake textures are self-hosted under /images/flake-colors/ — the path
 * essentially never fires.
 */
import type { FloorFinish } from "../catalog";
import {
  compositeFlakeOnPhotoPolygon,
  imageElementToFlakeData,
  imageToWorkingData,
  type Point2,
} from "./photo-floor";

const SNAP_CLOSE_PX = 18;
const PHOTO_REPEATS = 6;
const MIN_PHOTO_TILE_PX = 40;
const PHOTO_LIGHTING_STRENGTH = 0.85;
const PHOTO_GLOSS_STRENGTH = 0.14;
const PHOTO_AO_STRENGTH = 0.4;
const PHOTO_EDGE_FEATHER_PX = 14;
const MAX_PHOTO_DIM = 1600;

export type PhotoModeDeps = {
  canvas: HTMLCanvasElement;
  hint: HTMLElement | null;
  toolbar: {
    file: HTMLInputElement;
    undo: HTMLButtonElement;
    done: HTMLButtonElement;
    resetOutline: HTMLButtonElement;
    clear: HTMLButtonElement;
    status: HTMLElement;
  };
  initialFinish: FloorFinish;
};

export type PhotoMode = {
  setFinish(finish: FloorFinish): Promise<void>;
  setActive(active: boolean): void;
  hasPhoto(): boolean;
  hasClosedPolygon(): boolean;
  /** Returns a fresh canvas of the current composite WITHOUT the polygon
   *  overlay/markers — for clean export. Returns null if no photo is loaded. */
  captureCleanCanvas(): HTMLCanvasElement | null;
  /** Returns everything the server needs to persist this design:
   *  - photo: JPEG of the working (downscaled) photo
   *  - preview: PNG of the clean composite (no outline)
   *  - polygon + width/height
   *  Returns null if no photo or no closed polygon. */
  buildSavePayload(): Promise<SavePayload | null>;
  /** Hydrate from a saved design: load photo blob + restore polygon. */
  loadDesign(input: LoadDesignInput): Promise<void>;
  dispose(): void;
};

export type SavePayload = {
  photo: Blob;
  preview: Blob;
  polygon: [number, number][];
  photoWidth: number;
  photoHeight: number;
};

export type LoadDesignInput = {
  photoBlob: Blob;
  polygon: Point2[];
  closed: boolean;
};

function paintSolidFallbackImageData(hex: string, size = 256): ImageData {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) {
    throw new Error("2D context unavailable for fallback flake");
  }
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, size, size);
  return ctx.getImageData(0, 0, size, size);
}

function loadFlakeImageData(finish: FloorFinish): Promise<ImageData> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        resolve(imageElementToFlakeData(img));
      } catch {
        resolve(paintSolidFallbackImageData(finish.fallbackHex));
      }
    };
    img.onerror = () => resolve(paintSolidFallbackImageData(finish.fallbackHex));
    img.src = finish.texture;
  });
}

function canvasBitmapCoords(e: PointerEvent, canvas: HTMLCanvasElement): Point2 {
  const rect = canvas.getBoundingClientRect();
  const cssW = rect.width;
  const cssH = rect.height;
  const bmpW = canvas.width;
  const bmpH = canvas.height;
  if (cssW <= 0 || cssH <= 0 || bmpW <= 0 || bmpH <= 0) {
    return [e.clientX - rect.left, e.clientY - rect.top];
  }
  const cssAspect = cssW / cssH;
  const bmpAspect = bmpW / bmpH;
  let displayW: number;
  let displayH: number;
  let offsetX = 0;
  let offsetY = 0;
  if (bmpAspect > cssAspect) {
    displayW = cssW;
    displayH = cssW / bmpAspect;
    offsetY = (cssH - displayH) / 2;
  } else {
    displayH = cssH;
    displayW = cssH * bmpAspect;
    offsetX = (cssW - displayW) / 2;
  }
  const localX = e.clientX - rect.left - offsetX;
  const localY = e.clientY - rect.top - offsetY;
  return [localX * (bmpW / displayW), localY * (bmpH / displayH)];
}

export function mountPhotoMode(deps: PhotoModeDeps): PhotoMode {
  const { canvas, hint, toolbar, initialFinish } = deps;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Photo mode: 2D canvas unsupported");

  let active = false;
  let currentFinish: FloorFinish = initialFinish;
  let flakeData: ImageData | null = null;
  let workingPhoto: ImageData | null = null;
  const polygon: Point2[] = [];
  let polygonClosed = false;
  let cursorPos: Point2 | null = null;
  let touchDragging = false;
  let lastPointerType: "touch" | "mouse" | "pen" = "mouse";

  const dist2D = (a: Point2, b: Point2): number =>
    Math.hypot(a[0] - b[0], a[1] - b[1]);

  const closeSnapDistance = (): number => {
    const base = workingPhoto
      ? Math.max(SNAP_CLOSE_PX, Math.max(workingPhoto.width, workingPhoto.height) * 0.012)
      : SNAP_CLOSE_PX;
    return lastPointerType === "touch" ? base * 1.8 : base;
  };

  const setStatus = (text: string): void => {
    toolbar.status.textContent = text;
  };

  const updateToolbarState = (): void => {
    toolbar.undo.disabled = polygon.length === 0;
    toolbar.done.disabled = polygon.length < 3 || polygonClosed;
    toolbar.resetOutline.disabled = polygon.length === 0 && !polygonClosed;
    toolbar.clear.disabled = !workingPhoto;
  };

  const updateHintVisibility = (): void => {
    if (!hint) return;
    hint.hidden = !active || workingPhoto !== null;
  };

  const refreshStatus = (): void => {
    if (!workingPhoto) {
      setStatus("Choose a clear photo of your garage (JPG, PNG, or WebP).");
      return;
    }
    if (polygonClosed) {
      setStatus("Outline complete. Pick a different flake to update the floor, or press Reset to redraw.");
      return;
    }
    const isTouch = lastPointerType === "touch";
    if (polygon.length === 0) {
      setStatus(
        isTouch
          ? "Tap to place the first corner of your floor. Then drag from each corner to the next and release."
          : "Click around the edge of your floor. Add at least 3 points, then click your first marker (or press Done) to fill it.",
      );
      return;
    }
    if (polygon.length < 3) {
      setStatus(
        isTouch
          ? `Point ${polygon.length} placed. Drag from the last corner to where the next one should go, then release.`
          : `Point ${polygon.length} placed. Keep clicking around the floor edge — you need at least 3 to close the shape.`,
      );
      return;
    }
    setStatus(
      isTouch
        ? `${polygon.length} points placed. Release near your first marker, or press Done, to close the outline.`
        : `${polygon.length} points placed. Click your first marker, or press Done, to close the outline and apply the flake.`,
    );
  };

  const drawFrame = (): void => {
    if (!workingPhoto) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const w = workingPhoto.width;
    const h = workingPhoto.height;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    if (polygonClosed && polygon.length >= 3 && flakeData) {
      const out = ctx.createImageData(w, h);
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const [px_, py_] of polygon) {
        if (px_ < minX) minX = px_;
        if (px_ > maxX) maxX = px_;
        if (py_ < minY) minY = py_;
        if (py_ > maxY) maxY = py_;
      }
      const polyLongest = Math.max(maxX - minX, maxY - minY);
      const flakeTilePx = Math.max(
        MIN_PHOTO_TILE_PX,
        Math.round(polyLongest / PHOTO_REPEATS),
      );
      compositeFlakeOnPhotoPolygon(
        {
          photoData: workingPhoto,
          polygon,
          flakeData,
          blend: 1,
          tilePx: flakeTilePx,
          lightingStrength: PHOTO_LIGHTING_STRENGTH,
          glossStrength: PHOTO_GLOSS_STRENGTH,
          aoStrength: PHOTO_AO_STRENGTH,
          featherPx: PHOTO_EDGE_FEATHER_PX,
        },
        out,
      );
      ctx.putImageData(out, 0, 0);
    } else {
      ctx.putImageData(workingPhoto, 0, 0);
    }

    const rect = canvas.getBoundingClientRect();
    const scale = rect.width > 0 ? canvas.width / rect.width : 1;
    const px = (n: number): number => n * scale;

    const BRAND_RED = "#d23540";
    const SNAP_GREEN = "#23a456";

    const showOutline = !(polygonClosed && polygon.length >= 3 && flakeData);

    if (showOutline && polygon.length > 0) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const placedPath = new Path2D();
      placedPath.moveTo(polygon[0]![0], polygon[0]![1]);
      for (let i = 1; i < polygon.length; i++) {
        placedPath.lineTo(polygon[i]![0], polygon[i]![1]);
      }
      if (polygonClosed) placedPath.closePath();

      ctx.setLineDash([]);
      ctx.lineWidth = px(5);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.78)";
      ctx.stroke(placedPath);

      ctx.lineWidth = px(2.5);
      ctx.strokeStyle = BRAND_RED;
      ctx.stroke(placedPath);

      if (!polygonClosed && cursorPos) {
        const last = polygon[polygon.length - 1]!;
        const nearStart =
          polygon.length >= 3 &&
          dist2D(cursorPos, polygon[0]!) <= closeSnapDistance();

        const previewPath = new Path2D();
        previewPath.moveTo(last[0], last[1]);
        previewPath.lineTo(cursorPos[0], cursorPos[1]);
        if (nearStart) {
          previewPath.moveTo(cursorPos[0], cursorPos[1]);
          previewPath.lineTo(polygon[0]![0], polygon[0]![1]);
        }

        ctx.lineWidth = px(5);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
        ctx.setLineDash([]);
        ctx.stroke(previewPath);

        ctx.lineWidth = px(2.5);
        ctx.strokeStyle = nearStart
          ? "rgba(35, 164, 86, 0.95)"
          : "rgba(210, 53, 64, 0.85)";
        ctx.setLineDash([px(8), px(6)]);
        ctx.stroke(previewPath);
        ctx.setLineDash([]);
      }
    }

    ctx.font = `600 ${Math.round(px(11))}px Montserrat, Arial, sans-serif`;
    if (showOutline) {
      polygon.forEach(([x, y], i) => {
        const isCloseTarget =
          !polygonClosed && polygon.length >= 3 && i === 0;
        const cursorNearStart =
          isCloseTarget &&
          cursorPos !== null &&
          dist2D(cursorPos, polygon[0]!) <= closeSnapDistance();

        if (isCloseTarget) {
          ctx.beginPath();
          ctx.arc(x, y, cursorNearStart ? px(17) : px(13), 0, Math.PI * 2);
          ctx.strokeStyle = cursorNearStart
            ? SNAP_GREEN
            : "rgba(210, 53, 64, 0.55)";
          ctx.lineWidth = px(1.5);
          ctx.setLineDash([px(4), px(3)]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        ctx.save();
        ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
        ctx.shadowBlur = px(6);
        ctx.shadowOffsetY = px(2);
        ctx.beginPath();
        ctx.arc(x, y, px(8), 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.restore();

        ctx.beginPath();
        ctx.arc(x, y, px(3.8), 0, Math.PI * 2);
        ctx.fillStyle = cursorNearStart ? SNAP_GREEN : BRAND_RED;
        ctx.fill();

        const label = String(i + 1);
        const textW = ctx.measureText(label).width;
        const pillPadX = px(6);
        const pillW = textW + pillPadX * 2;
        const pillH = px(18);
        const pillX = x - pillW / 2;
        const pillY = y - px(24) - pillH;
        const pillRadius = px(8);

        ctx.save();
        ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
        ctx.shadowBlur = px(4);
        ctx.shadowOffsetY = px(1);
        ctx.fillStyle = "rgba(20, 24, 33, 0.92)";
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillW, pillH, pillRadius);
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, x, pillY + pillH / 2);
      });
    }

    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  };

  const resetOutline = (): void => {
    polygon.length = 0;
    polygonClosed = false;
    cursorPos = null;
  };

  // ---------------------------------------------------------------------------
  // Event wiring
  // ---------------------------------------------------------------------------
  const onFileChange = (): void => {
    const file = toolbar.file.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const { data } = imageToWorkingData(img, MAX_PHOTO_DIM);
        workingPhoto = data;
        resetOutline();
        refreshStatus();
        updateToolbarState();
        updateHintVisibility();
        drawFrame();
      } catch {
        setStatus("Could not read that image. Try another file.");
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setStatus("Invalid image file.");
    };
    img.src = url;
  };

  const onUndo = (): void => {
    if (polygon.length === 0) return;
    polygon.pop();
    polygonClosed = false;
    refreshStatus();
    updateToolbarState();
    drawFrame();
  };

  const onDone = (): void => {
    if (polygon.length < 3 || polygonClosed) return;
    polygonClosed = true;
    cursorPos = null;
    refreshStatus();
    updateToolbarState();
    drawFrame();
  };

  const onResetOutline = (): void => {
    resetOutline();
    refreshStatus();
    updateToolbarState();
    drawFrame();
  };

  const onClear = (): void => {
    workingPhoto = null;
    resetOutline();
    toolbar.file.value = "";
    canvas.width = 800;
    canvas.height = 600;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    refreshStatus();
    updateToolbarState();
    updateHintVisibility();
  };

  const isTouchEvt = (e: PointerEvent): boolean => e.pointerType === "touch";

  const tryClose = (p: Point2): boolean => {
    if (polygon.length < 3) return false;
    if (dist2D(p, polygon[0]!) > closeSnapDistance()) return false;
    polygonClosed = true;
    cursorPos = null;
    touchDragging = false;
    return true;
  };

  const commitPoint = (p: Point2): void => {
    polygon.push(p);
    cursorPos = null;
  };

  const onPointerDown = (e: PointerEvent): void => {
    if (!active || !workingPhoto) return;
    if (polygonClosed) return;
    lastPointerType = e.pointerType as typeof lastPointerType;
    const p = canvasBitmapCoords(e, canvas);

    if (isTouchEvt(e)) {
      if (polygon.length === 0) {
        commitPoint(p);
      } else {
        touchDragging = true;
        cursorPos = p;
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {
          // Some browsers throw if pointer can't be captured — safe to ignore.
        }
      }
    } else {
      if (!tryClose(p)) commitPoint(p);
    }

    refreshStatus();
    updateToolbarState();
    drawFrame();
  };

  const onPointerMove = (e: PointerEvent): void => {
    if (!active || !workingPhoto || polygonClosed) return;
    if (polygon.length === 0) return;
    if (isTouchEvt(e) && !touchDragging) return;
    cursorPos = canvasBitmapCoords(e, canvas);
    drawFrame();
  };

  const onPointerUp = (e: PointerEvent): void => {
    if (!active || !workingPhoto) return;
    if (!isTouchEvt(e)) return;
    if (!touchDragging) return;
    touchDragging = false;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    if (polygonClosed) return;
    const p = canvasBitmapCoords(e, canvas);
    if (!tryClose(p)) commitPoint(p);
    refreshStatus();
    updateToolbarState();
    drawFrame();
  };

  const onPointerCancel = (e: PointerEvent): void => {
    if (!isTouchEvt(e)) return;
    if (!touchDragging) return;
    touchDragging = false;
    cursorPos = null;
    drawFrame();
  };

  const onPointerLeave = (e: PointerEvent): void => {
    if (e.pointerType === "touch") return;
    if (cursorPos === null) return;
    cursorPos = null;
    drawFrame();
  };

  toolbar.file.addEventListener("change", onFileChange);
  toolbar.undo.addEventListener("click", onUndo);
  toolbar.done.addEventListener("click", onDone);
  toolbar.resetOutline.addEventListener("click", onResetOutline);
  toolbar.clear.addEventListener("click", onClear);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
  canvas.addEventListener("pointerleave", onPointerLeave);

  refreshStatus();
  updateToolbarState();

  // Kick off initial flake load so it's ready by the time the user enters
  // photo mode and finishes outlining.
  void (async () => {
    flakeData = await loadFlakeImageData(currentFinish);
    if (active) drawFrame();
  })();

  const captureCleanCanvas = (): HTMLCanvasElement | null => {
    if (!workingPhoto) return null;
    const w = workingPhoto.width;
    const h = workingPhoto.height;
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const outCtx = out.getContext("2d");
    if (!outCtx) return null;

    if (polygonClosed && polygon.length >= 3 && flakeData) {
      const composite = outCtx.createImageData(w, h);
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const [px_, py_] of polygon) {
        if (px_ < minX) minX = px_;
        if (px_ > maxX) maxX = px_;
        if (py_ < minY) minY = py_;
        if (py_ > maxY) maxY = py_;
      }
      const polyLongest = Math.max(maxX - minX, maxY - minY);
      const flakeTilePx = Math.max(
        MIN_PHOTO_TILE_PX,
        Math.round(polyLongest / PHOTO_REPEATS),
      );
      compositeFlakeOnPhotoPolygon(
        {
          photoData: workingPhoto,
          polygon,
          flakeData,
          blend: 1,
          tilePx: flakeTilePx,
          lightingStrength: PHOTO_LIGHTING_STRENGTH,
          glossStrength: PHOTO_GLOSS_STRENGTH,
          aoStrength: PHOTO_AO_STRENGTH,
          featherPx: PHOTO_EDGE_FEATHER_PX,
        },
        composite,
      );
      outCtx.putImageData(composite, 0, 0);
    } else {
      outCtx.putImageData(workingPhoto, 0, 0);
    }
    return out;
  };

  return {
    setFinish: async (finish) => {
      currentFinish = finish;
      flakeData = await loadFlakeImageData(finish);
      if (active) drawFrame();
    },
    setActive: (next) => {
      active = next;
      if (active) {
        refreshStatus();
        updateToolbarState();
        updateHintVisibility();
        drawFrame();
      } else {
        cursorPos = null;
      }
    },
    hasPhoto: () => workingPhoto !== null,
    hasClosedPolygon: () => polygonClosed && polygon.length >= 3,
    captureCleanCanvas,
    buildSavePayload: async (): Promise<SavePayload | null> => {
      if (!workingPhoto) return null;
      if (!polygonClosed || polygon.length < 3) return null;

      const photoCanvas2 = document.createElement("canvas");
      photoCanvas2.width = workingPhoto.width;
      photoCanvas2.height = workingPhoto.height;
      const pCtx = photoCanvas2.getContext("2d");
      if (!pCtx) return null;
      pCtx.putImageData(workingPhoto, 0, 0);

      const previewCanvas = captureCleanCanvas();
      if (!previewCanvas) return null;

      const photoBlob = await new Promise<Blob | null>((resolve) =>
        photoCanvas2.toBlob(resolve, "image/jpeg", 0.9),
      );
      const previewBlob = await new Promise<Blob | null>((resolve) =>
        previewCanvas.toBlob(resolve, "image/png"),
      );
      if (!photoBlob || !previewBlob) return null;

      return {
        photo: photoBlob,
        preview: previewBlob,
        polygon: polygon.map((p): [number, number] => [p[0], p[1]]),
        photoWidth: workingPhoto.width,
        photoHeight: workingPhoto.height,
      };
    },
    loadDesign: async ({ photoBlob, polygon: poly, closed }) => {
      const url = URL.createObjectURL(photoBlob);
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const i = new Image();
          i.onload = () => resolve(i);
          i.onerror = () => reject(new Error("Could not decode saved photo"));
          i.src = url;
        });
        const { data } = imageToWorkingData(img, MAX_PHOTO_DIM);
        workingPhoto = data;
        polygon.length = 0;
        for (const p of poly) polygon.push([p[0], p[1]]);
        polygonClosed = closed && polygon.length >= 3;
        cursorPos = null;
        refreshStatus();
        updateToolbarState();
        updateHintVisibility();
        if (active) drawFrame();
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    dispose: () => {
      toolbar.file.removeEventListener("change", onFileChange);
      toolbar.undo.removeEventListener("click", onUndo);
      toolbar.done.removeEventListener("click", onDone);
      toolbar.resetOutline.removeEventListener("click", onResetOutline);
      toolbar.clear.removeEventListener("click", onClear);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("pointerleave", onPointerLeave);
    },
  };
}
