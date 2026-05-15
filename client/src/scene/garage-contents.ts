/**
 * Curated set of typical American residential garage items, restyled to match
 * the modern arch-viz reference (dark charcoal slab cabinets, matte-black
 * shelving and pegboard, polished epoxy floor) and arranged so that:
 *
 *   - The LEFT wall is left empty (the TV + cabinet built in garageScene.ts
 *     own that wall and stay untouched).
 *   - The RIGHT wall becomes the storage zone: workbench, pegboard, wall
 *     cabinets with under-cabinet LED, rolling tool chest, free-standing
 *     shelving, stacked moving boxes.
 *   - The BACK WALL is dominated by the centered garage door (built in
 *     garageScene.ts). To the right of the door we add a wall-leaning bike
 *     and step ladder; to the left, a sports-gear cluster (golf bag,
 *     basketball, soccer ball, backpack on a hook).
 *   - The cooler, trash + recycle bins, and shop vacuum stay on the floor
 *     against the right wall (front of the room).
 */
import {
  Scene,
  Group,
  Mesh,
  BoxGeometry,
  PlaneGeometry,
  CylinderGeometry,
  SphereGeometry,
  TorusGeometry,
  MeshStandardMaterial,
  MeshBasicMaterial,
  CanvasTexture,
  Color,
  DoubleSide,
  SRGBColorSpace,
  TextureLoader,
  type Material,
  type BufferGeometry,
  type Texture,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type ContentsOpts = {
  W: number;
  D: number;
  H: number;
  /** Geometry/material/texture trackers shared with the parent scene for disposal. */
  materials: Material[];
  geometries: BufferGeometry[];
  textures: Texture[];
};

export function addGarageContents(scene: Scene, opts: ContentsOpts): void {
  const { W, D, materials, geometries, textures } = opts;
  const halfW = W / 2; // right wall x
  const halfD = D / 2; // back wall is at z = -halfD
  const backZ = -halfD;
  const rWallX = halfW;

  const M = <T extends Material>(m: T): T => {
    materials.push(m);
    return m;
  };
  const G = <T extends BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const std = (params: ConstructorParameters<typeof MeshStandardMaterial>[0]) =>
    M(new MeshStandardMaterial(params));

  // ---------- Material palette (dark slab + metals + accents) ----------
  const woodTop = std({ color: new Color(0xb88a4e), roughness: 0.6, metalness: 0.05 });
  const woodHandle = std({ color: new Color(0xa07849), roughness: 0.7, metalness: 0.05 });

  // Charcoal slab — replaces the old cabWhite for both workbench base and uppers
  const cabDark = std({
    color: new Color(0x2c2f33),
    roughness: 0.45,
    metalness: 0.25,
    envMapIntensity: 0.75,
  });
  const cabHandle = std({
    color: new Color(0xb8bcc1),
    roughness: 0.3,
    metalness: 0.7,
    envMapIntensity: 1.0,
  });
  const steelDark = std({
    color: new Color(0x55595f),
    roughness: 0.4,
    metalness: 0.7,
    envMapIntensity: 0.85,
  });
  const handleSilver = std({
    color: new Color(0xa8adb4),
    roughness: 0.4,
    metalness: 0.55,
  });
  const aluminum = std({
    color: new Color(0xc6cad0),
    roughness: 0.35,
    metalness: 0.65,
    envMapIntensity: 0.95,
  });
  const chrome = std({
    color: new Color(0xc8ccd0),
    roughness: 0.2,
    metalness: 0.85,
    envMapIntensity: 1.05,
  });
  const toolRed = std({
    color: new Color(0xb02828),
    roughness: 0.35,
    metalness: 0.45,
    envMapIntensity: 0.7,
  });
  const toolDark = std({ color: new Color(0x222428), roughness: 0.4, metalness: 0.5 });
  // Matte black industrial pegboard + shelving frame
  const pegDark = std({ color: new Color(0x16181c), roughness: 0.85, metalness: 0.05 });
  const shelvingMat = std({
    color: new Color(0x14161a),
    roughness: 0.55,
    metalness: 0.45,
    envMapIntensity: 0.7,
  });
  const binNavy = std({ color: new Color(0x36507a), roughness: 0.55, metalness: 0.05 });
  const binGray = std({ color: new Color(0x2a2c30), roughness: 0.6, metalness: 0.05 });
  const cardboard = std({ color: new Color(0xc89668), roughness: 0.85, metalness: 0 });
  const cardboardTape = std({ color: new Color(0x8c6740), roughness: 0.8, metalness: 0 });
  const tireBlack = std({ color: new Color(0x18181a), roughness: 0.92, metalness: 0.05 });
  const bikeFrame = std({
    color: new Color(0x1f5670),
    roughness: 0.4,
    metalness: 0.55,
    envMapIntensity: 0.9,
  });
  const ballOrange = std({ color: new Color(0xc66628), roughness: 0.7, metalness: 0 });
  const ballSoccerWhite = std({ color: new Color(0xf2f3f5), roughness: 0.55, metalness: 0 });
  const ballSoccerDark = std({ color: new Color(0x18181a), roughness: 0.55, metalness: 0 });
  const coolerWhite = std({ color: new Color(0xe6e8eb), roughness: 0.5, metalness: 0.1 });
  const coolerRed = std({ color: new Color(0xa83232), roughness: 0.4, metalness: 0.15 });
  const trashGray = std({ color: new Color(0x2b2d31), roughness: 0.65, metalness: 0.1 });
  const recycleBlue = std({ color: new Color(0x2b4a7a), roughness: 0.55, metalness: 0.1 });
  const golfBag = std({ color: new Color(0x1a1c20), roughness: 0.78, metalness: 0.05 });
  const golfBagAccent = std({ color: new Color(0xb43030), roughness: 0.7, metalness: 0.05 });
  const backpackMat = std({ color: new Color(0x2d3a4d), roughness: 0.78, metalness: 0.05 });

  // Emissive under-cabinet LED — reads as a strip of warm light, will bloom in postprocessing
  const ledStripMat = std({
    color: new Color(0xfff0d6),
    emissive: new Color(0xfff0d6),
    emissiveIntensity: 0.7,
    roughness: 0.6,
    metalness: 0,
  });

  const castAll = (g: Group) => {
    g.traverse((o) => {
      if (o instanceof Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  };

  // ====================================================================
  // RIGHT WALL — storage / workshop zone (workbench, pegboard, cabinets,
  // tool chest, shelving, boxes). Items sit at +halfW and face -X.
  // ====================================================================

  // ---------- Workbench (cabinet base + butcher block top) ----------
  {
    const benchZLength = 3.2; // along Z (the wall)
    const benchDepth = 0.7; // perpendicular to wall (extends in -X)
    const benchH = 0.9;
    const cz = -4.5; // workbench Z center (back portion of right wall)
    const benchCenterX = rWallX - benchDepth / 2 - 0.04;
    const benchFrontX = rWallX - benchDepth - 0.04;

    const base = new Mesh(
      G(new BoxGeometry(benchDepth - 0.04, benchH - 0.06, benchZLength - 0.04)),
      cabDark,
    );
    base.position.set(benchCenterX, (benchH - 0.06) / 2, cz);
    base.castShadow = true;
    base.receiveShadow = true;
    scene.add(base);

    // Vertical seam between two cabinet doors
    const seam = new Mesh(
      G(new BoxGeometry(0.012, benchH - 0.1, 0.012)),
      steelDark,
    );
    seam.position.set(benchFrontX + 0.005, benchH * 0.5, cz);
    scene.add(seam);

    // Two pull handles on the front face
    const handleGeo = G(new BoxGeometry(0.018, 0.18, 0.018));
    for (const zOff of [-0.95, 0.95]) {
      const h = new Mesh(handleGeo, cabHandle);
      h.position.set(benchFrontX + 0.012, benchH * 0.55, cz + zOff);
      h.castShadow = true;
      scene.add(h);
    }

    // Butcher-block top
    const top = new Mesh(
      G(new BoxGeometry(benchDepth, 0.06, benchZLength)),
      woodTop,
    );
    top.position.set(benchCenterX, benchH + 0.03, cz);
    top.castShadow = true;
    top.receiveShadow = true;
    scene.add(top);

    // Closed toolbox sitting on the bench (rotated so handle aligns with wall)
    const tb = new Mesh(
      G(new RoundedBoxGeometry(0.24, 0.2, 0.42, 3, 0.025)),
      toolRed,
    );
    tb.position.set(benchCenterX, benchH + 0.06 + 0.1, cz + 1.2);
    tb.castShadow = true;
    scene.add(tb);
    const tbHandle = new Mesh(
      G(new BoxGeometry(0.025, 0.025, 0.18)),
      handleSilver,
    );
    tbHandle.position.set(benchCenterX, benchH + 0.06 + 0.225, cz + 1.2);
    scene.add(tbHandle);

    // Mason-jar style container with screws
    const jar = new Mesh(
      G(new CylinderGeometry(0.06, 0.06, 0.16, 18)),
      aluminum,
    );
    jar.position.set(benchCenterX, benchH + 0.06 + 0.08, cz - 1.3);
    jar.castShadow = true;
    scene.add(jar);

    // Modern shop stool in front of workbench (visible reference detail)
    const stool = new Group();
    const seat = new Mesh(
      G(new CylinderGeometry(0.18, 0.16, 0.04, 24)),
      tireBlack,
    );
    seat.position.set(0, 0.6, 0);
    stool.add(seat);
    const post = new Mesh(
      G(new CylinderGeometry(0.025, 0.025, 0.55, 12)),
      steelDark,
    );
    post.position.set(0, 0.3, 0);
    stool.add(post);
    const legGeo = G(new BoxGeometry(0.22, 0.025, 0.04));
    for (let i = 0; i < 5; i++) {
      const a = (Math.PI * 2 * i) / 5;
      const leg = new Mesh(legGeo, steelDark);
      leg.position.set(Math.cos(a) * 0.11, 0.025, Math.sin(a) * 0.11);
      leg.rotation.y = -a;
      stool.add(leg);
    }
    castAll(stool);
    stool.position.set(rWallX - benchDepth - 0.55, 0, cz - 0.4);
    scene.add(stool);
  }

  // ---------- Pegboard above the workbench ----------
  {
    const pegW = 2.4; // along Z (wall direction)
    const pegH = 1.2; // along Y
    const cz = -4.5;
    const cy = 1.7; // between bench top (0.9) and wall cabinet bottom (~2.4)
    const wallFront = rWallX - 0.04;
    const toolX = rWallX - 0.1;

    const board = new Mesh(G(new PlaneGeometry(pegW, pegH)), pegDark);
    board.position.set(wallFront, cy, cz);
    board.rotation.y = -Math.PI / 2;
    board.receiveShadow = true;
    scene.add(board);

    // Hand tools — silhouettes mounted on the pegboard, all facing -X
    // (Original "x along wall" becomes "z along wall"; original "z thickness"
    // becomes "x thickness" in this rotated frame.)

    // Hammer
    const hh = new Mesh(G(new BoxGeometry(0.025, 0.42, 0.04)), woodHandle);
    hh.position.set(toolX, cy + 0.05, cz - 1.05);
    scene.add(hh);
    const hhHead = new Mesh(G(new BoxGeometry(0.045, 0.07, 0.18)), toolDark);
    hhHead.position.set(toolX, cy + 0.3, cz - 1.05);
    scene.add(hhHead);

    // Adjustable wrench
    const wr = new Mesh(G(new BoxGeometry(0.025, 0.45, 0.06)), toolDark);
    wr.position.set(toolX, cy + 0.05, cz - 0.7);
    scene.add(wr);
    const wrHead = new Mesh(G(new BoxGeometry(0.025, 0.07, 0.11)), toolDark);
    wrHead.position.set(toolX, cy + 0.31, cz - 0.7);
    scene.add(wrHead);

    // 3 screwdrivers
    for (let i = 0; i < 3; i++) {
      const z = cz - 0.34 + i * 0.085;
      const handle = new Mesh(
        G(new BoxGeometry(0.03, 0.36, 0.03)),
        i === 1 ? toolRed : woodHandle,
      );
      handle.position.set(toolX, cy + 0.08, z);
      scene.add(handle);
      const tip = new Mesh(G(new BoxGeometry(0.01, 0.18, 0.01)), chrome);
      tip.position.set(toolX, cy - 0.19, z);
      scene.add(tip);
    }

    // Pliers (X) — rotation around X-axis tilts the wall-facing tools
    const pl1 = new Mesh(G(new BoxGeometry(0.025, 0.32, 0.04)), toolDark);
    pl1.rotation.x = -0.18;
    pl1.position.set(toolX, cy, cz + 0.2);
    scene.add(pl1);
    const pl2 = new Mesh(G(new BoxGeometry(0.025, 0.32, 0.04)), toolDark);
    pl2.rotation.x = 0.18;
    pl2.position.set(toolX, cy, cz + 0.2);
    scene.add(pl2);

    // Carpenter's square (L)
    const sq1 = new Mesh(G(new BoxGeometry(0.025, 0.04, 0.32)), aluminum);
    sq1.position.set(toolX, cy + 0.18, cz + 0.7);
    scene.add(sq1);
    const sq2 = new Mesh(G(new BoxGeometry(0.025, 0.32, 0.04)), aluminum);
    sq2.position.set(toolX, cy + 0.04, cz + 0.55);
    scene.add(sq2);

    // Tape measure
    const tape = new Mesh(
      G(new RoundedBoxGeometry(0.06, 0.16, 0.14, 2, 0.022)),
      toolRed,
    );
    tape.position.set(toolX - 0.01, cy - 0.02, cz + 1.1);
    tape.castShadow = true;
    scene.add(tape);
  }

  // ---------- Wall-mounted upper cabinets + LED strip ----------
  {
    const cabW = 1.0; // along Z
    const cabH = 0.85;
    const cabD = 0.4; // perpendicular to wall
    const cy = 2.85;
    const cz = -4.5;
    for (let i = 0; i < 3; i++) {
      const cabZ = cz - 1.0 + i * 1.0;
      const body = new Mesh(
        G(new RoundedBoxGeometry(cabD, cabH, cabW - 0.02, 3, 0.025)),
        cabDark,
      );
      body.position.set(rWallX - cabD / 2 - 0.02, cy, cabZ);
      body.castShadow = true;
      body.receiveShadow = true;
      scene.add(body);

      const handle = new Mesh(
        G(new BoxGeometry(0.018, 0.22, 0.018)),
        cabHandle,
      );
      handle.position.set(
        rWallX - cabD - 0.035,
        cy,
        cabZ + cabW / 2 - 0.1,
      );
      scene.add(handle);
    }

    // Continuous LED strip just under the upper cabinets — bright warm,
    // designed to bloom under UnrealBloomPass.
    const ledLen = 3.05;
    const led = new Mesh(
      G(new BoxGeometry(0.035, 0.03, ledLen)),
      ledStripMat,
    );
    led.position.set(rWallX - cabD - 0.06, cy - cabH / 2 - 0.02, cz);
    scene.add(led);
  }

  // ---------- Rolling tool chest (right wall, in front of workbench) ----------
  {
    const cz = -1.9;
    const lowH = 0.55;
    const upH = 0.45;
    const chestDepth = 0.55;
    const chestWidth = 0.85; // along Z
    const cx = rWallX - chestDepth / 2 - 0.32;

    // Base (charcoal — matches cabinet bank for a unified built-in look)
    const low = new Mesh(
      G(new RoundedBoxGeometry(chestDepth, lowH, chestWidth, 4, 0.025)),
      toolDark,
    );
    low.position.set(cx, 0.07 + lowH / 2, cz);
    low.castShadow = true;
    low.receiveShadow = true;
    scene.add(low);

    // Top section — single red accent, like in the reference
    const up = new Mesh(
      G(new RoundedBoxGeometry(chestDepth - 0.05, upH, chestWidth - 0.07, 4, 0.022)),
      toolRed,
    );
    up.position.set(cx, 0.07 + lowH + upH / 2, cz);
    up.castShadow = true;
    up.receiveShadow = true;
    scene.add(up);

    // Drawer grooves + handles on lower (3 drawers)
    const lowFrontX = cx - chestDepth / 2;
    for (let i = 0; i < 3; i++) {
      const yMid = 0.07 + lowH * (0.18 + i * 0.27);
      const grv = new Mesh(
        G(new BoxGeometry(0.005, 0.008, chestWidth)),
        steelDark,
      );
      grv.position.set(lowFrontX - 0.001, yMid + 0.06, cz);
      scene.add(grv);
      const hdl = new Mesh(
        G(new BoxGeometry(0.012, 0.018, 0.42)),
        handleSilver,
      );
      hdl.position.set(lowFrontX - 0.008, yMid, cz);
      scene.add(hdl);
    }
    // Top section: 2 drawers
    const upFrontX = cx - (chestDepth - 0.05) / 2;
    for (let i = 0; i < 2; i++) {
      const yMid = 0.07 + lowH + upH * (0.25 + i * 0.4);
      const grv = new Mesh(
        G(new BoxGeometry(0.005, 0.008, chestWidth - 0.07)),
        steelDark,
      );
      grv.position.set(upFrontX - 0.001, yMid + 0.06, cz);
      scene.add(grv);
      const hdl = new Mesh(
        G(new BoxGeometry(0.012, 0.018, 0.36)),
        handleSilver,
      );
      hdl.position.set(upFrontX - 0.008, yMid, cz);
      scene.add(hdl);
    }
    // Top tray edge
    const lip = new Mesh(
      G(new BoxGeometry(chestDepth - 0.05, 0.02, chestWidth - 0.07)),
      steelDark,
    );
    lip.position.set(cx, 0.07 + lowH + upH + 0.015, cz);
    scene.add(lip);

    // Caster wheels
    const wheelGeo = G(new CylinderGeometry(0.045, 0.045, 0.05, 14));
    for (const [wx, wz] of [
      [-0.22, -0.35],
      [0.22, -0.35],
      [-0.22, 0.35],
      [0.22, 0.35],
    ] as const) {
      const w = new Mesh(wheelGeo, tireBlack);
      w.rotation.x = Math.PI / 2;
      w.position.set(cx + wx, 0.045, cz + wz);
      scene.add(w);
    }
  }

  // ---------- Free-standing matte-black industrial shelving ----------
  {
    const cz = 0.6; // forward of tool chest
    const shZ = 1.6; // along Z
    const shD = 0.5; // perpendicular to wall
    const shH = 1.95;
    const cx = rWallX - shD / 2 - 0.25;

    const postGeo = G(new BoxGeometry(0.04, shH, 0.04));
    for (const [px, pz] of [
      [-shD / 2, -shZ / 2],
      [shD / 2, -shZ / 2],
      [-shD / 2, shZ / 2],
      [shD / 2, shZ / 2],
    ] as const) {
      const post = new Mesh(postGeo, shelvingMat);
      post.position.set(cx + px, shH / 2, cz + pz);
      post.castShadow = true;
      scene.add(post);
    }
    const shelfGeo = G(new BoxGeometry(shD + 0.08, 0.025, shZ + 0.08));
    for (let i = 0; i < 4; i++) {
      const sh = new Mesh(shelfGeo, shelvingMat);
      sh.position.set(cx, 0.4 + i * 0.5, cz);
      sh.castShadow = true;
      sh.receiveShadow = true;
      scene.add(sh);
    }

    const placeBin = (
      mat: MeshStandardMaterial,
      d: number,
      h: number,
      w: number,
      sz: number,
      shelfTopY: number,
    ) => {
      const bin = new Mesh(G(new RoundedBoxGeometry(d, h, w, 2, 0.025)), mat);
      bin.position.set(cx, shelfTopY + h / 2 + 0.013, cz + sz);
      bin.castShadow = true;
      scene.add(bin);
    };

    // Shelf 1 (lowest)
    placeBin(binNavy, 0.42, 0.32, 0.5, -0.4, 0.4);
    placeBin(binGray, 0.42, 0.32, 0.5, 0.2, 0.4);

    // Shelf 2 — bottles + box
    const bottleGeo = G(new CylinderGeometry(0.05, 0.05, 0.22, 16));
    for (const [bz, c] of [
      [-0.55, aluminum],
      [-0.4, aluminum],
      [-0.25, toolRed],
    ] as const) {
      const b = new Mesh(bottleGeo, c);
      b.position.set(cx, 0.9 + 0.13, cz + bz);
      b.castShadow = true;
      scene.add(b);
    }
    placeBin(cardboard, 0.42, 0.3, 0.45, 0.27, 0.9);

    // Shelf 3
    placeBin(binNavy, 0.42, 0.27, 0.45, -0.4, 1.4);
    placeBin(cardboard, 0.42, 0.32, 0.55, 0.27, 1.4);

    // Shelf 4 (top)
    placeBin(cardboard, 0.4, 0.28, 0.45, -0.05, 1.9);
  }

  // ---------- Stacked moving boxes (right wall, forward of shelving) ----------
  {
    const cx = rWallX - 0.34;
    const cz = 2.7;
    // Each: depth (X), height (Y), width along Z
    const sizes: Array<[number, number, number]> = [
      [0.5, 0.42, 0.6],
      [0.46, 0.42, 0.55],
      [0.44, 0.36, 0.5],
    ];
    let y = 0;
    for (let i = 0; i < sizes.length; i++) {
      const [d, h, w] = sizes[i]!;
      const jitterX = (i - 1) * 0.025;
      const jitterZ = (i % 2 === 0 ? 1 : -1) * 0.018;
      const box = new Mesh(
        G(new RoundedBoxGeometry(d, h, w, 2, 0.012)),
        cardboard,
      );
      box.position.set(cx - d / 2 + jitterX, y + h / 2, cz + jitterZ);
      box.rotation.y = (i - 1) * 0.04;
      box.castShadow = true;
      box.receiveShadow = true;
      scene.add(box);

      const tape = new Mesh(
        G(new BoxGeometry(d * 0.85, 0.005, 0.06)),
        cardboardTape,
      );
      tape.position.set(box.position.x, y + h + 0.001, box.position.z);
      tape.rotation.y = box.rotation.y;
      scene.add(tape);
      y += h;
    }
  }

  // ---------- Trash + recycle bins (right wall, front area) ----------
  {
    const binW = 0.46;
    const binH = 0.85;
    const binD = 0.5;
    const trash = new Mesh(
      G(new RoundedBoxGeometry(binD, binH, binW, 3, 0.025)),
      trashGray,
    );
    const lidT = new Mesh(
      G(new RoundedBoxGeometry(binD + 0.02, 0.04, binW + 0.02, 3, 0.018)),
      trashGray,
    );
    trash.position.set(rWallX - binD / 2 - 0.04, binH / 2, 4.2);
    lidT.position.set(trash.position.x, binH + 0.02, trash.position.z);
    trash.castShadow = true;
    trash.receiveShadow = true;
    lidT.castShadow = true;
    scene.add(trash, lidT);

    const recycle = new Mesh(
      G(new RoundedBoxGeometry(binD, binH, binW, 3, 0.025)),
      recycleBlue,
    );
    const lidR = new Mesh(
      G(new RoundedBoxGeometry(binD + 0.02, 0.04, binW + 0.02, 3, 0.018)),
      recycleBlue,
    );
    recycle.position.set(rWallX - binD / 2 - 0.04, binH / 2, 4.2 + binW + 0.06);
    lidR.position.set(recycle.position.x, binH + 0.02, recycle.position.z);
    recycle.castShadow = true;
    recycle.receiveShadow = true;
    lidR.castShadow = true;
    scene.add(recycle, lidR);
  }

  // ---------- Shop vacuum (right wall, further forward) ----------
  {
    const sv = new Group();
    const bodyR = 0.22;
    const bodyH = 0.45;
    const body = new Mesh(
      G(new CylinderGeometry(bodyR, bodyR, bodyH, 28)),
      toolRed,
    );
    body.position.set(0, bodyH / 2 + 0.04, 0);
    sv.add(body);
    const top = new Mesh(
      G(new CylinderGeometry(bodyR * 0.85, bodyR * 0.85, 0.18, 28)),
      toolDark,
    );
    top.position.set(0, bodyH + 0.04 + 0.09, 0);
    sv.add(top);
    const handle = new Mesh(
      G(new BoxGeometry(0.025, 0.18, 0.025)),
      toolDark,
    );
    handle.position.set(0, bodyH + 0.18 + 0.04 + 0.08, 0);
    sv.add(handle);
    const hose = new Mesh(
      G(new TorusGeometry(0.16, 0.025, 8, 24, Math.PI * 1.4)),
      toolDark,
    );
    hose.rotation.y = Math.PI / 2;
    hose.position.set(0, bodyH + 0.04 + 0.16, 0.05);
    sv.add(hose);
    const wheelGeo = G(new CylinderGeometry(0.04, 0.04, 0.05, 14));
    for (const [wx, wz] of [
      [-bodyR * 0.7, 0],
      [bodyR * 0.7, 0],
    ] as const) {
      const w = new Mesh(wheelGeo, tireBlack);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.04, wz);
      sv.add(w);
    }
    castAll(sv);
    sv.position.set(rWallX - bodyR - 0.1, 0, 5.8);
    scene.add(sv);
  }

  // ====================================================================
  // BACK WALL — sports cluster (left of door) and bike + ladder (right)
  // The garage door spans roughly x âˆˆ [-2.7, +2.7] at z = backZ.
  // ====================================================================

  // ---------- Wall-leaning bicycle (back wall, right of door) ----------
  // Built in its natural orientation:
  //   +X = bike length (front of bike is +X)
  //   +Y = up
  //   +Z = wheel axle direction (perpendicular to bike's frame plane)
  // Frame and wheels both live in the XY plane. Leaning against the back
  // wall (at z = backZ) is a small rotation around the X-axis, which tips
  // +Y toward -Z.
  {
    const bike = new Group();
    const wheelR = 0.34;
    const tireR = 0.035;
    const wheelbase = 1.05;
    const frontX = wheelbase / 2;
    const rearX = -wheelbase / 2;

    // Tires (torus in XY plane = wheel facing +Z, axle along Z) ------------
    const tireGeo = G(new TorusGeometry(wheelR, tireR, 12, 36));
    const frontTire = new Mesh(tireGeo, tireBlack);
    frontTire.position.set(frontX, wheelR, 0);
    bike.add(frontTire);
    const rearTire = new Mesh(tireGeo, tireBlack);
    rearTire.position.set(rearX, wheelR, 0);
    bike.add(rearTire);

    // Hubs + radial spokes for each wheel ----------------------------------
    const hubGeo = G(new CylinderGeometry(0.04, 0.04, 0.07, 14));
    const spokeLen = wheelR - 0.045;
    const spokeGeo = G(new CylinderGeometry(0.006, 0.006, spokeLen, 6));
    const addWheelSpokes = (cx: number, cy: number) => {
      const hub = new Mesh(hubGeo, chrome);
      hub.rotation.x = Math.PI / 2; // cylinder Y axis -> Z
      hub.position.set(cx, cy, 0);
      bike.add(hub);
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const spoke = new Mesh(spokeGeo, chrome);
        spoke.position.set(
          cx + Math.cos(angle) * spokeLen * 0.5,
          cy + Math.sin(angle) * spokeLen * 0.5,
          0,
        );
        // cylinder default axis is +Y; rotate around Z so it points along
        // the radial direction at `angle`.
        spoke.rotation.z = angle - Math.PI / 2;
        bike.add(spoke);
      }
    };
    addWheelSpokes(frontX, wheelR);
    addWheelSpokes(rearX, wheelR);

    // Frame triangles ------------------------------------------------------
    const tubeR = 0.028;
    const tubeMat = bikeFrame;
    const addTube = (
      ax: number,
      ay: number,
      bx: number,
      by: number,
      radius: number = tubeR,
    ) => {
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy);
      const tube = new Mesh(
        G(new CylinderGeometry(radius, radius, len, 12)),
        tubeMat,
      );
      tube.position.set((ax + bx) / 2, (ay + by) / 2, 0);
      tube.rotation.z = Math.atan2(dy, dx) - Math.PI / 2;
      bike.add(tube);
      return tube;
    };

    // Reference points (in XY plane, on the bike's centerline)
    const bb = { x: -0.05, y: wheelR * 0.5 }; // bottom bracket
    const seatTop = { x: -0.18, y: wheelR + 0.55 }; // top of seat tube
    const headTop = { x: 0.42, y: wheelR + 0.32 }; // top of head tube
    const headBot = { x: 0.5, y: wheelR + 0.05 }; // bottom of head tube

    addTube(bb.x, bb.y, seatTop.x, seatTop.y); // seat tube
    addTube(bb.x, bb.y, headBot.x, headBot.y); // down tube
    addTube(seatTop.x, seatTop.y, headTop.x, headTop.y); // top tube
    addTube(headBot.x, headBot.y, headTop.x, headTop.y, 0.032); // head tube
    addTube(bb.x, bb.y, rearX, wheelR); // chainstay
    addTube(seatTop.x, seatTop.y, rearX, wheelR); // seat stay
    addTube(headBot.x, headBot.y, frontX, wheelR, 0.024); // front fork

    // Saddle (sits above seat tube top) ------------------------------------
    const saddle = new Mesh(
      G(new RoundedBoxGeometry(0.26, 0.05, 0.11, 2, 0.025)),
      tireBlack,
    );
    saddle.position.set(seatTop.x - 0.04, seatTop.y + 0.04, 0);
    saddle.rotation.z = -0.05;
    bike.add(saddle);

    // Stem + handlebars (handlebar runs along Z, perpendicular to frame) --
    const stem = new Mesh(
      G(new BoxGeometry(0.13, 0.045, 0.045)),
      tubeMat,
    );
    stem.position.set(headTop.x + 0.05, headTop.y + 0.04, 0);
    bike.add(stem);

    const bar = new Mesh(
      G(new CylinderGeometry(0.018, 0.018, 0.46, 14)),
      tubeMat,
    );
    bar.rotation.x = Math.PI / 2; // along Z
    bar.position.set(headTop.x + 0.1, headTop.y + 0.04, 0);
    bike.add(bar);

    const gripGeo = G(new CylinderGeometry(0.026, 0.026, 0.09, 12));
    const grip1 = new Mesh(gripGeo, tireBlack);
    grip1.rotation.x = Math.PI / 2;
    grip1.position.set(headTop.x + 0.1, headTop.y + 0.04, 0.18);
    bike.add(grip1);
    const grip2 = new Mesh(gripGeo, tireBlack);
    grip2.rotation.x = Math.PI / 2;
    grip2.position.set(headTop.x + 0.1, headTop.y + 0.04, -0.18);
    bike.add(grip2);

    // Chainring (small chrome disc beside the bottom bracket) -------------
    const cring = new Mesh(
      G(new CylinderGeometry(0.085, 0.085, 0.012, 22)),
      chrome,
    );
    cring.rotation.x = Math.PI / 2;
    cring.position.set(bb.x, bb.y, 0.045);
    bike.add(cring);

    // Crank arm + pedal (just enough silhouette) --------------------------
    const crank = new Mesh(
      G(new BoxGeometry(0.16, 0.022, 0.018)),
      chrome,
    );
    crank.rotation.z = -0.6;
    crank.position.set(bb.x + 0.05, bb.y - 0.05, 0.06);
    bike.add(crank);

    castAll(bike);
    // Lean toward back wall (-Z): top of bike (+y) tips toward -z.
    bike.rotation.x = 0.13;
    bike.position.set(5.0, 0, backZ + 0.5);
    scene.add(bike);
  }

  // ---------- Aluminum step ladder (back wall, right of door, leaning) ----------
  {
    const ladder = new Group();
    const railH = 2.6;
    const railGeo = G(new BoxGeometry(0.06, railH, 0.06));
    const rL = new Mesh(railGeo, aluminum);
    rL.position.set(-0.18, railH / 2, 0);
    ladder.add(rL);
    const rR = new Mesh(railGeo, aluminum);
    rR.position.set(0.18, railH / 2, 0);
    ladder.add(rR);
    const rungGeo = G(new BoxGeometry(0.4, 0.04, 0.04));
    for (let i = 0; i < 6; i++) {
      const rung = new Mesh(rungGeo, aluminum);
      rung.position.set(0, 0.32 + i * 0.42, 0.05);
      ladder.add(rung);
    }
    castAll(ladder);
    ladder.position.set(7.0, 0, backZ + 0.45);
    ladder.rotation.x = -0.16;
    scene.add(ladder);
  }

  // ---------- Sports gear cluster (back wall, left of door) ----------
  {
    const wallFront = backZ + 0.05;
    const hookFront = backZ + 0.03;

    // Golf bag — tall cylinder leaning against back wall
    const bag = new Group();
    const bagH = 1.2;
    const bagBody = new Mesh(
      G(new CylinderGeometry(0.18, 0.16, bagH, 24)),
      golfBag,
    );
    bagBody.position.set(0, bagH / 2, 0);
    bag.add(bagBody);
    // Red accent stripe near bottom
    const bagStripe = new Mesh(
      G(new CylinderGeometry(0.183, 0.165, 0.1, 24)),
      golfBagAccent,
    );
    bagStripe.position.set(0, 0.32, 0);
    bag.add(bagStripe);
    // Top opening (darker disc)
    const bagTop = new Mesh(
      G(new CylinderGeometry(0.18, 0.18, 0.04, 24)),
      tireBlack,
    );
    bagTop.position.set(0, bagH + 0.02, 0);
    bag.add(bagTop);
    // Club shafts poking out the top (3 thin rods)
    for (let i = 0; i < 3; i++) {
      const shaft = new Mesh(
        G(new CylinderGeometry(0.008, 0.008, 0.55, 8)),
        chrome,
      );
      shaft.position.set(
        Math.cos((i / 3) * Math.PI * 2) * 0.07,
        bagH + 0.27,
        Math.sin((i / 3) * Math.PI * 2) * 0.07,
      );
      bag.add(shaft);
      const head = new Mesh(
        G(new BoxGeometry(0.05, 0.04, 0.025)),
        toolDark,
      );
      head.position.set(shaft.position.x, bagH + 0.55, shaft.position.z);
      bag.add(head);
    }
    castAll(bag);
    bag.rotation.x = 0.16; // lean back
    bag.position.set(-3.7, 0, backZ + 0.32);
    scene.add(bag);

    // Wall hook geometry (re-used below for the backpack hook).
    const hookGeo = G(new BoxGeometry(0.04, 0.025, 0.05));

    // Backpack hanging on a hook
    const hookB = new Mesh(hookGeo, steelDark);
    hookB.position.set(-5.4, 2.4, hookFront);
    scene.add(hookB);
    const pack = new Group();
    const packBody = new Mesh(
      G(new RoundedBoxGeometry(0.4, 0.55, 0.16, 3, 0.04)),
      backpackMat,
    );
    packBody.position.set(0, 0, 0);
    pack.add(packBody);
    const packPocket = new Mesh(
      G(new RoundedBoxGeometry(0.32, 0.22, 0.08, 3, 0.025)),
      backpackMat,
    );
    packPocket.position.set(0, -0.12, 0.085);
    pack.add(packPocket);
    castAll(pack);
    pack.position.set(-5.4, 2.05, wallFront + 0.08);
    scene.add(pack);

    // Basketball + soccer ball on the floor in the corner
    const basketball = new Mesh(
      G(new SphereGeometry(0.12, 22, 18)),
      ballOrange,
    );
    basketball.position.set(-6.3, 0.12, backZ + 0.4);
    basketball.castShadow = true;
    basketball.receiveShadow = true;
    scene.add(basketball);

    // Stylised soccer ball: white sphere + a few dark patches via small spheres
    const soccer = new Group();
    const sBase = new Mesh(
      G(new SphereGeometry(0.115, 22, 18)),
      ballSoccerWhite,
    );
    soccer.add(sBase);
    const patchGeo = G(new SphereGeometry(0.038, 10, 8));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const patch = new Mesh(patchGeo, ballSoccerDark);
      patch.position.set(
        Math.cos(a) * 0.092,
        Math.sin(a * 1.3) * 0.06,
        Math.sin(a) * 0.092,
      );
      soccer.add(patch);
    }
    castAll(soccer);
    soccer.position.set(-7.0, 0.115, backZ + 0.55);
    scene.add(soccer);
  }

  // ---------- Cooler on the floor near the back-right corner ----------
  {
    const cool = new Group();
    const w = 0.62;
    const h = 0.4;
    const d = 0.4;
    const body = new Mesh(
      G(new RoundedBoxGeometry(d, h - 0.06, w, 3, 0.025)),
      coolerWhite,
    );
    body.position.set(0, (h - 0.06) / 2, 0);
    cool.add(body);
    const lid = new Mesh(
      G(new RoundedBoxGeometry(d + 0.02, 0.06, w + 0.02, 3, 0.018)),
      coolerRed,
    );
    lid.position.set(0, h - 0.03, 0);
    cool.add(lid);
    const hdl = new Mesh(
      G(new BoxGeometry(0.02, 0.025, w * 0.55)),
      handleSilver,
    );
    hdl.position.set(d / 2 - 0.012, h * 0.55, 0);
    cool.add(hdl);
    castAll(cool);
    // Back-right corner area, in front of the back wall but pulled out a bit
    cool.position.set(rWallX - d / 2 - 1.4, 0, backZ + 0.45);
    cool.rotation.y = -0.12;
    scene.add(cool);
  }

  // ====================================================================
  // BACK WALL — company logo mounted above the garage door, centered.
  // The logo PNG (transparent shield + wordmark from the site header) is
  // applied to a plane that's pulled 2cm proud of the back wall so it
  // reads as a wall sign above the door without z-fighting.
  // ====================================================================
  {
    // Logo geometry: real PNG aspect is roughly 1024:366 (~2.8:1).
    // Sized to read as a tasteful sign above the door rather than dominate
    // the back wall.
    const logoW = 2.0;
    const logoH = logoW / 2.8; // ~0.71
    // Unlit material with alphaTest — the logo reads as a crisp printed
    // sign that never gets darkened by the room lighting, and alphaTest
    // (instead of `transparent: true`) cuts the alpha cleanly so we don't
    // get semi-transparent edge artifacts against the wall.
    const logoMat = new MeshBasicMaterial({
      color: new Color(0xffffff),
      side: DoubleSide,
      transparent: false,
      alphaTest: 0.5,
      depthWrite: true,
      toneMapped: false,
    });
    materials.push(logoMat);
    const logoPlane = new Mesh(G(new PlaneGeometry(logoW, logoH)), logoMat);
    // Back wall is at z = backZ (= -halfD), normal +Z toward camera.
    // PlaneGeometry default normal is +Z, so no rotation needed.
    // Door frame top sits around y ≈ 3.7; ceiling at y = H. Place the
    // logo centered between them with a hair of clearance.
    logoPlane.position.set(0, 4.2, backZ + 0.02);
    scene.add(logoPlane);

    // Async logo texture load — site-root path works in both dev (Vite
    // middleware) and production. Once decoded we attach it to the plane
    // material and push the texture into the parent's tracker so it
    // disposes alongside the rest of the scene.
    const logoLoader = new TextureLoader();
    logoLoader.load(
      '/images/logo-no-background.png',
      (tex) => {
        tex.colorSpace = SRGBColorSpace;
        tex.anisotropy = 8;
        logoMat.map = tex;
        logoMat.needsUpdate = true;
        textures.push(tex);
      },
      undefined,
      () => {
        // Texture missing — leave the plane white so the wall still
        // renders gracefully; failure intentionally silent in production.
      },
    );
  }

  // ====================================================================
  // LEFT WALL — branded contact billboard. Single canvas texture on a
  // thin red panel mounted to the left wall in the open area near the
  // front of the room. The canvas paints the red field, CTA copy, phone
  // and email; the logo PNG is composited into a white inset at the top
  // once it asynchronously loads.
  // ====================================================================
  {
    // Sized to fill the left wall floor-to-ceiling with thin clearance
    // above the base trim and below the cove LED, and wider so it spans
    // a generous portion of the wall length.
    const billboardW = 6.0;
    const billboardH = 4.7;
    const cw = 2048;
    const ch = Math.round((cw * billboardH) / billboardW); // ~1604

    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');

    const insetMargin = 64;
    const insetW = cw - insetMargin * 2;
    const insetH = Math.round(ch * 0.28);
    const insetX = insetMargin;
    const insetY = insetMargin;

    const drawBillboard = (logoImg?: HTMLImageElement) => {
      if (!ctx) return;
      // Brand red field
      ctx.fillStyle = '#a81818';
      ctx.fillRect(0, 0, cw, ch);

      // Subtle vertical highlight band so the panel doesn't read as flat
      const grad = ctx.createLinearGradient(0, 0, 0, ch);
      grad.addColorStop(0, 'rgba(255,255,255,0.06)');
      grad.addColorStop(0.5, 'rgba(0,0,0,0.0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.18)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, cw, ch);

      // Composite the logo PNG directly onto the red field (no white
      // backing plate). The PNG has a transparent background so the red
      // shows through behind the wordmark.
      if (logoImg) {
        const padding = 32;
        const maxW = insetW - padding * 2;
        const maxH = insetH - padding * 2;
        const ratio = logoImg.width / logoImg.height;
        let drawW = maxW;
        let drawH = drawW / ratio;
        if (drawH > maxH) {
          drawH = maxH;
          drawW = drawH * ratio;
        }
        const dx = insetX + (insetW - drawW) / 2;
        const dy = insetY + (insetH - drawH) / 2;
        ctx.drawImage(logoImg, dx, dy, drawW, drawH);
      }

      // Text block (CTA + phone + email) in the lower red field
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const textTop = insetY + insetH + 80;
      const textBottom = ch - 64;
      const textCenterX = cw / 2;

      const ctaY = textTop + (textBottom - textTop) * 0.2;
      const phoneY = textTop + (textBottom - textTop) * 0.55;
      const emailY = textTop + (textBottom - textTop) * 0.85;

      // CTA — bold, large
      ctx.font = 'bold 200px "Helvetica Neue", Arial, sans-serif';
      ctx.fillText('Contact Us Today!', textCenterX, ctaY);

      // Phone — bold, slightly smaller
      ctx.font = 'bold 168px "Helvetica Neue", Arial, sans-serif';
      ctx.fillText('\u260E  (847) 999-6330', textCenterX, phoneY);

      // Email — regular weight, smaller still
      ctx.font = '108px "Helvetica Neue", Arial, sans-serif';
      ctx.fillText('info@concreteshieldcoatingsinc.com', textCenterX, emailY);
    };

    drawBillboard();

    const billboardTex = new CanvasTexture(canvas);
    billboardTex.colorSpace = SRGBColorSpace;
    billboardTex.anisotropy = 8;
    textures.push(billboardTex);

    const billboardPanelMat = std({
      map: billboardTex,
      roughness: 0.55,
      metalness: 0.0,
      envMapIntensity: 0.4,
    });

    // Thin physical panel (RoundedBox) so the sign has a slight depth and
    // catches a soft shadow against the wall.
    const panelDepth = 0.04;
    const panelGroup = new Group();

    const back = new Mesh(
      G(new RoundedBoxGeometry(panelDepth, billboardH, billboardW, 3, 0.04)),
      std({ color: new Color(0x6f0e0e), roughness: 0.6, metalness: 0.05 }),
    );
    back.position.set(0, 0, 0);
    panelGroup.add(back);

    // The textured face — a plane sitting just proud of the +X face of
    // the panel. PlaneGeometry default normal is +Z; rotate so it faces
    // +X (into the room from the left wall).
    const face = new Mesh(
      G(new PlaneGeometry(billboardW, billboardH)),
      billboardPanelMat,
    );
    face.rotation.y = Math.PI / 2;
    face.position.set(panelDepth / 2 + 0.001, 0, 0);
    panelGroup.add(face);

    castAll(panelGroup);

    // Place on the LEFT wall (x = -halfW, normal +X). Centered around
    // y = H/2 = 2.5 so the 4.7 m tall sign nests between the base trim
    // (~0.15 m) and the cove LED (~4.85 m) with even clearance.
    panelGroup.position.set(-halfW + panelDepth / 2 + 0.01, 2.5, 3.0);
    scene.add(panelGroup);

    // Async logo load — once decoded, repaint the canvas with the logo
    // composited into the white inset and flag the texture for upload.
    const billboardLogoLoader = new TextureLoader();
    billboardLogoLoader.load(
      '/images/logo-no-background.png',
      (tex) => {
        const img = tex.image as HTMLImageElement | undefined;
        if (img && img.complete !== false) {
          drawBillboard(img);
          billboardTex.needsUpdate = true;
        }
        // We composited the logo bitmap into our canvas; the source GPU
        // texture is no longer needed.
        tex.dispose();
      },
      undefined,
      () => {
        // Logo missing — leave the inset white so the rest of the sign
        // (red background, CTA, phone, email) still renders.
      },
    );
  }
}
