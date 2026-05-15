/**
 * Designer entry. Stays Three-free: the 3D scene module is dynamically
 * imported on first paint so the initial JS chunk is small and the UI
 * (flake grid, search) renders before the heavy graphics download.
 */
import { FLOOR_FINISHES, type FloorFinish, getFinishById } from "./catalog";
import type { Garage } from "./scene/garage";

const QUOTE_BASE = "https://www.concreteshieldcoatingsinc.com/contact";

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
  const viewport = document.getElementById("fd-viewport");
  const grid = document.getElementById("fd-grid");
  const search = document.getElementById("fd-search") as HTMLInputElement | null;
  const preview = document.getElementById("fd-preview-img") as HTMLImageElement | null;
  const hint = document.getElementById("fd-hint");
  const quoteLink = document.getElementById("fd-quote") as HTMLAnchorElement | null;
  const camToggle = document.getElementById("fd-cam-toggle") as HTMLButtonElement | null;
  const loading = document.getElementById("fd-loading");

  if (!viewport || !grid || !search || !preview || !quoteLink) {
    console.error("Floor Designer: missing required DOM nodes");
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const requested = params.get("finish");
  const initial = (requested ? getFinishById(requested) : undefined) ?? FLOOR_FINISHES[0]!;
  let selectedId = initial.id;

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

  const tiles = buildFinishGrid(grid, FLOOR_FINISHES, (finish) => {
    selectedId = finish.id;
    setActiveTile(tiles, selectedId);
    setPreview(finish);
    setQuoteHref(finish);
    void garage?.setFinish(finish);
  });
  setActiveTile(tiles, selectedId);

  search.addEventListener("input", () => filterTiles(tiles, search.value));

  let hideHint = false;
  const maybeHideHint = (): void => {
    if (hideHint || !hint) return;
    hideHint = true;
    hint.classList.add("fd-hint--hide");
    setTimeout(() => hint.remove(), 400);
  };
  viewport.addEventListener("pointerdown", maybeHideHint, { once: true });

  // Lazy-load Three.js + scene module after first paint so the flake grid
  // and search render immediately, before the ~400 KB graphics chunk arrives.
  let garage: Garage | undefined;
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
