// Static scenery: GPU-instanced palms, jungle trees and rocks (3 draw calls for ~1100
// objects), plus the Presidential Palace and the Creature's nest as merged meshes.
import * as THREE from './three.js';
import { paint, place, merge, vertexLit } from './geo.js';
import { mulberry32, makeNoise2D } from './noise.js';
import { SITES } from './terrain.js';

function palmGeometry() {
  const parts = [
    place(paint(new THREE.CylinderGeometry(0.16, 0.3, 5.2, 5), 0x9a7b4f, 0.7), 0.25, 2.6, 0, 0, 0, -0.1),
    place(paint(new THREE.IcosahedronGeometry(0.34, 0), 0x6b4a2b), 0.5, 5.15, 0),
  ];
  for (let i = 0; i < 7; i++) {
    const frond = paint(new THREE.ConeGeometry(0.55, 3.4, 4), i % 2 ? 0x3fa34d : 0x58b947, 0.75);
    place(frond, 0, 1.7, 0, 0, 0, 0, new THREE.Vector3(1, 1, 0.22));
    place(frond, 0, 0, 0, 0, 0, -(Math.PI / 2 + 0.3 + (i % 3) * 0.12));
    place(frond, 0.5, 5.25, 0, 0, (i / 7) * Math.PI * 2);
    parts.push(frond);
  }
  return merge(parts);
}

function jungleTreeGeometry() {
  return merge([
    place(paint(new THREE.CylinderGeometry(0.22, 0.36, 2.6, 5), 0x6e4f33, 0.7), 0, 1.3, 0),
    place(paint(new THREE.IcosahedronGeometry(1.9, 0), 0x2f9a4a, 0.62), 0, 3.7, 0),
    place(paint(new THREE.IcosahedronGeometry(1.25, 0), 0x45b85a, 0.8), 0.5, 5.2, 0.3, 0.4, 0.8, 0),
  ]);
}

function rockGeometry() {
  return place(paint(new THREE.DodecahedronGeometry(1, 0), 0x8a8177, 0.6), 0, 0.35, 0, 0, 0, 0, new THREE.Vector3(1.2, 0.75, 1));
}

function palaceGeometry() {
  const MARBLE = 0xf4efe2, GOLD = 0xe8b530, TERRACOTTA = 0xc8643c, STONE = 0xcbbf9f;
  const parts = [
    place(paint(new THREE.BoxGeometry(19, 1.2, 13), STONE, 0.75), 0, 0.6, 0),
    place(paint(new THREE.BoxGeometry(9, 0.6, 3), STONE, 0.8), 0, 0.3, 7.6),         // steps
    place(paint(new THREE.BoxGeometry(11, 5, 7.5), MARBLE, 0.72), 0, 3.7, -0.6),     // main hall
    place(paint(new THREE.BoxGeometry(4.2, 3.6, 6), MARBLE, 0.72), -7.2, 3.0, -0.6), // west wing
    place(paint(new THREE.BoxGeometry(4.2, 3.6, 6), MARBLE, 0.72), 7.2, 3.0, -0.6),  // east wing
    place(paint(new THREE.BoxGeometry(4.8, 0.5, 6.6), TERRACOTTA), -7.2, 5.05, -0.6),
    place(paint(new THREE.BoxGeometry(4.8, 0.5, 6.6), TERRACOTTA), 7.2, 5.05, -0.6),
    place(paint(new THREE.BoxGeometry(12.4, 0.7, 10.6), MARBLE, 0.85), 0, 6.55, 0.4), // portico roof
    place(paint(new THREE.CylinderGeometry(2.6, 3.1, 1.3, 8), MARBLE, 0.8), 0, 7.5, -0.6),
    place(paint(new THREE.SphereGeometry(2.6, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), GOLD, 0.8), 0, 8.1, -0.6),
    place(paint(new THREE.ConeGeometry(0.3, 1.8, 5), GOLD), 0, 11.4, -0.6),
    place(paint(new THREE.CylinderGeometry(0.08, 0.08, 6, 4), 0x555555), 8.6, 4.2, 5.4), // flagpole
    place(paint(new THREE.BoxGeometry(2.4, 1.4, 0.08), 0xd0252b), 9.85, 6.4, 5.4),
    place(paint(new THREE.BoxGeometry(0.8, 0.5, 0.1), GOLD), 9.4, 6.5, 5.42),
  ];
  for (let i = 0; i < 6; i++) {
    parts.push(place(paint(new THREE.CylinderGeometry(0.38, 0.44, 5, 6), MARBLE, 0.78), -5 + i * 2, 3.7, 4.6));
  }
  return merge(parts);
}

function nestGeometry() {
  const rand = mulberry32(42);
  const parts = [
    place(paint(new THREE.CylinderGeometry(5.2, 6, 1.1, 10), 0xc9a45a, 0.65), 0, 0.5, 0),
    place(paint(new THREE.CylinderGeometry(4.1, 4.4, 0.5, 10), 0x8f6f38, 0.9), 0, 1.0, 0),
  ];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const s = 0.9 + rand() * 0.9;
    parts.push(place(paint(new THREE.DodecahedronGeometry(1, 0), 0x857c72, 0.6),
      Math.cos(a) * 7.2, 0.4, Math.sin(a) * 7.2, rand(), rand() * 3, 0, s));
  }
  return merge(parts);
}

export function createScenery(scene, terrain, seed = 7) {
  const rand = mulberry32(seed);
  const density = makeNoise2D(seed + 5);
  const normal = new THREE.Vector3();
  const palms = [], trees = [], rocks = [];

  const nearSite = (x, z, pad) =>
    [SITES.palace, SITES.nest].some((s) => Math.hypot(x - s.x, z - s.z) < s.r * pad);

  for (let attempt = 0; attempt < 9000; attempt++) {
    const x = (rand() - 0.5) * 300, z = (rand() - 0.5) * 300;
    const h = terrain.heightAt(x, z);
    if (h < 1.3 || h > 31 || nearSite(x, z, 1.3)) continue;
    terrain.normalAt(x, z, normal);
    const n = density(x * 0.03, z * 0.03);
    const roll = rand();
    if (normal.y < 0.82) {
      if (roll < 0.25 && rocks.length < 130) rocks.push({ x, y: h, z, s: 0.7 + rand() * 1.6 });
    } else if (h < 5.5) {
      if (roll < 0.3 + n * 0.25 && palms.length < 340) palms.push({ x, y: h, z, s: 0.8 + rand() * 0.6 });
      else if (roll > 0.985 && rocks.length < 130) rocks.push({ x, y: h, z, s: 0.5 + rand() * 0.8 });
    } else if (roll < 0.1 + n * 0.55 && trees.length < 680) {
      trees.push({ x, y: h, z, s: 0.75 + rand() * 0.6 });
    }
  }

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const p = new THREE.Vector3(), s = new THREE.Vector3(), tint = new THREE.Color();

  const groups = [];
  function instanced(geometry, list, name, tilt) {
    const mesh = new THREE.InstancedMesh(geometry, vertexLit, list.length);
    groups.push({ mesh, list });
    mesh.name = name;
    list.forEach((it, i) => {
      e.set((rand() - 0.5) * tilt, rand() * Math.PI * 2, (rand() - 0.5) * tilt);
      m4.compose(p.set(it.x, it.y - 0.15, it.z), q.setFromEuler(e), s.setScalar(it.s));
      mesh.setMatrixAt(i, m4);
      const v = 0.82 + rand() * 0.3;
      mesh.setColorAt(i, tint.setRGB(v, v * (0.95 + rand() * 0.1), v * 0.92));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
    return mesh;
  }

  instanced(palmGeometry(), palms, 'palms', 0.22);
  instanced(jungleTreeGeometry(), trees, 'jungle', 0.1);
  instanced(rockGeometry(), rocks, 'rocks', 0.5);

  const palace = new THREE.Mesh(palaceGeometry(), vertexLit);
  palace.name = 'palace';
  palace.position.set(SITES.palace.x, SITES.palace.level - 0.1, SITES.palace.z);
  palace.rotation.y = 0.5;
  scene.add(palace);

  const nest = new THREE.Mesh(nestGeometry(), vertexLit);
  nest.name = 'nest';
  nest.position.set(SITES.nest.x, SITES.nest.level - 0.1, SITES.nest.z);
  scene.add(nest);

  /** Bulldoze scenery wherever inside(x, z) is true (construction sites clear their plot). */
  function clearArea(inside) {
    let cleared = 0;
    for (const { mesh, list } of groups) {
      let dirty = false;
      list.forEach((it, i) => {
        if (it.gone || !inside(it.x, it.z)) return;
        it.gone = true; dirty = true; cleared++;
        mesh.setMatrixAt(i, m4.makeScale(0, 0, 0));
      });
      if (dirty) mesh.instanceMatrix.needsUpdate = true;
    }
    return cleared;
  }

  const egg = new THREE.Mesh(
    place(paint(new THREE.IcosahedronGeometry(2.2, 1), 0xf3ead2, 0.7), 0, 3.5, 0, 0.1, 0, 0.08, new THREE.Vector3(1, 1.32, 1)), vertexLit);
  egg.name = 'egg';
  egg.position.copy(nest.position);
  scene.add(egg);

  return { egg, clearArea, counts: { palms: palms.length, trees: trees.length, rocks: rocks.length } };
}
