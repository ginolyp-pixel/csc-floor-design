/**
 * High-level garage scene API. Encapsulates Three.js so the entry bundle
 * (main.ts) doesn't pull `three` directly — this module is dynamically
 * imported on demand, keeping the initial JS payload tiny.
 */
import {
  TextureLoader,
  RepeatWrapping,
  SRGBColorSpace,
  LinearMipmapLinearFilter,
} from "three";
import type { Texture } from "three";
import type { FloorFinish } from "../catalog";
import { createFallbackFlakeTexture } from "./fallback-texture";
import { createGarageScene, type GarageContext, type CameraMode } from "./garage-scene";

const TEXTURE_REPEAT = 8;

export type Garage = {
  setFinish(finish: FloorFinish): Promise<void>;
  setCameraMode(mode: CameraMode): void;
  getCameraMode(): CameraMode;
  dispose(): void;
};

function configureFloorTexture(ctx: GarageContext, finish: FloorFinish, tex: Texture): void {
  const maxAniso = ctx.renderer.capabilities.getMaxAnisotropy();
  const prev = ctx.floorMaterial.map;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = Math.min(16, maxAniso);
  tex.generateMipmaps = true;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.repeat.set(TEXTURE_REPEAT, TEXTURE_REPEAT);
  tex.needsUpdate = true;
  ctx.floorMaterial.map = tex;
  ctx.floorMaterial.color.set(0xffffff);
  ctx.floorMaterial.needsUpdate = true;
  prev?.dispose();
}

export function mountGarage(container: HTMLElement): Garage {
  const ctx = createGarageScene(container);
  const loader = new TextureLoader();

  const setFinish = (finish: FloorFinish): Promise<void> =>
    new Promise((resolve) => {
      loader.load(
        finish.texture,
        (tex) => {
          configureFloorTexture(ctx, finish, tex);
          resolve();
        },
        undefined,
        () => {
          const fb = createFallbackFlakeTexture(finish.fallbackHex);
          configureFloorTexture(ctx, finish, fb);
          resolve();
        },
      );
    });

  return {
    setFinish,
    setCameraMode: (m) => ctx.setCameraMode(m),
    getCameraMode: () => ctx.getCameraMode(),
    dispose: () => ctx.dispose(),
  };
}
