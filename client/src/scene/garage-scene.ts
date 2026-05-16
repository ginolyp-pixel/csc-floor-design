import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  ACESFilmicToneMapping,
  SRGBColorSpace,
  PCFSoftShadowMap,
  EquirectangularReflectionMapping,
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
  CanvasTexture,
  RepeatWrapping,
  Mesh,
  PlaneGeometry,
  BoxGeometry,
  CylinderGeometry,
  ConeGeometry,
  SphereGeometry,
  Shape,
  Path,
  ShapeGeometry,
  ExtrudeGeometry,
  MeshStandardMaterial,
  MeshPhysicalMaterial,
  MeshBasicMaterial,
  Color,
  Group,
  PMREMGenerator,
  Vector2,
  Vector3,
  type Texture,
  type Material,
  type BufferGeometry,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { addGarageContents } from './garage-contents';

export type CameraMode = 'tour' | 'free';

export type GarageContext = {
  scene: Scene;
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
  controls: OrbitControls;
  floorMaterial: MeshPhysicalMaterial;
  setPaused: (paused: boolean) => void;
  setCameraMode: (mode: CameraMode) => void;
  getCameraMode: () => CameraMode;
  dispose: () => void;
};

/**
 * Arch-viz garage scene:
 *   - Back wall:  centered roll-up garage door inside a recessed white frame
 *   - Right wall: dark slab cabinets + workbench + shelving (built in
 *                 garageContents.ts)
 *   - Left wall:  wall-mounted TV + low floating cabinet (preserved from the
 *                 prior iteration, untouched)
 *   - Floor:      glossy clearcoated epoxy (texture set by main.ts)
 *   - Lighting:   IBL via RoomEnvironment + cove LED strip + 4 recessed
 *                 SpotLight pot lights + a cool daylight DirectionalLight
 *                 simulating sky bouncing in through the door
 *   - Render:     EffectComposer with SSAO + UnrealBloom + OutputPass
 */

/**
 * Procedural anisotropic streak normal map. Tiles seamlessly. Stretches
 * specular highlights horizontally — exactly the long, soft "wet" lines
 * you see across a polished epoxy showroom floor.
 */
/**
 * Builds a small, real 3D outdoor scene that lives behind the back wall
 * + garage door. Visible through cut-out window holes — gives genuine
 * parallax (trees and horizon shift as the camera moves) instead of a
 * flat painted backplate. All meshes use `MeshBasicMaterial` so they
 * stay bright daylight regardless of indoor lighting/tone-mapping.
 *
 * Returns the disposables it created so the parent scene can clean up.
 */
function addOutdoorScene(
  scene: Scene,
  opts: { halfD: number; halfW: number },
): { materials: Material[]; geometries: BufferGeometry[] } {
  const materials: Material[] = [];
  const geometries: BufferGeometry[] = [];
  const M = <T extends Material>(m: T): T => {
    materials.push(m);
    return m;
  };
  const G = <T extends BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };

  const outdoor = new Group();
  outdoor.name = 'outdoor';
  scene.add(outdoor);

  const sceneZ0 = -opts.halfD - 0.4; // just outside the back wall
  const skyZ = sceneZ0 - 35; // 35 m of depth — gives real parallax
  const groundY = -0.5;

  // ---- Sunny blue sky with sun + clouds (unlit distant backdrop) ----
  const skyW = 90;
  const skyH = 40;
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 1024;
  skyCanvas.height = 512;
  const skyCtx = skyCanvas.getContext('2d');
  if (skyCtx) {
    // Clear blue gradient — top deep, fading to soft blue at horizon.
    const grad = skyCtx.createLinearGradient(0, 0, 0, skyCanvas.height);
    grad.addColorStop(0, '#3f8cd1');
    grad.addColorStop(0.4, '#6cabe2');
    grad.addColorStop(0.78, '#cfe1ee');
    grad.addColorStop(0.86, '#bccdb6'); // tiny horizon haze
    grad.addColorStop(1, '#7ea05a');
    skyCtx.fillStyle = grad;
    skyCtx.fillRect(0, 0, skyCanvas.width, skyCanvas.height);

    // Sun — bright disc with a soft glow halo, upper-right.
    const sunCx = skyCanvas.width * 0.74;
    const sunCy = skyCanvas.height * 0.22;
    const sunR = 32;
    const halo = skyCtx.createRadialGradient(
      sunCx,
      sunCy,
      sunR * 0.6,
      sunCx,
      sunCy,
      sunR * 6,
    );
    halo.addColorStop(0, 'rgba(255, 245, 210, 0.95)');
    halo.addColorStop(0.4, 'rgba(255, 240, 200, 0.35)');
    halo.addColorStop(1, 'rgba(255, 240, 200, 0)');
    skyCtx.fillStyle = halo;
    skyCtx.beginPath();
    skyCtx.arc(sunCx, sunCy, sunR * 6, 0, Math.PI * 2);
    skyCtx.fill();
    // Sun core
    skyCtx.fillStyle = '#fffbe6';
    skyCtx.beginPath();
    skyCtx.arc(sunCx, sunCy, sunR, 0, Math.PI * 2);
    skyCtx.fill();

    // Puffy clouds — a few large soft white blobs.
    const drawCloud = (cx: number, cy: number, scale: number, alpha: number) => {
      skyCtx.fillStyle = `rgba(255,255,255,${alpha})`;
      const puffs: Array<[number, number, number]> = [
        [-1.3, 0.0, 1.0],
        [-0.5, -0.4, 0.9],
        [0.4, -0.3, 1.0],
        [1.3, 0.0, 0.85],
        [0.0, 0.25, 0.95],
      ];
      for (const [dx, dy, r] of puffs) {
        skyCtx.beginPath();
        skyCtx.ellipse(
          cx + dx * scale * 38,
          cy + dy * scale * 18,
          r * scale * 26,
          r * scale * 14,
          0,
          0,
          Math.PI * 2,
        );
        skyCtx.fill();
      }
    };
    drawCloud(skyCanvas.width * 0.18, skyCanvas.height * 0.18, 1.4, 0.9);
    drawCloud(skyCanvas.width * 0.45, skyCanvas.height * 0.12, 1.0, 0.85);
    drawCloud(skyCanvas.width * 0.92, skyCanvas.height * 0.32, 1.2, 0.8);
  }
  const skyTex = new CanvasTexture(skyCanvas);
  skyTex.colorSpace = SRGBColorSpace;
  skyTex.needsUpdate = true;
  const sky = new Mesh(
    G(new PlaneGeometry(skyW, skyH)),
    M(new MeshBasicMaterial({ map: skyTex, toneMapped: false })),
  );
  sky.position.set(0, skyH / 2 - 1, skyZ);
  outdoor.add(sky);

  // ---- Grass ground (extends from just outside the wall to the sky) ----
  const grassDepth = sceneZ0 - skyZ;
  const grassW = skyW;
  const grassCanvas = document.createElement('canvas');
  grassCanvas.width = 256;
  grassCanvas.height = 256;
  const grassCtx = grassCanvas.getContext('2d');
  if (grassCtx) {
    grassCtx.fillStyle = '#7ea05a';
    grassCtx.fillRect(0, 0, 256, 256);
    // Dense speckle for grass feel
    for (let i = 0; i < 2400; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const v = Math.random();
      const c =
        v < 0.35
          ? '#4f7a3c'
          : v < 0.6
            ? '#94b266'
            : v < 0.85
              ? '#a9c97c'
              : '#c8d99a';
      grassCtx.fillStyle = c;
      grassCtx.fillRect(x, y, 2, 2);
    }
  }
  const grassTex = new CanvasTexture(grassCanvas);
  grassTex.colorSpace = SRGBColorSpace;
  grassTex.wrapS = grassTex.wrapT = RepeatWrapping;
  grassTex.repeat.set(grassW / 4, grassDepth / 4);
  grassTex.needsUpdate = true;

  const grass = new Mesh(
    G(new PlaneGeometry(grassW, grassDepth)),
    M(new MeshBasicMaterial({ map: grassTex, toneMapped: false })),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(0, groundY, (sceneZ0 + skyZ) / 2);
  outdoor.add(grass);

  // ---- Concrete driveway (in front of the garage door, under the car) ----
  const drivewayW = 5.0;
  const drivewayLen = 12.0;
  const driveCanvas = document.createElement('canvas');
  driveCanvas.width = 256;
  driveCanvas.height = 512; // taller in the driveway-length direction
  const driveCtx = driveCanvas.getContext('2d');
  if (driveCtx) {
    // Base concrete tone
    driveCtx.fillStyle = '#b9b6ae';
    driveCtx.fillRect(0, 0, 256, 512);
    // Subtle speckle
    for (let i = 0; i < 1400; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 512;
      const v = Math.random();
      const c = v < 0.5 ? '#a8a59c' : v < 0.85 ? '#c4c2bb' : '#8d8a82';
      driveCtx.fillStyle = c;
      driveCtx.fillRect(x, y, 2, 2);
    }
    // Two expansion joints across the driveway (horizontal lines on the
    // canvas — they'll run perpendicular to the driveway length).
    driveCtx.fillStyle = '#6a6862';
    driveCtx.fillRect(0, 168, 256, 2);
    driveCtx.fillRect(0, 340, 256, 2);
    // One faint center seam down the length (vertical line on canvas)
    driveCtx.fillStyle = 'rgba(106, 104, 98, 0.35)';
    driveCtx.fillRect(127, 0, 2, 512);
  }
  const driveTex = new CanvasTexture(driveCanvas);
  driveTex.colorSpace = SRGBColorSpace;
  driveTex.needsUpdate = true;
  const driveway = new Mesh(
    G(new PlaneGeometry(drivewayW, drivewayLen)),
    M(new MeshBasicMaterial({ map: driveTex, toneMapped: false })),
  );
  driveway.rotation.x = -Math.PI / 2;
  // Lift very slightly above grass to avoid z-fighting; centered on x=0,
  // extending from the wall (sceneZ0) outward.
  driveway.position.set(0, groundY + 0.005, sceneZ0 - drivewayLen / 2);
  outdoor.add(driveway);

  // ---- 3D grass tufts (small green cones scattered for depth/parallax) ----
  const tuftMatLight = M(
    new MeshBasicMaterial({ color: 0x9bbd72, toneMapped: false }),
  );
  const tuftMatDark = M(
    new MeshBasicMaterial({ color: 0x6e8f4e, toneMapped: false }),
  );
  const tuftGeo = G(new ConeGeometry(0.12, 0.32, 6));
  // Predefined tuft positions so they don't dance every reload. Avoid the
  // garage-door driveway area (|x| < 4 within 6 m of the wall) so the car
  // has clear ground to sit on.
  const tufts: Array<[number, number, boolean]> = [
    [-9, sceneZ0 - 1.5, true],
    [-7.2, sceneZ0 - 2.6, false],
    [-5.5, sceneZ0 - 1.1, true],
    [-4.4, sceneZ0 - 4.5, false],
    [5.1, sceneZ0 - 1.4, true],
    [6.4, sceneZ0 - 2.8, false],
    [8.0, sceneZ0 - 1.0, true],
    [9.5, sceneZ0 - 3.6, false],
    [-12, sceneZ0 - 4, true],
    [12, sceneZ0 - 5, false],
    [-15, sceneZ0 - 7, true],
    [15, sceneZ0 - 8, false],
    [-2.5, sceneZ0 - 8.5, true],
    [3.2, sceneZ0 - 9.1, false],
    [-8.8, sceneZ0 - 11, true],
    [9.0, sceneZ0 - 12, false],
  ];
  for (const [x, z, light] of tufts) {
    const t = new Mesh(tuftGeo, light ? tuftMatLight : tuftMatDark);
    t.position.set(x, groundY + 0.16, z);
    t.rotation.y = Math.random() * Math.PI;
    outdoor.add(t);
  }

  // ---- A few scattered trees (kept sparse so windows show sky/clouds) ----
  const trunkMat = M(new MeshBasicMaterial({ color: 0x6b4a2b, toneMapped: false }));
  const leafMat = M(new MeshBasicMaterial({ color: 0x4a7a3a, toneMapped: false }));
  const trunkGeo = G(new CylinderGeometry(0.18, 0.22, 1.6, 8));
  const leafGeo = G(new ConeGeometry(1.1, 2.4, 10));

  // Only 3 distant trees, all positioned to the SIDES of the driveway so
  // they don't block the view through the door windows.
  const trees: Array<[number, number, number]> = [
    [-16, sceneZ0 - 14, 1.5],
    [18, sceneZ0 - 11, 1.3],
    [-22, sceneZ0 - 18, 1.7],
  ];
  for (const [x, z, s] of trees) {
    const tree = new Group();
    const trunk = new Mesh(trunkGeo, trunkMat);
    trunk.scale.setScalar(s);
    trunk.position.y = (1.6 * s) / 2 + groundY;
    tree.add(trunk);
    const leaves = new Mesh(leafGeo, leafMat);
    leaves.scale.setScalar(s);
    leaves.position.y = 1.6 * s + (2.4 * s) / 2 + groundY;
    tree.add(leaves);
    tree.position.set(x, 0, z);
    outdoor.add(tree);
  }

  // ---- Stylized car parked on the driveway, just outside the door ----
  const car = new Group();
  const bodyMat = M(
    new MeshBasicMaterial({ color: 0xcc1f2a, toneMapped: false }),
  );
  const cabinMat = M(
    new MeshBasicMaterial({ color: 0x1a232e, toneMapped: false }),
  );
  const wheelMat = M(
    new MeshBasicMaterial({ color: 0x141417, toneMapped: false }),
  );
  const lightMat = M(
    new MeshBasicMaterial({ color: 0xfff7d6, toneMapped: false }),
  );

  const bodyGeo = G(new BoxGeometry(2.0, 0.55, 4.5));
  const body = new Mesh(bodyGeo, bodyMat);
  body.position.set(0, groundY + 0.5, 0);
  car.add(body);

  const cabinGeo = G(new BoxGeometry(1.78, 0.7, 2.3));
  const cabin = new Mesh(cabinGeo, cabinMat);
  cabin.position.set(0, groundY + 0.55 + 0.35, -0.1);
  car.add(cabin);

  // Slim "roof" highlight on top of the cabin so birds-eye view reads as a car.
  const roofGeo = G(new BoxGeometry(1.6, 0.04, 2.0));
  const roof = new Mesh(roofGeo, bodyMat);
  roof.position.set(0, groundY + 0.55 + 0.7 + 0.02, -0.1);
  car.add(roof);

  // Headlights
  const headGeo = G(new BoxGeometry(0.5, 0.18, 0.06));
  const headL = new Mesh(headGeo, lightMat);
  headL.position.set(-0.6, groundY + 0.55, 2.27);
  car.add(headL);
  const headR = new Mesh(headGeo, lightMat);
  headR.position.set(0.6, groundY + 0.55, 2.27);
  car.add(headR);

  // 4 wheels
  const wheelGeo = G(new CylinderGeometry(0.34, 0.34, 0.24, 16));
  const wheelOffsets: Array<[number, number]> = [
    [-1.0, 1.5],
    [1.0, 1.5],
    [-1.0, -1.5],
    [1.0, -1.5],
  ];
  for (const [wx, wz] of wheelOffsets) {
    const w = new Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, groundY + 0.34, wz);
    car.add(w);
  }

  // Park the car squarely on the driveway, facing the garage door (front
  // toward +Z so the headlights point at the door).
  car.position.set(0, 0, sceneZ0 - 5.0);
  car.rotation.y = Math.PI; // turn it 180° so the trunk faces away from the door
  outdoor.add(car);

  return { materials, geometries };
}

function createStreakNormalMap(): CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable for normal map');

  // Neutral normal = (0.5, 0.5, 1.0) → mid-grey RGB (128, 128, 255).
  ctx.fillStyle = 'rgb(128,128,255)';
  ctx.fillRect(0, 0, size, size);

  // Each "streak" is a horizontal sine perturbation in the green channel
  // (= surface y-tilt), which is what causes anisotropic highlights when
  // it tiles across the floor.
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    // Sum of two sines at incommensurate frequencies = no obvious tile.
    const phase = (y / size) * Math.PI * 2;
    const wave = Math.sin(phase * 11) * 0.5 + Math.sin(phase * 23 + 1.7) * 0.3;
    const dy = Math.round(wave * 22);
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      d[i + 1] = 128 + dy;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(1.5, 0.6); // stretch horizontally for long streaks
  tex.needsUpdate = true;
  return tex;
}

export function createGarageScene(container: HTMLElement): GarageContext {
  const scene = new Scene();
  scene.background = new Color(0xeaedf1);

  const camera = new PerspectiveCamera(44, 1, 0.1, 100);
  camera.position.set(0, 1.55, 7.4);

  const renderer = new WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // Track everything that needs explicit GPU cleanup.
  const trackedMaterials: Material[] = [];
  const trackedGeometries: BufferGeometry[] = [];
  const trackedTextures: Texture[] = [];

  const M = <T extends Material>(mat: T): T => {
    trackedMaterials.push(mat);
    return mat;
  };
  const G = <T extends BufferGeometry>(geo: T): T => {
    trackedGeometries.push(geo);
    return geo;
  };

  // --- Image-based lighting ---
  // Real Poly Haven studio HDRI gives soft, directional, photorealistic
  // illumination that the previous procedural RoomEnvironment never could.
  // The HDR is processed into a PMREM cubemap and applied to scene.environment
  // so every PBR material picks up natural reflections and ambient light.
  const pmrem = new PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  new RGBELoader().load(
    '/images/hdri/studio_small_09_1k.hdr',
    (hdrTexture) => {
      hdrTexture.mapping = EquirectangularReflectionMapping;
      const envRT = pmrem.fromEquirectangular(hdrTexture);
      scene.environment = envRT.texture;
      trackedTextures.push(envRT.texture);
      hdrTexture.dispose();
    },
  );

  // --- Camera controls ---
  // The user must always feel like they're inside the garage, never
  // outside it. Pan is disabled so the orbit pivot can't be dragged off
  // its anchor, and the distance/polar limits keep the camera bound to
  // the room interior even when the tour is paused mid-drag.
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.2, -3);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.minDistance = 3.0;
  controls.maxDistance = 8.0;
  controls.minPolarAngle = 0.55;
  controls.maxPolarAngle = 1.45;
  controls.maxAzimuthAngle = Math.PI * 0.6;
  controls.minAzimuthAngle = -Math.PI * 0.6;

  // --- Lighting rig (HDR-driven; one warm key + sky/ground fill) ---
  // The HDRI provides almost all the diffuse + specular illumination.
  // We only add a single shadow-casting key light so floor/wall contact
  // shadows actually land somewhere believable, plus a wide hemisphere
  // light to keep the ground side from going dim.
  scene.add(new HemisphereLight(0xfff5e6, 0xc7cbd1, 0.55));
  scene.add(new AmbientLight(0xffffff, 0.1));

  // Warm key — moved nearly overhead and dialed way down so its specular
  // reflection on the floor isn't a giant hot spot aimed at the camera.
  // It's now mostly a contact-shadow source rather than a brightness driver.
  const sun = new DirectionalLight(0xfff1d6, 0.28);
  sun.position.set(0.5, 8, 2);
  sun.target.position.set(0, 0.5, -3);
  scene.add(sun.target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 30;
  sun.shadow.camera.left = -12;
  sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 10;
  sun.shadow.camera.bottom = -12;
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);

  // --- Room dimensions ---
  const W = 20;
  const D = 16;
  const H = 5;
  const halfW = W / 2;
  const halfD = D / 2;

  // --- Materials ---
  // Walls: light warm-cool architectural grey (drywall painted in something
  // like Sherwin-Williams "Repose Gray"). Stops the room reading as a pure
  // white box without going dim.
  const wallMat = M(
    new MeshStandardMaterial({
      color: new Color(0xd6d8db),
    roughness: 0.92,
      metalness: 0.0,
      envMapIntensity: 0.35,
    }),
  );
  // Ceiling stays a touch lighter than the walls (typical of real rooms).
  const ceilingMat = M(
    new MeshStandardMaterial({
      color: new Color(0xe7e8ea),
      roughness: 1.0,
      metalness: 0.0,
      envMapIntensity: 0.25,
    }),
  );
  const trimMat = M(
    new MeshStandardMaterial({
      color: new Color(0x1d1f22),
      roughness: 0.55,
      metalness: 0.18,
      envMapIntensity: 0.5,
    }),
  );

  // Soft polished epoxy — clearcoat is dialed back so the HDRI's bright
  // overhead light bank smears into a wide, gentle sheen across the
  // floor instead of pooling into a mirror-sharp hot spot. The streak
  // normal map keeps the long horizontal highlight character.
  const floorStreakNormal = createStreakNormalMap();
  trackedTextures.push(floorStreakNormal);
  const floorMaterial = M(
    new MeshPhysicalMaterial({
      color: new Color(0xffffff),
      // Soft satin sheen — just enough specular hint that the floor reads
      // as sealed/glossy, but the flake colour is still clearly visible.
      roughness: 0.7,
      metalness: 0.02,
      clearcoat: 0.12,
      clearcoatRoughness: 0.7,
      envMapIntensity: 0.22,
      normalMap: floorStreakNormal,
      normalScale: new Vector2(0.05, 0.025),
    }),
  );

  // --- Floor + ceiling ---
  const floor = new Mesh(G(new PlaneGeometry(W, D)), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const ceiling = new Mesh(G(new PlaneGeometry(W, D)), ceilingMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = H;
  scene.add(ceiling);

  // --- Walls ---
  // Back-wall window dimensions (must match the window meshes added later).
  // Declared here so the shape cutouts line up exactly with the glass.
  const bwWinW = 2.6;
  const bwWinH = 0.85;
  const bwWinY = 3.95;
  const bwWinX = halfW * 0.75; // mirrored to ±

  // Back wall — built as a Shape so we can punch real holes for the
  // transom windows. Through each hole the user sees the 3D outdoor
  // scene (sky + grass + trees) for genuine parallax.
  const backShape = new Shape();
  backShape.moveTo(-halfW, 0);
  backShape.lineTo(halfW, 0);
  backShape.lineTo(halfW, H);
  backShape.lineTo(-halfW, H);
  backShape.closePath();
  const cutRect = (cx: number, cy: number, w: number, h: number) => {
    const hole = new Path();
    hole.moveTo(cx - w / 2, cy - h / 2);
    hole.lineTo(cx + w / 2, cy - h / 2);
    hole.lineTo(cx + w / 2, cy + h / 2);
    hole.lineTo(cx - w / 2, cy + h / 2);
    hole.closePath();
    backShape.holes.push(hole);
  };
  cutRect(-bwWinX, bwWinY, bwWinW, bwWinH);
  cutRect(+bwWinX, bwWinY, bwWinW, bwWinH);

  // Door window cutouts (must match the door's window hole positions
  // built later — they're hard-coded here so the outdoor scene shows
  // through both the door panel hole AND the wall behind it).
  const dwPanes = 4;
  const dwSide = 0.32;
  const dwGap = 0.08;
  const dwDoorW = 5.4;
  const dwDoorH = 3.4;
  const dwUsable = dwDoorW - dwSide * 2;
  const dwPaneW = (dwUsable - dwGap * (dwPanes - 1)) / dwPanes;
  const dwPaneH = 0.5;
  const dwPaneCenterY = dwDoorH - 0.45 + 0.06; // world y, matches door body
  for (let i = 0; i < dwPanes; i++) {
    const cx =
      -dwDoorW / 2 + dwSide + dwPaneW / 2 + i * (dwPaneW + dwGap);
    cutRect(cx, dwPaneCenterY, dwPaneW * 0.98, dwPaneH * 0.98);
  }

  const backWall = new Mesh(G(new ShapeGeometry(backShape)), wallMat);
  backWall.position.set(0, 0, -halfD);
  backWall.receiveShadow = true;
  scene.add(backWall);

  const leftWall = new Mesh(G(new PlaneGeometry(D, H)), wallMat);
  leftWall.rotation.y = Math.PI / 2;
  leftWall.position.set(-halfW, H / 2, 0);
  leftWall.receiveShadow = true;
  scene.add(leftWall);

  const rightWall = new Mesh(G(new PlaneGeometry(D, H)), wallMat);
  rightWall.rotation.y = -Math.PI / 2;
  rightWall.position.set(halfW, H / 2, 0);
  rightWall.receiveShadow = true;
  scene.add(rightWall);

  // Front "wall" stub behind the camera so reflections never see pure bg.
  const frontWall = new Mesh(G(new PlaneGeometry(W, H)), wallMat);
  frontWall.rotation.y = Math.PI;
  frontWall.position.set(0, H / 2, halfD);
  scene.add(frontWall);

  // --- Black base trim along the perimeter (matches the reference) ---
  const trimH = 0.12;
  const trimT = 0.04;
  const baseBack = new Mesh(G(new BoxGeometry(W, trimH, trimT)), trimMat);
  baseBack.position.set(0, trimH / 2, -halfD + trimT / 2);
  baseBack.receiveShadow = true;
  scene.add(baseBack);

  const baseLeft = new Mesh(G(new BoxGeometry(D, trimH, trimT)), trimMat);
  baseLeft.rotation.y = Math.PI / 2;
  baseLeft.position.set(-halfW + trimT / 2, trimH / 2, 0);
  baseLeft.receiveShadow = true;
  scene.add(baseLeft);

  const baseRight = new Mesh(G(new BoxGeometry(D, trimH, trimT)), trimMat);
  baseRight.rotation.y = Math.PI / 2;
  baseRight.position.set(halfW - trimT / 2, trimH / 2, 0);
  baseRight.receiveShadow = true;
  scene.add(baseRight);

  // ====================================================================
  // BACK WALL — centered roll-up garage door inside a recessed frame
  // ====================================================================
  const doorPanelMat = M(
    new MeshStandardMaterial({
      color: new Color(0xeef0f3),
      roughness: 0.42,
      metalness: 0.18,
      envMapIntensity: 0.8,
    }),
  );
  const doorFrameMat = M(
    new MeshStandardMaterial({
      color: new Color(0xfafbfc),
      roughness: 0.55,
      metalness: 0.1,
      envMapIntensity: 0.6,
    }),
  );
  const doorGrooveMat = M(
    new MeshStandardMaterial({
      color: new Color(0xb6bbc1),
      roughness: 0.7,
      metalness: 0.1,
    }),
  );
  const doorW = 5.4;
  const doorH = 3.4;
  const doorThk = 0.1;
  const doorGroup = new Group();
  // Centered on the back wall, facing into the room (default rotation)
  doorGroup.position.set(0, 0, -halfD + 0.001);

  // (Dark recess removed — the back wall now has real openings cut into
  // it for the door windows, so anything sitting behind the door body
  // would block the outdoor view through them.)

  // Door body — extruded shape with real window holes punched in the
  // top row, so the 3D outdoor scene shows through them.
  // Window pane params (kept here because the hole geometry needs them).
  const doorPanes = 4;
  const doorSideMargin = 0.32;
  const doorPaneGap = 0.08;
  const doorUsableW = doorW - doorSideMargin * 2;
  const doorPaneW = (doorUsableW - doorPaneGap * (doorPanes - 1)) / doorPanes;
  const doorPaneH = 0.5;
  const doorPaneY = doorH - 0.45; // local y measured from door bottom
  const doorBodyShape = new Shape();
  doorBodyShape.moveTo(-doorW / 2, 0);
  doorBodyShape.lineTo(doorW / 2, 0);
  doorBodyShape.lineTo(doorW / 2, doorH);
  doorBodyShape.lineTo(-doorW / 2, doorH);
  doorBodyShape.closePath();
  for (let i = 0; i < doorPanes; i++) {
    const cx =
      -doorW / 2 + doorSideMargin + doorPaneW / 2 + i * (doorPaneW + doorPaneGap);
    const hole = new Path();
    hole.moveTo(cx - doorPaneW / 2, doorPaneY - doorPaneH / 2);
    hole.lineTo(cx + doorPaneW / 2, doorPaneY - doorPaneH / 2);
    hole.lineTo(cx + doorPaneW / 2, doorPaneY + doorPaneH / 2);
    hole.lineTo(cx - doorPaneW / 2, doorPaneY + doorPaneH / 2);
    hole.closePath();
    doorBodyShape.holes.push(hole);
  }
  const doorBody = new Mesh(
    G(new ExtrudeGeometry(doorBodyShape, { depth: doorThk, bevelEnabled: false })),
    doorPanelMat,
  );
  doorBody.position.set(0, 0.06, 0.02);
  doorBody.castShadow = true;
  doorBody.receiveShadow = true;
  doorGroup.add(doorBody);

  // Subtle bevel grooves between the slats (panel sectional door)
  const slatCount = 5;
  const slatPitch = (doorH - 0.1) / slatCount;
  const grooveGeo = G(new BoxGeometry(doorW - 0.08, 0.014, 0.008));
  for (let i = 1; i < slatCount; i++) {
    const groove = new Mesh(grooveGeo, doorGrooveMat);
    groove.position.set(0, 0.06 + i * slatPitch, 0.13);
    doorGroup.add(groove);
  }

  // White frame around the door
  const frameW = doorW + 0.5;
  const frameH = doorH + 0.36;
  const frameSide = 0.12;
  const frameTop = new Mesh(
    G(new BoxGeometry(frameW, 0.12, doorThk + 0.06)),
    doorFrameMat,
  );
  frameTop.position.set(0, frameH + 0.04, 0.08);
  frameTop.castShadow = true;
  doorGroup.add(frameTop);

  const frameLeft = new Mesh(
    G(new BoxGeometry(frameSide, frameH + 0.12, doorThk + 0.06)),
    doorFrameMat,
  );
  frameLeft.position.set(-frameW / 2 + frameSide / 2, (frameH + 0.12) / 2, 0.08);
  frameLeft.castShadow = true;
  doorGroup.add(frameLeft);

  const frameRight = new Mesh(
    G(new BoxGeometry(frameSide, frameH + 0.12, doorThk + 0.06)),
    doorFrameMat,
  );
  frameRight.position.set(frameW / 2 - frameSide / 2, (frameH + 0.12) / 2, 0.08);
  frameRight.castShadow = true;
  doorGroup.add(frameRight);

  // ====================================================================
  // Door window row + back-wall transom windows
  // ====================================================================
  // (Painted outdoor backdrop removed — a real 3D outdoor scene
  // (sky + grass + trees) now sits behind the wall and shows through
  // the cut-out window holes for true parallax.)

  // Glass pane with subtle clearcoat reflection on top of the outdoor view.
  const glassMat = M(
    new MeshPhysicalMaterial({
      color: new Color(0xeaf4ff),
      roughness: 0.12,
      metalness: 0.0,
      transmission: 0.85,
      thickness: 0.02,
      ior: 1.45,
      envMapIntensity: 1.2,
      transparent: true,
      opacity: 0.45,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
    }),
  );

  // Slim matte-black frames around each pane.
  const winFrameMat = M(
    new MeshStandardMaterial({
      color: new Color(0x16181c),
      roughness: 0.45,
      metalness: 0.55,
      envMapIntensity: 0.9,
    }),
  );

  // ---- Garage-door upper window row (4 panes across the top slat) -----
  // Holes are already punched in the door body above; we just add the
  // glass + frame here. The 3D outdoor scene shows through the holes.
  {
    const paneZWorld = 0.13; // world z (in the doorGroup frame)
    const frameThk = 0.022;
    const frameDepth = 0.012;
    const paneYWorld = doorPaneY + 0.06; // door body sits at 0.06 above floor

    for (let i = 0; i < doorPanes; i++) {
      const cx =
        -doorW / 2 +
        doorSideMargin +
        doorPaneW / 2 +
        i * (doorPaneW + doorPaneGap);

      // Glass pane (slightly smaller than the hole so it sits inside it)
      const glass = new Mesh(
        G(new PlaneGeometry(doorPaneW * 0.96, doorPaneH * 0.96)),
        glassMat,
      );
      glass.position.set(cx, paneYWorld, paneZWorld + 0.006);
      doorGroup.add(glass);

      // Slim black frame outlining the pane
      const top = new Mesh(
        G(new BoxGeometry(doorPaneW, frameThk, frameDepth)),
        winFrameMat,
      );
      top.position.set(cx, paneYWorld + doorPaneH / 2, paneZWorld + 0.012);
      doorGroup.add(top);

      const bot = new Mesh(
        G(new BoxGeometry(doorPaneW, frameThk, frameDepth)),
        winFrameMat,
      );
      bot.position.set(cx, paneYWorld - doorPaneH / 2, paneZWorld + 0.012);
      doorGroup.add(bot);

      const left = new Mesh(
        G(new BoxGeometry(frameThk, doorPaneH, frameDepth)),
        winFrameMat,
      );
      left.position.set(cx - doorPaneW / 2, paneYWorld, paneZWorld + 0.012);
      doorGroup.add(left);

      const right = new Mesh(
        G(new BoxGeometry(frameThk, doorPaneH, frameDepth)),
        winFrameMat,
      );
      right.position.set(cx + doorPaneW / 2, paneYWorld, paneZWorld + 0.012);
      doorGroup.add(right);
    }
  }

  scene.add(doorGroup);

  // ---- Back-wall transom windows on either side of the door -----------
  // The wall hole is already cut by the Shape above. Here we just add
  // the glass pane (so the window has a reflective, glazed look) and
  // the slim black frame around the opening — the real 3D outdoor scene
  // shows THROUGH the hole behind it.
  {
    const winZ = -halfD + 0.02;
    const frameThk = 0.05;
    const frameDepth = 0.04;
    const xs = [-bwWinX, bwWinX];

    for (const cx of xs) {
      // Glass overlay (very light tint, lots of transparency so the
      // outdoor scene reads clearly through it)
      const glass = new Mesh(
        G(new PlaneGeometry(bwWinW, bwWinH)),
        glassMat,
      );
      glass.position.set(cx, bwWinY, winZ + 0.01);
      scene.add(glass);

      // Black frame around the opening
      const top = new Mesh(
        G(new BoxGeometry(bwWinW + 0.08, frameThk, frameDepth)),
        winFrameMat,
      );
      top.position.set(cx, bwWinY + bwWinH / 2 + frameThk / 2, winZ + 0.02);
      scene.add(top);

      const bot = new Mesh(
        G(new BoxGeometry(bwWinW + 0.08, frameThk, frameDepth)),
        winFrameMat,
      );
      bot.position.set(cx, bwWinY - bwWinH / 2 - frameThk / 2, winZ + 0.02);
      scene.add(bot);

      const left = new Mesh(
        G(new BoxGeometry(frameThk, bwWinH + frameThk * 2, frameDepth)),
        winFrameMat,
      );
      left.position.set(cx - bwWinW / 2 - frameThk / 2, bwWinY, winZ + 0.02);
      scene.add(left);

      const right = new Mesh(
        G(new BoxGeometry(frameThk, bwWinH + frameThk * 2, frameDepth)),
        winFrameMat,
      );
      right.position.set(cx + bwWinW / 2 + frameThk / 2, bwWinY, winZ + 0.02);
      scene.add(right);

      // Vertical mullion in the middle for an architectural two-pane look
      const mullion = new Mesh(
        G(new BoxGeometry(frameThk * 0.7, bwWinH, frameDepth * 0.8)),
        winFrameMat,
      );
      mullion.position.set(cx, bwWinY, winZ + 0.018);
      scene.add(mullion);
    }
  }

  // ====================================================================
  // LEFT WALL — wall-mounted TV + low floating cabinet (UNCHANGED)
  // ====================================================================
  const tvBezelMat = M(
    new MeshStandardMaterial({
      color: new Color(0x0e1013),
      roughness: 0.32,
      metalness: 0.65,
      envMapIntensity: 0.9,
    }),
  );
  const tvScreenMat = M(
    new MeshStandardMaterial({
      color: new Color(0x07090d),
      roughness: 0.16,
      metalness: 0.5,
      emissive: new Color(0x14202e),
      emissiveIntensity: 0.55,
      envMapIntensity: 1.1,
    }),
  );

  const tvW = 1.95;
  const tvH = 1.12;
  const tvBodyDepth = 0.06;
  const tvGroup = new Group();
  tvGroup.position.set(-halfW + 0.001, 0, -2.4);
  tvGroup.rotation.y = Math.PI / 2;

  const tvBody = new Mesh(
    G(new BoxGeometry(tvW, tvH, tvBodyDepth)),
    tvBezelMat,
  );
  tvBody.position.set(0, 1.95, 0);
  tvBody.castShadow = true;
  tvGroup.add(tvBody);

  const tvScreen = new Mesh(
    G(new PlaneGeometry(tvW * 0.95, tvH * 0.92)),
    tvScreenMat,
  );
  tvScreen.position.set(0, 1.95, tvBodyDepth / 2 + 0.0015);
  tvGroup.add(tvScreen);

  scene.add(tvGroup);

  // Low floating cabinet (rounded edges = modern feel)
  const cabinetBodyMat = M(
    new MeshStandardMaterial({
      color: new Color(0x2c3036),
      roughness: 0.42,
      metalness: 0.3,
      envMapIntensity: 0.7,
    }),
  );
  const cabinetTopMat = M(
    new MeshStandardMaterial({
      color: new Color(0x1c1e22),
      roughness: 0.22,
      metalness: 0.45,
      envMapIntensity: 1.0,
    }),
  );
  const cabinetBaseMat = M(
    new MeshStandardMaterial({
      color: new Color(0x101216),
      roughness: 0.55,
      metalness: 0.3,
    }),
  );

  const cabW = 2.4;
  const cabH = 0.6;
  const cabD = 0.5;
  const cabFloatY = 0.18;
  const cabinet = new Group();
  cabinet.position.set(-halfW + cabD / 2 + 0.04, 0, -2.4);

  const cabBody = new Mesh(
    G(new RoundedBoxGeometry(cabD, cabH, cabW, 4, 0.05)),
    cabinetBodyMat,
  );
  cabBody.position.set(0, cabFloatY + cabH / 2, 0);
  cabBody.castShadow = true;
  cabBody.receiveShadow = true;
  cabinet.add(cabBody);

  const cabTop = new Mesh(
    G(new RoundedBoxGeometry(cabD + 0.06, 0.04, cabW + 0.06, 3, 0.018)),
    cabinetTopMat,
  );
  cabTop.position.set(0, cabFloatY + cabH + 0.02, 0);
  cabTop.castShadow = true;
  cabinet.add(cabTop);

  const cabBase = new Mesh(
    G(new BoxGeometry(cabD - 0.12, cabFloatY - 0.02, cabW - 0.3)),
    cabinetBaseMat,
  );
  cabBase.position.set(0, (cabFloatY - 0.02) / 2, 0);
  cabinet.add(cabBase);

  const handleMat = M(
    new MeshStandardMaterial({
      color: new Color(0x14161a),
      roughness: 0.4,
      metalness: 0.45,
    }),
  );
  const handleGeo = G(new BoxGeometry(0.012, 0.018, cabW / 2 - 0.18));
  const handleA = new Mesh(handleGeo, handleMat);
  handleA.position.set(cabD / 2 + 0.001, cabFloatY + cabH * 0.55, -cabW / 4);
  cabinet.add(handleA);
  const handleB = new Mesh(handleGeo, handleMat);
  handleB.position.set(cabD / 2 + 0.001, cabFloatY + cabH * 0.55, cabW / 4);
  cabinet.add(handleB);

  scene.add(cabinet);

  // (Cove LED strip + RectAreaLight removed in Phase 1 — the HDRI
  // environment + warm DirectionalLight now provide all illumination.
  // The room reads brighter and more "daylight" instead of "stage-lit".)

  // --- Real 3D outdoor scene behind the back wall + door windows ---
  // Sky backdrop + grass + scattered low-poly trees. Shows through the
  // window holes cut into the wall and door for genuine parallax as the
  // camera moves around.
  const outdoor = addOutdoorScene(scene, { halfD, halfW });
  for (const m of outdoor.materials) trackedMaterials.push(m);
  for (const g of outdoor.geometries) trackedGeometries.push(g);

  // --- Lived-in contents (workbench, shelving, bins, bicycle, car, etc.) ---
  addGarageContents(scene, {
    W,
    D,
    H,
    materials: trackedMaterials,
    geometries: trackedGeometries,
    textures: trackedTextures,
  });

  // ====================================================================
  // Postprocessing: SSAO + UnrealBloom + OutputPass
  // ====================================================================
  const initialW = Math.max(1, container.clientWidth);
  const initialH = Math.max(1, container.clientHeight);

  const composer = new EffectComposer(renderer);
  composer.setSize(initialW, initialH);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const ssaoPass = new SSAOPass(scene, camera, initialW, initialH);
  ssaoPass.kernelRadius = 8;
  ssaoPass.minDistance = 0.0005;
  ssaoPass.maxDistance = 0.06;
  composer.addPass(ssaoPass);

  const bloomPass = new UnrealBloomPass(
    new Vector2(initialW, initialH),
    0.08, // strength — bare minimum; HDR lighting carries the brightness
    0.6, // radius
    1.4, // threshold — only the brightest specular hot spots bloom
  );
  composer.addPass(bloomPass);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  // --- Resize + render loop ---
  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloomPass.resolution.set(w, h);
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  // -------------------------------------------------------------------
  // Cinematic camera tour (default) + free-look mode toggle
  // -------------------------------------------------------------------
  // Four hand-picked vantage points around the room, eased between on a
  // continuous loop — like a quick walk-through reel. The user can grab
  // the mouse at any time to pause for 4 s, then the tour resumes from
  // wherever the camera ended up (no jarring snap).
  type Keyframe = { pos: Vector3; target: Vector3 };
  const keyframes: Keyframe[] = [
    // Hero / wide
    { pos: new Vector3(0, 1.55, 7.4), target: new Vector3(0, 1.2, -3) },
    // Looking at the left wall (TV + cabinet)
    { pos: new Vector3(5.5, 1.6, 5.5), target: new Vector3(-halfW + 2, 1.5, -2) },
    // Looking up the back-wall garage door
    { pos: new Vector3(0, 1.85, 5), target: new Vector3(0, 1.7, -halfD + 0.5) },
    // Looking at the right-wall storage zone
    { pos: new Vector3(-5.5, 1.55, 5.5), target: new Vector3(halfW - 2, 1.4, -1) },
  ];

  let cameraMode: CameraMode = 'tour';
  const TOUR_SEG_MS = 7500; // dwell + ease per keyframe
  let tourFromPos = camera.position.clone();
  let tourFromTarget = controls.target.clone();
  let tourIndex = 0;
  let tourTime = 0;
  let pauseUntilMs = 0;

  const easeInOutCubic = (t: number) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  controls.addEventListener('start', () => {
    // User grabbed the camera — pause the tour for a moment so they can
    // look around before it tries to lerp away.
    pauseUntilMs = performance.now() + 4000;
  });

  const updateTour = (deltaMs: number, now: number) => {
    if (cameraMode !== 'tour') return;
    if (now < pauseUntilMs) {
      // Re-anchor "from" so when the tour resumes, the next ease starts
      // from the user's current viewpoint instead of snapping back.
      tourFromPos.copy(camera.position);
      tourFromTarget.copy(controls.target);
      tourTime = 0;
      return;
    }
    tourTime += deltaMs;
    if (tourTime >= TOUR_SEG_MS) {
      tourTime = 0;
      tourFromPos.copy(camera.position);
      tourFromTarget.copy(controls.target);
      tourIndex = (tourIndex + 1) % keyframes.length;
    }
    const t = Math.min(1, tourTime / TOUR_SEG_MS);
    const eased = easeInOutCubic(t);
    const target = keyframes[tourIndex]!;
    camera.position.lerpVectors(tourFromPos, target.pos, eased);
    controls.target.lerpVectors(tourFromTarget, target.target, eased);
    camera.lookAt(controls.target);
  };

  const setCameraMode = (m: CameraMode) => {
    cameraMode = m;
    if (m === 'free') {
      // First-person look: camera is bolted to the centre of the garage
      // at human eye-level. We park OrbitControls' target a tiny 0.4 m
      // in front of the camera and lock the orbit radius — so dragging
      // can only rotate the view, never orbit the camera around the
      // room. The camera physically can't leave the centre.
      controls.autoRotate = false;
      camera.position.set(0, 1.7, 0);
      controls.target.set(0, 1.7, -0.4);
      controls.minDistance = 0.4;
      controls.maxDistance = 0.4;
      controls.minPolarAngle = 0.35;
      controls.maxPolarAngle = Math.PI - 0.35;
      controls.minAzimuthAngle = -Infinity;
      controls.maxAzimuthAngle = Infinity;
      camera.lookAt(controls.target);
      controls.update();
    } else {
      // Tour mode: restore the wider orbit limits used while user drags
      // pause the cinematic tour. Pan stays off so target can't slide
      // out of the room.
      controls.autoRotate = false;
      controls.minDistance = 3.0;
      controls.maxDistance = 8.0;
      controls.minPolarAngle = 0.55;
      controls.maxPolarAngle = 1.45;
      controls.minAzimuthAngle = -Math.PI * 0.6;
      controls.maxAzimuthAngle = Math.PI * 0.6;
      // Resume tour from current viewpoint, not from wherever we left off.
      tourFromPos.copy(camera.position);
      tourFromTarget.copy(controls.target);
      tourTime = 0;
      pauseUntilMs = 0;
    }
  };

  const getCameraMode = () => cameraMode;

  let raf = 0;
  let paused = false;
  let lastTickMs = performance.now();
  // Hard interior bounds — camera CANNOT go outside the garage shell.
  // Inset 0.5 m so we never clip into a wall or the ceiling.
  const camMinX = -halfW + 0.5;
  const camMaxX = halfW - 0.5;
  const camMinZ = -halfD + 0.5;
  const camMaxZ = halfD - 0.5;
  const camMinY = 0.6;
  const camMaxY = H - 0.4;

  const tick = () => {
    raf = requestAnimationFrame(tick);
    if (paused) {
      lastTickMs = performance.now();
      return;
    }
    const now = performance.now();
    const deltaMs = Math.min(64, now - lastTickMs);
    lastTickMs = now;
    updateTour(deltaMs, now);
    controls.update();
    if (camera.position.x < camMinX) camera.position.x = camMinX;
    else if (camera.position.x > camMaxX) camera.position.x = camMaxX;
    if (camera.position.z < camMinZ) camera.position.z = camMinZ;
    else if (camera.position.z > camMaxZ) camera.position.z = camMaxZ;
    if (camera.position.y < camMinY) camera.position.y = camMinY;
    else if (camera.position.y > camMaxY) camera.position.y = camMaxY;
    composer.render();
  };
  tick();

  const setPaused = (p: boolean) => {
    paused = p;
  };

  const dispose = () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    controls.dispose();

    floorMaterial.map?.dispose();
    for (const mat of trackedMaterials) mat.dispose();
    for (const geo of trackedGeometries) geo.dispose();
    for (const tex of trackedTextures) tex.dispose();
    pmrem.dispose();

    bloomPass.dispose();
    composer.dispose();

    renderer.dispose();
    if (renderer.domElement.parentElement === container) {
      container.removeChild(renderer.domElement);
    }
  };

  return {
    scene,
    camera,
    renderer,
    controls,
    floorMaterial,
    setPaused,
    setCameraMode,
    getCameraMode,
    dispose,
  };
}
