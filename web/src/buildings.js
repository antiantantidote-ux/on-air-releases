// Buildings: definitions, low-poly models, placement rules, construction sites,
// production chains and the export freighter. One InstancedMesh per building type
// plus one shared instanced foundation mesh, so a whole town costs ~12 draw calls.
import * as THREE from './three.js';
import { paint, place, merge, vertexLit } from './geo.js';
import { SITES } from './terrain.js';

export const GOODS = {
  food: { icon: '🍌', label: 'Plantains', price: 0 },
  sugar: { icon: '🎋', label: 'Sugar', price: 22 },
  tobacco: { icon: '🍂', label: 'Tobacco', price: 32 },
  coffee: { icon: '☕', label: 'Coffee', price: 40 },
  rum: { icon: '🥃', label: 'Rum', price: 120 },
  cigars: { icon: '🚬', label: 'Cigars', price: 140 },
};

const box = (w, h, d, color, x = 0, y = 0, z = 0, shade = 0.8) =>
  place(paint(new THREE.BoxGeometry(w, h, d), color, shade), x, y + h / 2, z);
const cyl = (r1, r2, h, seg, color, x = 0, y = 0, z = 0, shade = 0.8) =>
  place(paint(new THREE.CylinderGeometry(r1, r2, h, seg), color, shade), x, y + h / 2, z);
const ball = (r, color, x, y, z, sy = 1) =>
  place(paint(new THREE.IcosahedronGeometry(r, 0), color, 0.7), x, y, z, 0, 0, 0, new THREE.Vector3(1, sy, 1));
/** A pitched roof: triangular prism along Z. */
const gable = (w, h, d, color, x, y, z) =>
  place(paint(new THREE.CylinderGeometry(w / Math.sqrt(3), w / Math.sqrt(3), d, 3), color, 0.85),
    x, y + h / 3, z, Math.PI / 2, 0, 0, new THREE.Vector3(1, 1, (h * 2) / w / Math.sqrt(3) * 1.15));

function farm(cropColor, cropHeight, bushy, accent) {
  const parts = [box(11, 0.3, 11, 0x7a5a3a, 0, 0, 0, 1)];
  for (let r = 0; r < 5; r++) {
    const x = -4.2 + r * 2.1;
    if (bushy) {
      for (let k = 0; k < 4; k++) {
        parts.push(ball(0.75, cropColor, x, 0.3 + cropHeight * 0.5, -1.6 + k * 2.1, cropHeight / 1.1));
        if (accent) parts.push(ball(0.28, accent, x + 0.3, 0.5 + cropHeight * 0.8, -1.4 + k * 2.1));
      }
    } else {
      parts.push(box(1.05, cropHeight, 7.4, cropColor, x, 0.3, 1.3, 0.6));
    }
  }
  parts.push(box(2.8, 2, 2.2, 0xd8c9a0, -3.6, 0.3, -4.1), box(3.2, 0.35, 2.7, 0xb5482f, -3.6, 2.3, -4.1));
  parts.push(cyl(0.8, 0.8, 1.5, 7, 0x6c8fa8, 3.7, 0.3, -4.2));
  return merge(parts);
}

const MODELS = {
  plantain: () => farm(0x5fae3a, 1.7, true, 0xf2d43d),
  sugar: () => farm(0xb6d66a, 1.7, false),
  tobacco: () => farm(0x3f8a3c, 0.9, false),
  coffee: () => farm(0x2f6e3a, 1.0, true, 0xc0392b),
  distillery: () => merge([
    box(6.4, 4.2, 5.4, 0xb5563a, -0.6, 0, -0.4), box(6.9, 0.5, 5.9, 0x5a4a42, -0.6, 4.2, -0.4),
    cyl(0.5, 0.7, 8.5, 6, 0x8a4a36, -2.8, 0, -1.8), cyl(0.7, 0.7, 0.4, 6, 0x3a3a3a, -2.8, 8.5, -1.8),
    ball(1.25, 0xc97a3a, 3.2, 1.4, 1.2, 1.2), cyl(0.2, 0.2, 2.2, 5, 0xc97a3a, 3.2, 2.4, 1.2),
    cyl(0.6, 0.6, 1.2, 8, 0x9c5a2c, 2.2, 0, 3.0), cyl(0.6, 0.6, 1.2, 8, 0x9c5a2c, 3.5, 0, 3.1),
    box(1.4, 2.2, 0.2, 0x3a2a1a, -0.6, 0, 2.35),
  ]),
  cigars: () => merge([
    box(7.4, 3.4, 5.6, 0xe9dcb8, 0, 0, -0.4),
    gable(3.9, 1.5, 5.8, 0xa5482f, -1.9, 3.4, -0.4), gable(3.9, 1.5, 5.8, 0xa5482f, 1.9, 3.4, -0.4),
    box(1.5, 2.3, 0.2, 0x5a3a22, 0, 0, 2.45), box(1.2, 1.0, 0.15, 0x6fa8c8, -2.4, 1.4, 2.45), box(1.2, 1.0, 0.15, 0x6fa8c8, 2.4, 1.4, 2.45),
    cyl(0.35, 0.45, 6, 6, 0x7a6a5a, 3.0, 0, -2.4),
    box(1.6, 0.9, 1.1, 0x8a5a2c, -2.9, 0, 3.2),
  ]),
  dock: () => merge([
    box(5.6, 3, 4.2, 0xb9774a, 0, 0.4, -4.6), gable(6.2, 1.6, 4.6, 0x4f6f7a, 0, 3.4, -4.6),
    box(4.4, 0.45, 11, 0xa8824f, 0, 0, 2.2, 1),
    ...[-2, 2].flatMap((x) => [-2.6, 1, 4.4, 7.4].map((z) => cyl(0.28, 0.28, 5, 5, 0x5d4428, x, -4.2, z))),
    cyl(0.22, 0.22, 4.6, 5, 0x444444, 1.5, 0.45, 5.6), box(0.3, 0.3, 3.4, 0xd0a020, 1.5, 4.9, 6.6),
    box(1.1, 1.1, 1.1, 0xc08a4a, -1.2, 0.45, 3.4), box(1.1, 1.1, 1.1, 0xc08a4a, -1.1, 0.45, 4.7),
  ]),
  tenement: () => merge([
    box(6.2, 6.6, 6.2, 0xf0b27a, 0, 0, 0), box(6.7, 0.45, 6.7, 0x8a5a44, 0, 6.6, 0),
    ...[1.2, 3.2, 5.2].flatMap((y) => [box(4.8, 0.9, 0.15, 0x4a6a8a, 0, y, 3.12), box(0.15, 0.9, 4.8, 0x4a6a8a, 3.12, y, 0)]),
    box(1.3, 1.9, 0.2, 0x5a3a22, 0, 0, 3.15), box(1.4, 1.2, 1.4, 0x9aa7ad, 1.6, 7.05, -1.5),
  ]),
  clinic: () => merge([
    box(5.6, 3.2, 5, 0xf7f7f2, 0, 0, 0), box(6.1, 0.45, 5.5, 0x3fa7a0, 0, 3.2, 0),
    box(1.5, 0.45, 0.15, 0xd0252b, 0, 2.2, 2.55), box(0.45, 1.5, 0.15, 0xd0252b, 0, 1.68, 2.55),
    box(1.2, 1.5, 0.12, 0x6fa8c8, -1.9, 1.0, 2.52), box(1.2, 1.5, 0.12, 0x6fa8c8, 1.9, 1.0, 2.52),
  ]),
  cathedral: () => merge([
    box(6, 6, 9, 0xe6d3a3, 0, 0, -1.2), gable(6.6, 2.6, 9.4, 0x9c4a34, 0, 6, -1.2),
    box(3.2, 11, 3.2, 0xeedfb5, 0, 0, 4.2), place(paint(new THREE.ConeGeometry(2.5, 3, 4), 0x9c4a34, 0.85), 0, 12.5, 4.2, 0, Math.PI / 4, 0),
    box(0.3, 2, 0.3, 0xe8b530, 0, 14, 4.2), box(1.2, 0.3, 0.3, 0xe8b530, 0, 15.1, 4.2),
    box(1.4, 2.6, 0.2, 0x5a3a22, 0, 0, 5.85), cyl(0.9, 0.9, 0.15, 8, 0x7ec8e3, 0, 6.6, 5.85),
  ]),
  ziggurat: () => merge([
    box(16, 3, 16, 0xe8b530, 0, 0, 0), box(12.6, 3, 12.6, 0xf2c94c, 0, 3, 0), box(9.2, 3, 9.2, 0xe8b530, 0, 6, 0), box(5.8, 3, 5.8, 0xf2c94c, 0, 9, 0),
    box(3.4, 12.2, 3, 0xcfa32a, 0, 0, 6.6, 1),                                                 // grand staircase
    place(paint(new THREE.SphereGeometry(2.6, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0xd0252b, 0.8), 0, 12, 0),
    box(7, 1.6, 0.4, 0xd0252b, 0, 12.6, 3.1), box(6.2, 1.0, 0.45, 0xfff3c4, 0, 12.9, 3.15),  // CASINO sign
    ...[-7, 7].flatMap((x) => [-7, 7].map((z) => cyl(0.5, 0.6, 5, 6, 0xfff3c4, x, 3, z))),
    ...[-7, 7].flatMap((x) => [-7, 7].map((z) => ball(0.9, 0xff7a2a, x, 8.6, z))),
  ]),
  outpost: () => merge([
    ...[-1.5, 1.5].flatMap((x) => [-1.5, 1.5].map((z) => cyl(0.2, 0.2, 5, 4, 0x5d4428, x, 0, z))),
    box(4, 0.35, 4, 0x6b5a3a, 0, 5, 0), box(4, 1.0, 0.2, 0x5f6b3a, 0, 5.35, 2), box(4, 1.0, 0.2, 0x5f6b3a, 0, 5.35, -2),
    box(0.2, 1.0, 4, 0x5f6b3a, 2, 5.35, 0), box(0.2, 1.0, 4, 0x5f6b3a, -2, 5.35, 0),
    place(paint(new THREE.ConeGeometry(3.3, 1.6, 4), 0x4a5a2f, 0.85), 0, 8.2, 0, 0, Math.PI / 4, 0),
    box(2.6, 0.9, 0.9, 0xb7a982, 0, 0, 2.6), cyl(0.07, 0.07, 3, 4, 0x555555, 1.9, 6.3, 1.9), box(1.3, 0.8, 0.06, 0xd0252b, 2.6, 8.5, 1.9),
  ]),
};

export const BUILDINGS = {
  plantain: { label: 'Plantain Farm', icon: '🍌', cost: 400, w: 11, d: 11, h: 2.5, workers: 3, produces: 'food', cycle: 4, cap: 30, upkeep: 6, desc: 'Feeds the people. Dull but essential.' },
  sugar: { label: 'Sugar Plantation', icon: '🎋', cost: 500, w: 11, d: 11, h: 2.5, workers: 3, produces: 'sugar', cycle: 9, cap: 12, upkeep: 8, desc: 'Cane for export, or for rum.' },
  tobacco: { label: 'Tobacco Farm', icon: '🍂', cost: 650, w: 11, d: 11, h: 2.5, workers: 3, produces: 'tobacco', cycle: 11, cap: 12, upkeep: 8, desc: 'Leaf for export, or for cigars.' },
  coffee: { label: 'Coffee Finca', icon: '☕', cost: 700, w: 11, d: 11, h: 2.5, workers: 3, produces: 'coffee', cycle: 10, cap: 12, upkeep: 8, minHeight: 8, desc: 'Highlands only: needs 8 m elevation.' },
  distillery: { label: 'Rum Distillery', icon: '🥃', cost: 1500, w: 9, d: 8, h: 8, workers: 3, consumes: 'sugar', produces: 'rum', cycle: 10, cap: 10, upkeep: 18, indoor: true, desc: 'Turns sugar into foreign currency.' },
  cigars: { label: 'Cigar Factory', icon: '🚬', cost: 1700, w: 9, d: 8, h: 6, workers: 3, consumes: 'tobacco', produces: 'cigars', cycle: 12, cap: 10, upkeep: 18, indoor: true, desc: 'Hand-rolled. Mostly by hand.' },
  dock: { label: 'Dock', icon: '⚓', cost: 1200, w: 7, d: 14, h: 5, workers: 2, coastal: true, upkeep: 12, indoor: true, desc: 'Exports goods. Must straddle the shoreline.' },
  tenement: { label: 'Tenement', icon: '🏢', cost: 600, w: 7, d: 7, h: 7, housing: 8, upkeep: 6, desc: 'Homes for 8. Cosy is a state of mind.' },
  clinic: { label: 'Clinic', icon: '🏥', cost: 900, w: 7, d: 6, h: 4, workers: 1, heals: true, upkeep: 14, indoor: true, desc: 'Cures most things. Bills the rest.' },
  cathedral: { label: 'Cathedral', icon: '⛪', cost: 2000, w: 8, d: 13, h: 15, workers: 1, faith: true, upkeep: 16, indoor: true, desc: 'Worshippers here generate Mana fast.' },
  ziggurat: { label: 'Ziggurat-Casino', icon: '🎰', cost: 9000, w: 17, d: 17, h: 15, upkeep: 0, monument: true, desc: 'The Grand Monument. Finish it to win.' },
  outpost: { label: 'Guard Outpost', icon: '🪖', cost: 800, w: 6, d: 6, h: 8, workers: 2, guard: true, upkeep: 20, desc: 'Protests end sooner. Liberty suffers.' },
};

const SNAP = 1;                 // placement grid, world units
const ROT_STEP = Math.PI / 4;
const INPUT_CAP = 8;
const SHIP_INTERVAL = 70;

export function createBuildings(scene, terrain, scenery, icons, hooks) {
  const list = [];
  const meshes = {};
  let nextId = 1;

  for (const type in BUILDINGS) {
    const def = BUILDINGS[type];
    def.type = type;
    def.geometry = MODELS[type]();
    const mesh = new THREE.InstancedMesh(def.geometry, vertexLit, 24);
    mesh.name = `b:${type}`;
    mesh.count = 0; mesh.visible = false; mesh.frustumCulled = false;
    mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    scene.add(mesh);
    meshes[type] = mesh;
  }
  // Shared stone foundation: lets buildings sit level on sloped ground.
  const plots = new THREE.InstancedMesh(place(paint(new THREE.BoxGeometry(1, 7, 1), 0xb9ad94, 0.55), 0, -3.5, 0), vertexLit, 160);
  plots.count = 0; plots.frustumCulled = false; plots.name = 'foundations';
  scene.add(plots);

  const ghost = new THREE.Mesh(BUILDINGS.tenement.geometry, new THREE.MeshBasicMaterial({ color: 0x7dff7a, transparent: true, opacity: 0.6, depthWrite: false, fog: false }));
  ghost.visible = false; ghost.renderOrder = 6;
  scene.add(ghost);

  // --- geometry helpers ---------------------------------------------------------------
  /** Building-local (lx, lz) -> world. Local +Z is the building's front. */
  function toWorld(b, lx, lz, out) {
    const c = Math.cos(b.rot), s = Math.sin(b.rot);
    out.x = b.x + lx * c + lz * s;
    out.z = b.z - lx * s + lz * c;
    return out;
  }
  function contains(b, x, z, pad = 0) {
    const c = Math.cos(b.rot), s = Math.sin(b.rot), dx = x - b.x, dz = z - b.z;
    return Math.abs(dx * c - dz * s) < b.def.w / 2 + pad && Math.abs(dx * s + dz * c) < b.def.d / 2 + pad;
  }
  const tmp = { x: 0, z: 0 };

  /** Can `type` stand at (x, z, rot)? Returns { ok, reason, y }. */
  function validate(type, x, z, rot, ignore = null) {
    const def = BUILDINGS[type], probe = { x, z, rot, def };
    const hs = [];
    for (const fx of [-0.5, 0, 0.5]) for (const fz of [-0.5, 0, 0.5]) {
      toWorld(probe, fx * def.w, fz * def.d, tmp);
      hs.push(terrain.heightAt(tmp.x, tmp.z));
    }
    let y;
    if (def.coastal) {
      const back = (hs[0] + hs[3] + hs[6]) / 3, front = Math.max(hs[2], hs[5], hs[8]);
      if (back < 0.4) return { ok: false, reason: 'The back of the dock must rest on land' };
      if (front > -0.6) return { ok: false, reason: 'The pier must reach open water' };
      if (back > 4.5) return { ok: false, reason: 'Shore is too steep here' };
      y = 0.9;
    } else {
      const lo = Math.min(...hs), hi = Math.max(...hs);
      if (lo < 0.8) return { ok: false, reason: 'Too close to the water' };
      if (hi - lo > 5) return { ok: false, reason: 'Ground is too steep' };
      if (def.minHeight && hs[4] < def.minHeight) return { ok: false, reason: `Needs ${def.minHeight} m elevation (here: ${hs[4].toFixed(0)} m)` };
      y = hi;
    }
    const reach = Math.hypot(def.w, def.d) / 2;
    for (const key of ['palace', 'nest']) {
      if (Math.hypot(x - SITES[key].x, z - SITES[key].z) < SITES[key].r * 0.8 + reach * 0.7) return { ok: false, reason: `Too close to ${SITES[key].name}` };
    }
    for (const o of list) {
      if (o === ignore) continue;
      const far = reach + Math.hypot(o.def.w, o.def.d) / 2;
      if (Math.hypot(x - o.x, z - o.z) > far) continue;
      for (const fx of [-0.5, 0, 0.5]) for (const fz of [-0.5, 0, 0.5]) {
        toWorld(probe, fx * def.w, fz * def.d, tmp);
        if (contains(o, tmp.x, tmp.z, 1)) return { ok: false, reason: `Blocked by ${o.def.label}` };
        toWorld(o, fx * o.def.w, fz * o.def.d, tmp);
        if (contains(probe, tmp.x, tmp.z, 1)) return { ok: false, reason: `Blocked by ${o.def.label}` };
      }
    }
    return { ok: true, y };
  }

  const snap = (v) => Math.round(v / SNAP) * SNAP;

  function add(type, x, z, rot, built = false) {
    const def = BUILDINGS[type];
    const v = validate(type, x, z, rot);
    if (!v.ok) return null;
    const b = {
      id: nextId++, type, def, x, z, rot, y: v.y,
      progress: built ? 1 : 0, built, alive: true,
      workers: [], residents: [], present: 0,
      out: 0, inp: 0, prod: 0, boost: 0, stock: {}, made: 0,
      door: { x: 0, z: 0 },
    };
    // Farms are entered anywhere along the front; docks from the landward side.
    toWorld(b, 0, def.coastal ? -def.d / 2 - 1.2 : def.d / 2 + 1.2, b.door);
    list.push(b);
    scenery.clearArea((tx, tz) => contains(b, tx, tz, 1.5));
    return b;
  }

  function remove(b) {
    const i = list.indexOf(b);
    if (i < 0) return;
    list.splice(i, 1);
    b.alive = false;
    for (const o of b.workers) { o.job = null; }
    for (const o of b.residents) { o.home = null; }
    b.workers.length = 0; b.residents.length = 0;
  }

  /** Brute-force search for a legal spot near (cx, cz); used for the starter town. */
  function findSpot(type, cx, cz, minR = 10, maxR = 140) {
    for (let r = minR; r < maxR; r += 3) {
      for (let k = 0; k < 28; k++) {
        const a = (k / 28) * Math.PI * 2 + r;
        const x = snap(cx + Math.cos(a) * r), z = snap(cz + Math.sin(a) * r);
        for (let q = 0; q < 8; q++) {
          // Face the palace by preference so the town looks planned.
          const rot = (Math.round(Math.atan2(cx - x, cz - z) / ROT_STEP) + q) * ROT_STEP;
          if (validate(type, x, z, rot).ok) return { x, z, rot };
        }
      }
    }
    return null;
  }

  // --- queries used by society.js ---------------------------------------------------------
  const built = (pred) => list.filter((b) => b.built && pred(b));
  function nearest(x, z, pred) {
    let best = null, bd = Infinity;
    for (const b of list) {
      if (!pred(b)) continue;
      const d = (b.x - x) ** 2 + (b.z - z) ** 2;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  const at = (x, z) => list.find((b) => contains(b, x, z, 0.5)) || null;

  /** Where should a unit of `good` produced at `from` be carried? */
  function destinationFor(good, from) {
    if (good === 'food') return null; // eaten straight from the farm
    return nearest(from.x, from.z, (b) => b.built && b.def.consumes === good && b.inp < INPUT_CAP)
      || nearest(from.x, from.z, (b) => b.built && b.def.coastal);
  }
  function deliver(b, good, n) {
    if (b.def.consumes === good) b.inp = Math.min(INPUT_CAP + 2, b.inp + n);
    else if (b.def.coastal) b.stock[good] = (b.stock[good] || 0) + n;
  }

  /** Physical cargo dropped by the Hand. Returns a description of what happened, or null. */
  function receiveCargo(o) {
    const b = at(o.pos.x, o.pos.z);
    if (!b) return null;
    if (!b.built) { b.progress = Math.min(1, b.progress + 0.25); return { kind: 'build', b }; }
    if (b.def.coastal) {
      const good = o.type === 'barrel' ? 'rum' : 'sugar';
      b.stock[good] = (b.stock[good] || 0) + (o.type === 'barrel' ? 1 : 3);
      return { kind: 'export', b, good };
    }
    if (o.type === 'crate' && b.def.consumes) { b.inp = Math.min(INPUT_CAP + 2, b.inp + 3); return { kind: 'supply', b }; }
    return null;
  }

  // --- the freighter ------------------------------------------------------------------------
  const ship = new THREE.Mesh(merge([
    box(5, 2.2, 15, 0x7a2f2a, 0, -0.6, 0), box(4.2, 0.4, 13.6, 0xd9c7a3, 0, 1.6, 0),
    box(3.4, 2.6, 3.6, 0xf2efe6, 0, 2.0, -4.2), cyl(0.7, 0.8, 2.6, 7, 0xd0252b, 0, 4.6, -4.4),
    box(1.6, 1.4, 1.6, 0xc08a4a, 0, 2.0, 1.6), box(1.6, 1.4, 1.6, 0x4f8fb0, 0.4, 2.0, 4.0),
  ]), vertexLit);
  ship.visible = false; ship.name = 'freighter';
  scene.add(ship);
  const voyage = { phase: 'away', t: 25, dock: null, from: new THREE.Vector3(), to: new THREE.Vector3() };

  function updateShip(dt, time) {
    voyage.t -= dt;
    if (voyage.phase === 'away') {
      if (voyage.t > 0) return;
      const dock = list.find((b) => b.built && b.def.coastal && b.present > 0 && Object.values(b.stock).some((n) => n > 0));
      if (!dock) { voyage.t = 5; return; }
      voyage.dock = dock;
      toWorld(dock, 4.5, dock.def.d / 2 + 6, tmp); voyage.to.set(tmp.x, 0, tmp.z);
      toWorld(dock, 40, dock.def.d / 2 + 150, tmp); voyage.from.set(tmp.x, 0, tmp.z);
      voyage.phase = 'arrive'; voyage.t = 16;
      ship.visible = true;
      ship.rotation.y = Math.atan2(voyage.to.x - voyage.from.x, voyage.to.z - voyage.from.z);
    } else if (voyage.phase === 'arrive') {
      const k = 1 - Math.max(0, voyage.t) / 16;
      ship.position.lerpVectors(voyage.from, voyage.to, 1 - (1 - k) * (1 - k));
      if (voyage.t <= 0) { voyage.phase = 'load'; voyage.t = 5; }
    } else if (voyage.phase === 'load') {
      if (voyage.t <= 0) {
        const dock = voyage.dock;
        let total = 0; const sold = [];
        if (dock.alive) for (const good in dock.stock) {
          const n = dock.stock[good];
          if (n > 0) { total += n * GOODS[good].price; sold.push(`${n} ${GOODS[good].label.toLowerCase()}`); dock.stock[good] = 0; }
        }
        if (total > 0) hooks.onExport(total, sold, dock);
        voyage.phase = 'leave'; voyage.t = 14;
        ship.rotation.y += Math.PI;
      }
    } else if (voyage.phase === 'leave') {
      const k = 1 - Math.max(0, voyage.t) / 14;
      ship.position.lerpVectors(voyage.to, voyage.from, k * k);
      if (voyage.t <= 0) { voyage.phase = 'away'; voyage.t = SHIP_INTERVAL; ship.visible = false; }
    }
    ship.position.y = 0.5 + Math.sin(time * 1.3) * 0.15;
  }

  // --- per-frame ---------------------------------------------------------------------------
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0), tint = new THREE.Color();
  const counts = {};

  function update(dt, time) {
    for (const b of list) {
      if (!b.built) {
        // A site creeps along unattended; builders and dropped crates make it fly.
        b.progress += (dt * (0.2 + b.present) * (b.def.monument ? 11 : 22)) / b.def.cost;
        if (b.progress >= 1) { b.progress = 1; b.built = true; hooks.onBuilt(b); }
        continue;
      }
      if (b.boost > 0) b.boost -= dt;
      const def = b.def;
      if (def.produces && b.present > 0 && b.out < def.cap && (!def.consumes || b.inp > 0)) {
        b.prod += (dt * (b.present / def.workers) * (b.boost > 0 ? 2.5 : 1)) / def.cycle;
        if (b.prod >= 1) { b.prod -= 1; b.out++; b.made++; if (def.consumes) b.inp--; }
      }
    }
    updateShip(dt, time);
  }

  /** Push instance transforms and floating status icons. Called every rendered frame. */
  function render(time) {
    for (const type in meshes) counts[type] = 0;
    let np = 0;
    for (const b of list) {
      const mesh = meshes[b.type], i = counts[b.type]++;
      q.setFromAxisAngle(UP, b.rot);
      const rise = b.built ? 1 : 0.06 + 0.94 * b.progress;
      m4.compose(p.set(b.x, b.y, b.z), q, s.set(1, rise, 1));
      mesh.setMatrixAt(i, m4);
      const pulse = b.boost > 0 ? 1.25 + Math.sin(time * 8) * 0.15 : 1;
      mesh.setColorAt(i, b.built ? tint.setRGB(pulse, pulse, pulse * 0.92) : tint.setRGB(0.62, 0.66, 0.74));
      if (!b.def.coastal) {
        m4.compose(p.set(b.x, b.y + 0.02, b.z), q, s.set(b.def.w + 1, 1, b.def.d + 1));
        plots.setMatrixAt(np++, m4);
      }
      // Status: one icon for the most pressing problem, plus a bar where progress matters.
      const top = b.y + b.def.h * rise + 2.2;
      if (!b.built) {
        icons.add(b.x, top + 1.6, b.z, 2.6, '🏗️');
        icons.bar(b.x, top, b.z, 5, b.progress);
      } else if (b.def.workers && b.workers.length === 0) icons.add(b.x, top + 1, b.z, 2.6, '👷');
      else if (b.def.consumes && b.inp === 0) icons.add(b.x, top + 1, b.z, 2.6, '⛔');
      else if (b.def.produces && b.out >= b.def.cap) icons.add(b.x, top + 1, b.z, 2.6, '📦');
      else if (b.boost > 0) icons.add(b.x, top + 1, b.z, 2.6, '✨');
    }
    for (const type in meshes) {
      const mesh = meshes[type];
      mesh.count = counts[type];
      mesh.visible = counts[type] > 0;
      if (mesh.visible) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; }
    }
    plots.count = np; plots.visible = np > 0; plots.instanceMatrix.needsUpdate = true;
    if (voyage.phase === 'load') icons.add(ship.position.x, 9, ship.position.z, 3, '💰');
  }

  /** Blueprint preview. Returns the validation result for the snapped pose. */
  function showGhost(type, x, z, rot) {
    if (!type) { ghost.visible = false; return null; }
    const sx = snap(x), sz = snap(z);
    const v = validate(type, sx, sz, rot);
    ghost.geometry = BUILDINGS[type].geometry;
    ghost.visible = true;
    ghost.position.set(sx, v.ok ? v.y : Math.max(terrain.surfaceAt(sx, sz), 0.9), sz);
    ghost.rotation.y = rot;
    ghost.material.color.set(v.ok ? 0x7dff7a : 0xff5a4a);
    return { ...v, x: sx, z: sz };
  }

  return {
    list, add, remove, validate, findSpot, update, render, showGhost, at, nearest, built, contains, toWorld,
    destinationFor, deliver, receiveCargo, ROT_STEP,
    count: (type) => list.filter((b) => b.type === type && b.built).length,
  };
}
