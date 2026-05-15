/**
 * Designer entry. Stays Three-free: the 3D scene and photo modules are
 * dynamically imported on demand so the initial JS chunk is small and the UI
 * (flake grid, search) renders before the heavy graphics download.
 */
import { FLOOR_FINISHES, type FloorFinish, getFinishById } from "./catalog";
import type { Garage } from "./scene/garage";
import type { PhotoMode } from "./photo/photo";

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

function filterTiles(tiles: HTMLElement[], query: string): void {
  const q = query.trim().toLowerCase();
  for (const t of tiles) {
    const name = (t.querySelector("figcaption")?.textContent ?? "").toLowerCase();
    t.hidden = q.length > 0 && !name.includes(q);
  }
}

async function init(): Promise<void> {
  const shell = document.querySelector(".fd-shell") as HTMLElement | null;
  const viewport = document.getElementById("fd-viewport");
  const grid = document.getElementById("fd-grid");
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

  if (
    !viewport || !grid || !search || !preview || !quoteLink ||
    !btn3d || !btnPhoto || !photoCanvas || !photoToolbar ||
    !photoFile || !photoUndo || !photoDone || !photoResetOutline ||
    !photoClear || !photoStatus
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
    setActiveTile(tiles, finish.id);

    void garage?.setFinish(finish);
    if (photo) void photo.setFinish(finish);
  };

  const tiles = buildFinishGrid(grid, FLOOR_FINISHES, selectFinish);
  setActiveTile(tiles, selectedFinish.id);

  search.addEventListener("input", () => filterTiles(tiles, search.value));

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

  // Lazy-load Three.js + scene module after first paint so the flake grid
  // and search render immediately, before the ~600 KB graphics chunk arrives.
  try {
    const { mountGarage } = await import("./scene/garage");
    garage = mountGarage(viewport);
    await garage.setFinish(initial);
  } catch (err) {
    console.error("Failed to mount 3D scene", err);
    if (loading) {
      loading.innerHTML = `<span class="fd-loading__label">3D preview failed to load. Try refreshing — if the problem continues, this device may not support WebGL.</span>`;
    }
    return;
  } finally {
    loading?.remove();
  }

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
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void init());
} else {
  void init();
}
