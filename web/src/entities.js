// Physical things the Hand can grab: cargo, boulders and islanders. One InstancedMesh
// per type (4 draw calls total) with a small ballistic physics model: gravity, bounce
// against the terrain facets, buoyancy, sinking, and islanders who swim home.
import * as THREE from './three.js';
import { paint, place, merge, vertexLit } from './geo.js';
import { mulberry32, clamp } from './noise.js';
import { SITES } from './terrain.js';

const GRAVITY = 34;

const FIRST = ['Ramón', 'Lupita', 'Ernesto', 'Dolores', 'Chucho', 'Marisol', 'Fidelio', 'Consuelo',
  'Pancho', 'Xiomara', 'Benito', 'Rosalía', 'Ignacio', 'Yolanda', 'Teodoro', 'Inés'];
const LAST = ['Batista-Quetzal', 'del Ron', 'Guayabera', 'Montecristo', 'Plátano', 'Cienfuegos',
  'de la Siesta', 'Maracas', 'Tabaquero', 'Milagros'];
const JOBS = ['Cane cutter', 'Cigar roller', 'Dock hand', 'Unlicensed poet', 'Rum taster',
  'Goat consultant', 'Maraca tuner', 'Professional witness'];
const SHIRTS = [0xff6b5b, 0x4fc3f7, 0xffd54f, 0xa5d66f, 0xf48fb1, 0xffffff, 0xffa64d, 0xb39ddb];

function crateGeometry() {
  return merge([
    paint(new THREE.BoxGeometry(1.6, 1.6, 1.6), 0xc08a4a, 0.7),
    paint(new THREE.BoxGeometry(1.68, 0.22, 1.68), 0x7a5327),
    place(paint(new THREE.BoxGeometry(0.22, 1.68, 1.68), 0x7a5327), 0, 0, 0),
    place(paint(new THREE.BoxGeometry(0.9, 0.5, 0.06), 0xf6f1df), 0, 0.42, 0.82), // "AZÚCAR" label
  ]);
}

function barrelGeometry() {
  return merge([
    paint(new THREE.CylinderGeometry(0.66, 0.66, 1.7, 8), 0x9c5a2c, 0.7),
    place(paint(new THREE.CylinderGeometry(0.76, 0.76, 0.5, 8), 0xb46a34), 0, 0, 0),
    place(paint(new THREE.CylinderGeometry(0.72, 0.72, 0.14, 8), 0x3a3a3a), 0, 0.55, 0),
    place(paint(new THREE.CylinderGeometry(0.72, 0.72, 0.14, 8), 0x3a3a3a), 0, -0.55, 0),
  ]);
}

function boulderGeometry() {
  const g = new THREE.IcosahedronGeometry(1.35, 0);
  const rand = mulberry32(9);
  const pos = g.attributes.position;
  // Icosahedron vertices are duplicated per face: jitter by position hash so seams stay closed.
  for (let i = 0; i < pos.count; i++) {
    const k = Math.sin(pos.getX(i) * 12.9 + pos.getY(i) * 78.2 + pos.getZ(i) * 37.7) * 0.5 + 0.5;
    const s = 0.82 + k * 0.36 + rand() * 0;
    pos.setXYZ(i, pos.getX(i) * s, pos.getY(i) * s * 0.85, pos.getZ(i) * s);
  }
  return paint(g, 0x6f6963, 0.6);
}

function citizenGeometry() {
  // Origin at the feet. White shirt so the per-instance tint reads cleanly.
  return merge([
    place(paint(new THREE.CylinderGeometry(0.26, 0.44, 1.05, 6), 0xffffff, 0.75), 0, 0.53, 0),
    place(paint(new THREE.IcosahedronGeometry(0.27, 0), 0xc98d5e), 0, 1.27, 0),
    place(paint(new THREE.CylinderGeometry(0.56, 0.56, 0.06, 8), 0xe6cf8b), 0, 1.47, 0),
    place(paint(new THREE.ConeGeometry(0.26, 0.3, 6), 0xd9bd6f), 0, 1.64, 0),
    place(paint(new THREE.BoxGeometry(0.12, 0.1, 0.1), 0x3a2a1a), 0, 1.27, 0.26), // moustache = "front"
  ]);
}

export const TYPES = {
  crate: { cap: 64, ground: 0.8, mass: 1.0, floats: true, bounce: 0.3, icon: '📦', label: 'Sugar Crate', geometry: crateGeometry },
  barrel: { cap: 64, ground: 0.85, mass: 1.2, floats: true, bounce: 0.38, icon: '🛢️', label: 'Rum Barrel', geometry: barrelGeometry },
  boulder: { cap: 40, ground: 1.05, mass: 5.0, floats: false, bounce: 0.22, icon: '🪨', label: 'Boulder', geometry: boulderGeometry },
  citizen: { cap: 120, ground: 0, mass: 0.7, floats: true, bounce: 0.25, icon: '🧑‍🌾', label: 'Islander', geometry: citizenGeometry },
};

export function createEntities(scene, terrain, onEvent) {
  const rand = mulberry32(2024);
  const lists = {}, meshes = {}, dirtyColors = {};
  let nextId = 1;

  for (const type in TYPES) {
    const def = TYPES[type];
    const mesh = new THREE.InstancedMesh(def.geometry(), vertexLit, def.cap);
    mesh.name = type;
    mesh.count = 0;
    mesh.frustumCulled = false; // instances roam the whole island
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    scene.add(mesh);
    meshes[type] = mesh;
    lists[type] = [];
    dirtyColors[type] = true;
  }

  const UP = new THREE.Vector3(0, 1, 0);
  const n = new THREE.Vector3(), axis = new THREE.Vector3(), dq = new THREE.Quaternion();
  const qTarget = new THREE.Quaternion(), m4 = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1);
  const LYING = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

  function spawn(type, x, y, z, vel) {
    const def = TYPES[type], list = lists[type];
    if (list.length >= def.cap) return null;
    const o = {
      id: nextId++, type, def,
      pos: new THREE.Vector3(x, y, z),
      vel: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      spin: new THREE.Vector3(),
      state: 'air', timer: 0, yaw: rand() * Math.PI * 2,
      thrown: false, throwFrom: null,
      tint: new THREE.Color(1, 1, 1),
    };
    if (vel) o.vel.copy(vel);
    if (type === 'citizen') {
      o.name = `${FIRST[Math.floor(rand() * FIRST.length)]} ${LAST[Math.floor(rand() * LAST.length)]}`;
      o.job = JOBS[Math.floor(rand() * JOBS.length)];
      o.tint.set(SHIRTS[Math.floor(rand() * SHIRTS.length)]);
      o.target = new THREE.Vector2(x, z);
      o.speed = 2.2 + rand() * 1.2;
      o.dunkings = 0;
    } else {
      const v = 0.85 + rand() * 0.25;
      o.tint.setRGB(v, v, v);
    }
    list.push(o);
    dirtyColors[type] = true;
    return o;
  }

  function remove(o) {
    const list = lists[o.type];
    const i = list.indexOf(o);
    if (i < 0) return;
    list[i] = list[list.length - 1];
    list.pop();
    o.state = 'gone';
    dirtyColors[o.type] = true;
  }

  function pickTarget(o) {
    for (let k = 0; k < 8; k++) {
      const a = rand() * Math.PI * 2, d = 6 + rand() * 22;
      const tx = o.pos.x + Math.cos(a) * d, tz = o.pos.z + Math.sin(a) * d;
      const h = terrain.heightAt(tx, tz);
      if (h > 0.8 && h < 24) { o.target.set(tx, tz); return; }
    }
    o.target.set(SITES.palace.x + (rand() - 0.5) * 20, SITES.palace.z + (rand() - 0.5) * 20);
  }

  function yawQuat(o, lean, out) {
    out.setFromAxisAngle(UP, o.yaw);
    if (lean) { dq.setFromAxisAngle(axis.set(0, 0, 1), lean); out.multiply(dq); }
    return out;
  }

  function stepAirborne(o, dt) {
    o.vel.y -= GRAVITY * dt;
    o.pos.addScaledVector(o.vel, dt);
    const w = o.spin.length();
    if (w > 0.01) {
      dq.setFromAxisAngle(axis.copy(o.spin).divideScalar(w), w * dt);
      o.quat.premultiply(dq);
    }
    const g = terrain.heightAt(o.pos.x, o.pos.z);
    const off = o.def.ground;

    if (g < -0.05 && o.pos.y - off * 0.5 <= 0) { // splashdown
      const speed = o.vel.length();
      o.vel.multiplyScalar(0.15); o.vel.y = 0;
      o.spin.multiplyScalar(0.2);
      if (o.type === 'citizen') { o.state = 'swim'; o.dunkings++; }
      else o.state = o.def.floats ? 'float' : 'sink';
      onEvent('splash', o, { speed });
      if (o.thrown) onEvent('landed', o, { distance: Math.hypot(o.pos.x - o.throwFrom.x, o.pos.z - o.throwFrom.z) });
      o.thrown = false;
      return;
    }
    if (o.pos.y <= g + off) {
      o.pos.y = g + off;
      terrain.normalAt(o.pos.x, o.pos.z, n);
      const vn = o.vel.dot(n);
      if (vn < 0) {
        o.vel.addScaledVector(n, -(1 + o.def.bounce) * vn);
        o.vel.multiplyScalar(0.7);
        o.spin.multiplyScalar(0.6);
        if (-vn > 5) onEvent('impact', o, { strength: -vn * o.def.mass });
        if (o.thrown) {
          onEvent('landed', o, { distance: Math.hypot(o.pos.x - o.throwFrom.x, o.pos.z - o.throwFrom.z) });
          o.thrown = false;
        }
      }
      if (o.vel.lengthSq() < 9) { // come to rest
        o.vel.set(0, 0, 0); o.spin.set(0, 0, 0);
        if (o.type === 'citizen') { o.state = 'dazed'; o.timer = 1.4 + rand(); }
        else o.state = 'rest';
      }
    }
  }

  function stepCitizen(o, dt, time) {
    switch (o.state) {
      case 'walk': {
        const dx = o.target.x - o.pos.x, dz = o.target.y - o.pos.z;
        const d = Math.hypot(dx, dz);
        o.timer -= dt;
        if (d < 0.6 || o.timer <= 0) { o.state = 'idle'; o.timer = 1 + rand() * 4; break; }
        const nx = o.pos.x + (dx / d) * o.speed * dt, nz = o.pos.z + (dz / d) * o.speed * dt;
        if (terrain.heightAt(nx, nz) < 0.4) { pickTarget(o); break; } // nobody walks into the sea voluntarily
        o.pos.x = nx; o.pos.z = nz;
        o.pos.y = terrain.heightAt(nx, nz);
        o.yaw = Math.atan2(dx, dz);
        yawQuat(o, Math.sin(time * 11 + o.id) * 0.09, qTarget);
        o.quat.rotateTowards(qTarget, dt * 10);
        break;
      }
      case 'idle':
        o.timer -= dt;
        o.pos.y = terrain.heightAt(o.pos.x, o.pos.z);
        o.quat.rotateTowards(yawQuat(o, 0, qTarget), dt * 8);
        if (o.timer <= 0) { pickTarget(o); o.state = 'walk'; o.timer = 20; }
        break;
      case 'dazed': // flat on their back, contemplating the President
        o.timer -= dt;
        if (o.timer > 0.5) o.quat.rotateTowards(yawQuat(o, 0, qTarget).multiply(LYING), dt * 9);
        else o.quat.rotateTowards(yawQuat(o, 0, qTarget), dt * 7);
        if (o.timer <= 0) { o.state = 'idle'; o.timer = 0.4; }
        break;
      case 'siesta':
        o.timer -= dt;
        o.pos.y = terrain.heightAt(o.pos.x, o.pos.z) + 0.15;
        o.quat.rotateTowards(yawQuat(o, 0, qTarget).multiply(LYING), dt * 4);
        if (o.timer <= 0) { o.state = 'idle'; o.timer = 0.5 + rand() * 2; }
        break;
      case 'swim': {
        // Head for the palace until the feet find sand.
        const dx = SITES.palace.x - o.pos.x, dz = SITES.palace.z - o.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        o.pos.x += (dx / d) * 3.4 * dt; o.pos.z += (dz / d) * 3.4 * dt;
        o.yaw = Math.atan2(dx, dz);
        const g = terrain.heightAt(o.pos.x, o.pos.z);
        o.pos.y += (Math.max(g, -0.85 + Math.sin(time * 5 + o.id) * 0.1) - o.pos.y) * Math.min(1, dt * 6);
        yawQuat(o, Math.sin(time * 7 + o.id) * 0.25, qTarget);
        o.quat.rotateTowards(qTarget, dt * 6);
        if (g > 0.3) { o.state = 'idle'; o.timer = 1.5; onEvent('ashore', o, {}); }
        break;
      }
    }
  }

  function update(dt, time) {
    if (dt > 0) {
      for (const type in lists) {
        const list = lists[type];
        for (let i = list.length - 1; i >= 0; i--) {
          const o = list[i];
          if (o.state === 'held') continue;
          if (o.state === 'air') { stepAirborne(o, dt); continue; }
          if (type === 'citizen') { stepCitizen(o, dt, time); continue; }
          if (o.state === 'rest') {
            o.quat.rotateTowards(yawQuat(o, 0, qTarget), dt * 5);
          } else if (o.state === 'float') {
            o.pos.addScaledVector(o.vel, dt);
            o.vel.multiplyScalar(Math.exp(-1.5 * dt));
            const g = terrain.heightAt(o.pos.x, o.pos.z);
            const bob = -0.3 + Math.sin(time * 1.7 + o.id) * 0.14;
            o.pos.y += (Math.max(bob, g + o.def.ground) - o.pos.y) * Math.min(1, dt * 5);
            dq.setFromAxisAngle(axis.set(Math.sin(o.id), 0, Math.cos(o.id)), Math.sin(time * 1.3 + o.id) * 0.2);
            o.quat.rotateTowards(yawQuat(o, 0, qTarget).premultiply(dq), dt * 2);
            if (g > -0.05) o.state = 'rest';
          } else if (o.state === 'sink') {
            o.pos.y -= 3 * dt;
            if (o.pos.y < terrain.heightAt(o.pos.x, o.pos.z) - 1) { onEvent('lost', o, {}); remove(o); }
          }
        }
      }
    }
    // Push transforms to the GPU.
    for (const type in lists) {
      const list = lists[type], mesh = meshes[type];
      for (let i = 0; i < list.length; i++) {
        m4.compose(list[i].pos, list[i].quat, one);
        mesh.setMatrixAt(i, m4);
        if (dirtyColors[type]) mesh.setColorAt(i, list[i].tint);
      }
      mesh.count = list.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (dirtyColors[type]) { mesh.instanceColor.needsUpdate = true; dirtyColors[type] = false; }
    }
  }

  /** Closest grabbable to a ground point, or null. */
  function nearest(x, z, maxDist) {
    let best = null, bestD = maxDist * maxDist;
    for (const type in lists) {
      for (const o of lists[type]) {
        if (o.state === 'held' || o.state === 'sink') continue;
        const d = (o.pos.x - x) ** 2 + (o.pos.z - z) ** 2;
        if (d < bestD) { bestD = d; best = o; }
      }
    }
    return best;
  }

  function forEachNear(x, z, radius, fn) {
    for (const type in lists) {
      for (const o of lists[type]) {
        if (o.state === 'held' || o.state === 'sink') continue;
        const d = Math.hypot(o.pos.x - x, o.pos.z - z);
        if (d < radius) fn(o, d);
      }
    }
  }

  /** Throw an object into ballistic flight. */
  function launch(o, vx, vy, vz, spin = 1) {
    o.state = 'air';
    o.vel.set(vx, vy, vz);
    const s = clamp(o.vel.length() * 0.22, 0, 9) * spin;
    o.spin.set((rand() - 0.5) * s, (rand() - 0.5) * s * 0.5, (rand() - 0.5) * s);
  }

  /** Radial shove: the Tremor miracle and the blessing "hop" both use this. */
  function shockwave(x, z, radius, strength) {
    let count = 0;
    forEachNear(x, z, radius, (o, d) => {
      const f = (1 - d / radius) * strength / Math.sqrt(o.def.mass);
      const dx = d > 0.01 ? (o.pos.x - x) / d : 0, dz = d > 0.01 ? (o.pos.z - z) / d : 0;
      launch(o, dx * f * 0.7, f, dz * f * 0.7);
      count++;
    });
    return count;
  }

  /** Mandatory Siesta edict. */
  function siesta(seconds) {
    let count = 0;
    for (const o of lists.citizen) {
      if (o.state === 'walk' || o.state === 'idle') { o.state = 'siesta'; o.timer = seconds * (0.8 + rand() * 0.4); count++; }
    }
    return count;
  }

  function clearCargo() {
    let count = 0;
    for (const type of ['crate', 'barrel', 'boulder']) {
      for (const o of [...lists[type]]) if (o.state !== 'held') { remove(o); count++; }
    }
    return count;
  }

  /** Initial population: islanders around the palace plaza, cargo on the plaza. */
  function populate() {
    const P = SITES.palace;
    let made = 0;
    for (let k = 0; k < 400 && made < 36; k++) {
      const a = rand() * Math.PI * 2, d = 10 + rand() * 60;
      const x = P.x + Math.cos(a) * d, z = P.z + Math.sin(a) * d;
      const h = terrain.heightAt(x, z);
      if (h < 1 || h > 20) continue;
      const c = spawn('citizen', x, h, z);
      c.state = 'idle'; c.timer = rand() * 3;
      made++;
    }
    const cargo = ['crate', 'crate', 'barrel', 'crate', 'barrel', 'boulder', 'barrel', 'boulder'];
    cargo.forEach((type, i) => {
      const a = 0.5 + (i / cargo.length - 0.5) * 1.5;
      const x = P.x + Math.sin(a) * 13 + (rand() - 0.5) * 2, z = P.z + Math.cos(a) * 13 + (rand() - 0.5) * 2;
      const o = spawn(type, x, terrain.heightAt(x, z) + TYPES[type].ground, z);
      o.state = 'rest';
    });
  }

  return {
    lists, spawn, remove, update, nearest, forEachNear, launch, shockwave, siesta, clearCargo, populate,
    count: (type) => lists[type].length,
  };
}
