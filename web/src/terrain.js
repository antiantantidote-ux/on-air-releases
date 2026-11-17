// San Milagro: a seeded heightfield island with a volcano, beaches, two flattened
// building sites, per-face vertex colours and baked ambient occlusion.
import * as THREE from './three.js';
import { makeNoise2D, fbm, clamp, lerp, smoothstep } from './noise.js';
import { vertexLit } from './geo.js';

export const WORLD = {
  size: 360,       // world units across the simulated square
  segments: 150,   // grid cells per side
  islandRadius: 128,
  seaLevel: 0,
};

const HALF = WORLD.size / 2;
const CELL = WORLD.size / WORLD.segments;
const VERTS = WORLD.segments + 1;

export const SITES = {
  palace: { x: 18, z: 34, r: 17, name: 'Palacio Presidencial' },
  nest: { x: -46, z: 52, r: 13, name: 'El Nido Supremo' },
  volcano: { x: -44, z: -40, name: 'Monte Milagro' },
};

export function createTerrain(seed = 1961) {
  const noise = makeNoise2D(seed);
  const detail = makeNoise2D(seed + 77);

  function rawHeight(x, z) {
    const d = Math.hypot(x, z) / WORLD.islandRadius;
    const warp = fbm(noise, x * 0.011 + 7.3, z * 0.011 - 3.1, 4);
    const mask = 1 - smoothstep(0.42, 1.05, d + warp * 0.3);
    let h = -9 + mask * 13;
    const hills = fbm(noise, x * 0.021 - 11, z * 0.021 + 5, 5) * 0.5 + 0.5;
    h += mask * mask * hills * 17;
    const vd = Math.hypot(x - SITES.volcano.x, z - SITES.volcano.z);
    const cone = Math.exp(-(vd * vd) / (2 * 27 * 27)) * 50;
    const crater = Math.exp(-(vd * vd) / (2 * 6.5 * 6.5)) * 17;
    h += (cone - crater) * smoothstep(0, 0.35, mask);
    if (h > 0 && h < 3) h = (h * h) / 3; // wide, lazy beaches
    return h;
  }

  const plateaus = [SITES.palace, SITES.nest].map((s) => ({
    ...s,
    level: Math.max(rawHeight(s.x, s.z), 5.5),
  }));
  SITES.palace.level = plateaus[0].level;
  SITES.nest.level = plateaus[1].level;

  function designHeight(x, z) {
    let h = rawHeight(x, z);
    for (const p of plateaus) {
      const t = 1 - smoothstep(p.r * 0.62, p.r * 1.25, Math.hypot(x - p.x, z - p.z));
      if (t > 0) h = lerp(h, p.level, t);
    }
    return h;
  }

  // --- sample the grid -----------------------------------------------------
  const heights = new Float32Array(VERTS * VERTS);
  for (let j = 0; j < VERTS; j++) {
    for (let i = 0; i < VERTS; i++) {
      heights[j * VERTS + i] = designHeight(-HALF + i * CELL, -HALF + j * CELL);
    }
  }
  const H = (i, j) => heights[clamp(j, 0, VERTS - 1) * VERTS + clamp(i, 0, VERTS - 1)];

  // --- baked ambient occlusion: valleys and crater floors get darker ----------
  const ao = new Float32Array(VERTS * VERTS);
  for (let j = 0; j < VERTS; j++) {
    for (let i = 0; i < VERTS; i++) {
      const h = H(i, j);
      let sum = 0;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        sum += H(i + Math.round(Math.cos(a) * 3), j + Math.round(Math.sin(a) * 3));
      }
      const occ = clamp((sum / 8 - h) * 0.085, -0.12, 0.42);
      ao[j * VERTS + i] = h < -0.5 ? 1 : 1 - occ;
    }
  }

  // --- palette (sRGB hex -> linear) ---------------------------------------------
  const C = (hex) => new THREE.Color(hex);
  const PAL = {
    seabed: C(0xd8c99a), sand: C(0xf1dfa6), sandWet: C(0xdcc890),
    grass: C(0x7fbf4d), grassDry: C(0xa9c45a), jungle: C(0x2f8a45), jungleDeep: C(0x1f6b3c),
    rock: C(0x7d7468), basalt: C(0x3b3537), lava: C(0xd9481f), plaza: C(0xd9c7a3),
  };
  const tmp = new THREE.Color();

  function faceColor(h, ny, x, z, out) {
    const n = detail(x * 0.09, z * 0.09);
    const vd = Math.hypot(x - SITES.volcano.x, z - SITES.volcano.z);
    if (h < -0.2) out.copy(PAL.seabed);
    else if (h < 0.5) out.copy(PAL.sandWet);
    else if (h < 2.4) out.copy(PAL.sand);
    else if (vd < 7.5 && h > 20) out.copy(PAL.lava).lerp(PAL.basalt, clamp(vd / 7.5, 0, 1) * 0.75);
    else if (h > 34) out.copy(PAL.basalt).lerp(PAL.rock, clamp(n * 0.5 + 0.3, 0, 1));
    else if (ny < 0.74) out.copy(PAL.rock).lerp(PAL.basalt, smoothstep(18, 34, h));
    else if (h < 9) out.copy(PAL.grass).lerp(PAL.grassDry, clamp(n * 0.6 + 0.35, 0, 1));
    else out.copy(PAL.jungle).lerp(PAL.jungleDeep, smoothstep(9, 26, h + n * 4));
    for (const p of plateaus) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < p.r * 0.66) out.lerp(PAL.plaza, 0.8 * (1 - smoothstep(p.r * 0.5, p.r * 0.66, d)));
    }
    const jitter = 1 + detail(x * 0.7 + 31, z * 0.7 - 17) * 0.07; // facet sparkle
    out.multiplyScalar(jitter);
    return out;
  }

  // --- build the flat-shaded mesh -------------------------------------------------
  const S = WORLD.segments;
  const triCount = S * S * 2;
  const pos = new Float32Array(triCount * 9);
  const nor = new Float32Array(triCount * 9);
  const col = new Float32Array(triCount * 9);
  const pa = new THREE.Vector3(), pb = new THREE.Vector3(), pc = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), fn = new THREE.Vector3();
  let o = 0;

  function emit(i0, j0, i1, j1, i2, j2) {
    pa.set(-HALF + i0 * CELL, H(i0, j0), -HALF + j0 * CELL);
    pb.set(-HALF + i1 * CELL, H(i1, j1), -HALF + j1 * CELL);
    pc.set(-HALF + i2 * CELL, H(i2, j2), -HALF + j2 * CELL);
    fn.crossVectors(e1.subVectors(pb, pa), e2.subVectors(pc, pa)).normalize();
    const cx = (pa.x + pb.x + pc.x) / 3, cz = (pa.z + pb.z + pc.z) / 3;
    faceColor((pa.y + pb.y + pc.y) / 3, fn.y, cx, cz, tmp);
    const idx = [[i0, j0, pa], [i1, j1, pb], [i2, j2, pc]];
    for (const [i, j, p] of idx) {
      const a = ao[j * VERTS + i];
      pos[o] = p.x; pos[o + 1] = p.y; pos[o + 2] = p.z;
      nor[o] = fn.x; nor[o + 1] = fn.y; nor[o + 2] = fn.z;
      col[o] = tmp.r * a; col[o + 1] = tmp.g * a; col[o + 2] = tmp.b * a;
      o += 3;
    }
  }
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      emit(i, j, i, j + 1, i + 1, j);
      emit(i + 1, j, i, j + 1, i + 1, j + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, vertexLit);
  mesh.name = 'terrain';
  mesh.matrixAutoUpdate = false;

  // --- height texture: the water shader reads this for depth tint and shore foam ----
  const half = new Uint16Array(VERTS * VERTS);
  for (let i = 0; i < half.length; i++) half[i] = THREE.DataUtils.toHalfFloat(heights[i]);
  const heightTexture = new THREE.DataTexture(half, VERTS, VERTS, THREE.RedFormat, THREE.HalfFloatType);
  heightTexture.magFilter = THREE.LinearFilter;
  heightTexture.minFilter = THREE.LinearFilter;
  heightTexture.wrapS = heightTexture.wrapT = THREE.ClampToEdgeWrapping;
  heightTexture.needsUpdate = true;

  // --- queries (triangle-exact, so objects sit on the facets you can see) -----------
  function heightAt(x, z) {
    const gx = clamp((x + HALF) / CELL, 0, S - 1e-4);
    const gz = clamp((z + HALF) / CELL, 0, S - 1e-4);
    const i = Math.floor(gx), j = Math.floor(gz);
    const fx = gx - i, fz = gz - j;
    const a = heights[j * VERTS + i], b = heights[j * VERTS + i + 1];
    const c = heights[(j + 1) * VERTS + i], d = heights[(j + 1) * VERTS + i + 1];
    return fx + fz <= 1 ? a + (b - a) * fx + (c - a) * fz : d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
  }

  function normalAt(x, z, out) {
    const e = CELL * 0.75;
    out.set(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e));
    return out.normalize();
  }

  return {
    mesh, heightAt, normalAt, heightTexture,
    /** Height of whatever you would stand on: land, or the sea surface. */
    surfaceAt: (x, z) => Math.max(heightAt(x, z), WORLD.seaLevel),
    isLand: (x, z) => heightAt(x, z) > 0.35,
    triangles: triCount,
  };
}
