/**
 * Designer entry. Stays Three-free: the 3D scene and photo modules are
 * dynamically imported on demand so the initial JS chunk is small and the UI
 * (flake grid, search) renders before the heavy graphics download.
 */
import {
  STANDARD_FINISHES,
  CUSTOM_FINISHES,
  FLOOR_FINISHES,
  type FloorFinish,
  getFinishById,
} from "./catalog";
import type { Garage } from "./scene/garage";
import type { PhotoMode } from "./photo/photo";
import {
  composeBrandedCanvas,
  copyTextToClipboard,
  downloadCanvasAsPng,
  buildScreenshotFilename,
} from "./lib/export";

const QUOTE_BASE = "https://www.concreteshieldcoatingsinc.com/contact";

type Mode = "3d" | "photo";

function buildFinishGrid(grid: HTMLElement, finishes: FloorFinish[], onSelect: (f: FloorFinish) => void): HTMLElement[] {
  grid.innerHTML = "";
  const tiles: HTMLElement[] = [];
  for (const finish of finishes) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "fd-swatch";
    btn.dataset.id = finish.id;
    btn.setAttribute("aria-label", `${finish.name} flake`);
    btn.innerHTML = `
      <img src="${finish.texture}" alt="" loading="lazy" width="120" height="120" />
      <figcaption>${finish.name}</figcaption>
    `;
    btn.addEventListener("click", () => onSelect(finish));
    grid.appendChild(btn);
    tiles.push(btn);
  }
  return tiles;
}

function setActiveTile(tiles: HTMLElement[], finishId: string): void {
  for (const t of tiles) {
    t.setAttribute("aria-pressed", t.dataset.id === finishId ? "true" : "false");
  }
}

type SectionGroup = { section: HTMLElement; tiles: HTMLElement[] };

function applySearchFilter(groups: SectionGroup[], query: string, emptyMsg: HTMLElement | null): void {
  const q = query.trim().toLowerCase();
  let anyVisible = false;
  for (const { section, tiles } of groups) {
    let groupVisible = false;
    for (const t of tiles) {
      const name = (t.querySelector("figcaption")?.textContent ?? "").toLowerCase();
      const hidden = q.length > 0 && !name.includes(q);
      t.hidden = hidden;
      if (!hidden) groupVisible = true;
    }
    section.hidden = !groupVisible;
    if (groupVisible) anyVisible = true;
  }
  if (emptyMsg) emptyMsg.hidden = anyVisible;
}

async function init(): Promise<void> {
  const shell = document.querySelector(".fd-shell") as HTMLElement | null;
  const viewport = document.getElementById("fd-viewport");
  const sectionStandard = document.getElementById("fd-section-standard");
  const sectionCustom = document.getElementById("fd-section-custom");
  const gridStandard = document.getElementById("fd-grid-standard");
  const gridCustom = document.getElementById("fd-grid-custom");
  const emptyMsg = document.getElementById("fd-empty");
  const search = document.getElementById("fd-search") as HTMLInputElement | null;
  const preview = document.getElementById("fd-preview-img") as HTMLImageElement | null;
  const hint3d = document.getElementById("fd-hint");
  const hintPhoto = document.getElementById("fd-photo-hint");
  const quoteLink = document.getElementById("fd-quote") as HTMLAnchorElement | null;
  const camToggle = document.getElementById("fd-cam-toggle") as HTMLButtonElement | null;
  const loading = document.getElementById("fd-loading");
  const btn3d = document.getElementById("fd-mode-3d") as HTMLButtonElement | null;
  const btnPhoto = document.getElementById("fd-mode-photo") as HTMLButtonElement | null;
  const photoCanvas = document.getElementById("fd-photo-canvas") as HTMLCanvasElement | null;
  const photoToolbar = document.getElementById("fd-photo-toolbar");
  const photoFile = document.getElementById("fd-photo-file") as HTMLInputElement | null;
  const photoUndo = document.getElementById("fd-photo-undo") as HTMLButtonElement | null;
  const photoDone = document.getElementById("fd-photo-done") as HTMLButtonElement | null;
  const photoResetOutline = document.getElementById("fd-photo-reset-outline") as HTMLButtonElement | null;
  const photoClear = document.getElementById("fd-photo-clear") as HTMLButtonElement | null;
  const photoStatus = document.getElementById("fd-photo-status");
  const shareBtn = document.getElementById("fd-share") as HTMLButtonElement | null;
  const saveBtn = document.getElementById("fd-save") as HTMLButtonElement | null;

  if (
    !viewport || !sectionStandard || !sectionCustom || !gridStandard || !gridCustom ||
    !search || !preview || !quoteLink ||
    !btn3d || !btnPhoto || !photoCanvas || !photoToolbar ||
    !photoFile || !photoUndo || !photoDone || !photoResetOutline ||
    !photoClear || !photoStatus || !shareBtn || !saveBtn
  ) {
    console.error("Floor Designer: missing required DOM nodes");
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const requested = params.get("finish");
  const initial = (requested ? getFinishById(requested) : undefined) ?? FLOOR_FINISHES[0]!;
  let selectedFinish = initial;
  let mode: Mode = "3d";

  const setQuoteHref = (finish: FloorFinish): void => {
    const url = new URL(QUOTE_BASE);
    url.searchParams.set("finish", finish.id);
    quoteLink.href = url.toString();
  };

  const setPreview = (finish: FloorFinish): void => {
    preview.src = finish.texture;
    preview.alt = `${finish.name} flake sample`;
  };

  setPreview(initial);
  setQuoteHref(initial);

  let garage: Garage | undefined;
  let photo: PhotoMode | undefined;
  let photoModulePromise: Promise<PhotoMode> | null = null;

  const ensurePhotoMode = (): Promise<PhotoMode> => {
    if (photo) return Promise.resolve(photo);
    if (!photoModulePromise) {
      photoModulePromise = import("./photo/photo").then(({ mountPhotoMode }) => {
        photo = mountPhotoMode({
          canvas: photoCanvas,
          hint: hintPhoto,
          toolbar: {
            file: photoFile,
            undo: photoUndo,
            done: photoDone,
            resetOutline: photoResetOutline,
            clear: photoClear,
            status: photoStatus,
          },
          initialFinish: selectedFinish,
        });
        return photo;
      });
    }
    return photoModulePromise;
  };

  const selectFinish = (finish: FloorFinish): void => {
    if (finish.id === selectedFinish.id) return;
    selectedFinish = finish;

    const url = new URL(window.location.href);
    url.searchParams.set("finish", finish.id);
    window.history.replaceState({}, "", url);

    setPreview(finish);
    setQuoteHref(finish);
    setActiveTile(allTiles, finish.id);

    void garage?.setFinish(finish);
    if (photo) void photo.setFinish(finish);
  };

  const tilesStandard = buildFinishGrid(gridStandard, STANDARD_FINISHES, selectFinish);
  const tilesCustom = buildFinishGrid(gridCustom, CUSTOM_FINISHES, selectFinish);
  const allTiles = [...tilesStandard, ...tilesCustom];
  const sectionGroups: SectionGroup[] = [
    { section: sectionStandard, tiles: tilesStandard },
    { section: sectionCustom, tiles: tilesCustom },
  ];
  setActiveTile(allTiles, selectedFinish.id);

  search.addEventListener("input", () => applySearchFilter(sectionGroups, search.value, emptyMsg));

  let hideHint = false;
  const maybeHideHint = (): void => {
    if (hideHint || !hint3d) return;
    hideHint = true;
    hint3d.classList.add("fd-hint--hide");
    setTimeout(() => hint3d.remove(), 400);
  };
  viewport.addEventListener("pointerdown", maybeHideHint, { once: true });

  const setMode = async (next: Mode): Promise<void> => {
    if (next === mode) return;
    mode = next;
    const isPhoto = next === "photo";

    btn3d.classList.toggle("fd-mode-btn--active", !isPhoto);
    btn3d.setAttribute("aria-selected", isPhoto ? "false" : "true");
    btnPhoto.classList.toggle("fd-mode-btn--active", isPhoto);
    btnPhoto.setAttribute("aria-selected", isPhoto ? "true" : "false");

    if (shell) shell.dataset.fdMode = next;

    viewport.style.display = isPhoto ? "none" : "";
    photoCanvas.hidden = !isPhoto;
    photoToolbar.hidden = !isPhoto;
    if (hint3d) hint3d.style.display = isPhoto ? "none" : "";
    if (camToggle) camToggle.style.display = isPhoto ? "none" : "";
    if (hintPhoto) hintPhoto.hidden = !isPhoto;

    garage?.setPaused(isPhoto);

    if (isPhoto) {
      const p = await ensurePhotoMode();
      p.setActive(true);
    } else {
      photo?.setActive(false);
    }
  };

  btn3d.addEventListener("click", () => void setMode("3d"));
  btnPhoto.addEventListener("click", () => void setMode("photo"));

  // Saved design deep-link: /d/<8-char-id>. Hydrate the photo viewport
  // before the user can interact with anything.
  const savedDesignMatch = window.location.pathname.match(/^\/d\/([0-9A-Za-z]{8})$/);
  const hydrationPromise = savedDesignMatch
    ? hydrateSavedDesign(savedDesignMatch[1]!).catch((err) => {
        console.error("Hydration failed", err);
        if (loading) {
          const msg = err?.message === "design-not-found" ? "We couldn't find that saved design — the link may be wrong or it has been removed."
            : err?.message === "design-expired" ? "This saved design has expired and is no longer available."
            : "Couldn't load that saved design. Try a fresh start.";
          loading.innerHTML = `<span class="fd-loading__label">${msg}</span>`;
          window.setTimeout(() => loading.remove(), 4500);
        }
      })
    : Promise.resolve();

  async function hydrateSavedDesign(designId: string): Promise<void> {
    if (loading) {
      loading.innerHTML = `<span class="fd-loading__spinner" aria-hidden="true"></span><span class="fd-loading__label">Loading your saved design…</span>`;
    }
    const metaRes = await fetch(`/api/designs/${designId}`);
    if (metaRes.status === 404) throw new Error("design-not-found");
    if (metaRes.status === 410) throw new Error("design-expired");
    if (!metaRes.ok) throw new Error("design-fetch-failed");
    const meta = (await metaRes.json()) as {
      flake_id: string | null;
      mask_data: { polygon: [number, number][] } | null;
      photo_url: string | null;
    };

    if (meta.flake_id) {
      const finish = getFinishById(meta.flake_id);
      if (finish) selectFinish(finish);
    }

    if (meta.photo_url) {
      const photoRes = await fetch(meta.photo_url);
      if (!photoRes.ok) throw new Error("photo-fetch-failed");
      const photoBlob = await photoRes.blob();
      await setMode("photo");
      const polygon = meta.mask_data?.polygon ?? [];
      await photo!.loadDesign({ photoBlob, polygon, closed: polygon.length >= 3 });
    }
  }

  // Lazy-load Three.js + scene module after first paint so the flake grid
  // and search render immediately, before the ~600 KB graphics chunk arrives.
  // Runs in parallel with hydration so /d/:id deep-links don't block on 3D.
  const garagePromise = (async (): Promise<void> => {
    const { mountGarage } = await import("./scene/garage");
    garage = mountGarage(viewport);
    await garage.setFinish(selectedFinish);
  })();

  // If we deep-linked into a saved design, the overlay clears as soon as
  // hydration is done — the 3D scene continues mounting in the background
  // and will be ready when the user switches to that tab.
  if (savedDesignMatch) {
    await hydrationPromise;
    loading?.remove();
    garagePromise.catch((err) => console.error("3D scene mount failed (deferred)", err));
  } else {
    try {
      await garagePromise;
    } catch (err) {
      console.error("Failed to mount 3D scene", err);
      if (loading) {
        loading.innerHTML = `<span class="fd-loading__label">3D preview failed to load. Try refreshing — if the problem continues, this device may not support WebGL.</span>`;
      }
      return;
    }
    loading?.remove();
  }

  // Cam toggle wiring needs the garage to exist; bail if mount failed.
  if (!garage) return;

  if (camToggle) {
    const labelEl = camToggle.querySelector(".fd-cam-toggle__label") as HTMLElement | null;
    const iconEl = camToggle.querySelector(".fd-cam-toggle__icon") as HTMLElement | null;
    const updateCamUi = (): void => {
      const isFree = garage!.getCameraMode() === "free";
      camToggle.setAttribute("aria-pressed", isFree ? "true" : "false");
      if (labelEl) labelEl.textContent = isFree ? "Free look: On" : "Free look: Off";
      if (iconEl) iconEl.textContent = isFree ? "◉" : "▶";
    };
    camToggle.addEventListener("click", () => {
      const next = garage!.getCameraMode() === "tour" ? "free" : "tour";
      garage!.setCameraMode(next);
      updateCamUi();
    });
    updateCamUi();
  }

  // -----------------------------------------------------------------
  // Share + Save image
  // -----------------------------------------------------------------
  const flashButton = (btn: HTMLButtonElement, text: string, ms = 1800): void => {
    const original = btn.dataset.originalText ?? btn.textContent ?? "";
    if (!btn.dataset.originalText) btn.dataset.originalText = original;
    btn.textContent = text;
    btn.classList.add("fd-btn--flash");
    window.setTimeout(() => {
      btn.textContent = btn.dataset.originalText ?? original;
      btn.classList.remove("fd-btn--flash");
    }, ms);
  };

  shareBtn.addEventListener("click", async () => {
    const ok = await copyTextToClipboard(window.location.href);
    flashButton(shareBtn, ok ? "Link copied!" : "Copy failed — long-press to copy");
  });

  saveBtn.addEventListener("click", async () => {
    let source: HTMLCanvasElement | null = null;
    if (mode === "photo") {
      source = photo?.captureCleanCanvas() ?? null;
      if (!source) {
        flashButton(saveBtn, "Upload a photo first");
        return;
      }
    } else if (garage) {
      source = garage.captureCanvas();
    }
    if (!source) {
      flashButton(saveBtn, "Nothing to save yet");
      return;
    }
    try {
      const branded = composeBrandedCanvas({
        source,
        finishName: selectedFinish.name,
        finishCategory: selectedFinish.category,
      });
      await downloadCanvasAsPng(branded, buildScreenshotFilename(selectedFinish.id));
      flashButton(saveBtn, "Saved");
    } catch (err) {
      console.error("Save image failed", err);
      flashButton(saveBtn, "Save failed — try again");
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void init());
} else {
  void init();
}
