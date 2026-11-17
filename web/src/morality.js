// Alignment and island morphing.
// Two axes, each -1..1:  benevolence (Benevolent vs Ruthless)  and  spirit (Spiritual vs Corrupt).
// Benevolence drives the look of the world: every vertex-lit material shares one shader
// uniform that saturates foliage toward emerald or drains it toward ash; the sky, fog,
// water, palace dressing (sunbeams vs obsidian spikes and loudspeakers) and the music
// all follow the same smoothed value.
import * as THREE from './three.js';
import { paint, place, merge, vertexLit, morph } from './geo.js';
import { SITES } from './terrain.js';
import { clamp } from './noise.js';

export function createMorality(scene, sky, water) {
  const M = { benevolence: 0, spirit: 0, shown: 0, deeds: [] };
  const P = SITES.palace;

  /** Record a moral act. Small numbers: 0.02 is a nudge, 0.2 is an atrocity or a miracle. */
  M.shift = (benevolence, spirit, why) => {
    M.benevolence = clamp(M.benevolence + benevolence, -1, 1);
    M.spirit = clamp(M.spirit + spirit, -1, 1);
    if (why && (Math.abs(benevolence) >= 0.05 || Math.abs(spirit) >= 0.05)) {
      M.deeds.unshift({ why, benevolence, spirit });
      if (M.deeds.length > 5) M.deeds.pop();
    }
  };

  M.label = () => {
    const b = M.benevolence, s = M.spirit;
    const a = b > 0.25 ? 'Benevolent' : b < -0.25 ? 'Ruthless' : 'Pragmatic';
    const c = s > 0.25 ? 'Spiritual' : s < -0.25 ? 'Corrupt' : 'Worldly';
    return `${a} · ${c}`;
  };

  // --- palace dressing ---------------------------------------------------------------------
  const OBSIDIAN = 0x1c151b, parts = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + (i % 2) * 0.12, r = 12.5 + (i % 3) * 2.2, h = 5 + ((i * 7) % 5) * 1.6;
    parts.push(place(paint(new THREE.ConeGeometry(1.1 + (i % 2) * 0.5, h, 5), OBSIDIAN, 0.5),
      Math.cos(a) * r, h / 2 - 0.4, Math.sin(a) * r, Math.cos(a) * 0.22, 0, -Math.sin(a) * 0.22));
  }
  for (const [x, z] of [[-9, 9], [9, 9], [-9, -8], [9, -8]]) { // propaganda loudspeakers
    parts.push(place(paint(new THREE.CylinderGeometry(0.18, 0.22, 9, 5), 0x4a4a4a, 0.8), x, 4.5, z));
    parts.push(place(paint(new THREE.ConeGeometry(1.1, 1.8, 6), 0x8a8f96, 0.9), x, 9, z + 0.8, Math.PI / 2, 0, 0));
    parts.push(place(paint(new THREE.BoxGeometry(1.6, 1.0, 0.1), 0xd0252b), x, 6.4, z + 0.3));
  }
  const spikes = new THREE.Mesh(merge(parts), vertexLit);
  spikes.name = 'ruthless-dressing';
  spikes.position.set(P.x, 0, P.z);
  spikes.rotation.y = 0.5;
  spikes.visible = false;
  scene.add(spikes);

  const beamGeo = merge([-9, -3, 3, 9, 0].map((x, i) =>
    place(paint(new THREE.CylinderGeometry(0.6, 4.5, 60, 6, 1, true), 0xffe9a0), x, 30, i === 4 ? -6 : 3 - Math.abs(x) * 0.3, 0.12, 0, x * -0.012)));
  const beams = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
    color: 0xffe08a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide,
  }));
  beams.name = 'sunbeams';
  beams.position.set(P.x, 0, P.z);
  beams.visible = false;
  beams.renderOrder = 4;
  scene.add(beams);

  M.setPalaceLevel = (y) => { spikes.position.y = y; beams.position.y = y; };

  M.update = (dt, time) => {
    M.shown += (M.benevolence - M.shown) * Math.min(1, dt * 0.5);
    const v = M.shown, ruth = Math.max(0, -v), bene = Math.max(0, v);
    morph.value = v;
    sky.env.morph = v;
    water.setMorph(v);
    spikes.visible = ruth > 0.03;
    spikes.scale.set(1, Math.min(1, ruth * 1.4), 1);
    beams.visible = bene > 0.08 && sky.env.daylight > 0.3;
    beams.material.opacity = bene * 0.16 * sky.env.daylight * (0.85 + Math.sin(time * 0.7) * 0.15);
    beams.rotation.y = time * 0.03;
  };

  return M;
}

/** A local downpour: one Points draw call, only while a Rainstorm miracle is active. */
export function createRain(scene, terrain) {
  const COUNT = 500, RADIUS = 34, TOP = 46;
  const positions = new Float32Array(COUNT * 3), seeds = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * RADIUS;
    seeds[i * 3] = Math.cos(a) * r; seeds[i * 3 + 1] = Math.random(); seeds[i * 3 + 2] = Math.sin(a) * r;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xbfe6ff, size: 0.55, transparent: true, opacity: 0.85, depthWrite: false, fog: false }));
  points.frustumCulled = false;
  points.visible = false;
  scene.add(points);
  let left = 0, cx = 0, cz = 0, ground = 0, t = 0;
  return {
    start(x, z, seconds) { cx = x; cz = z; left = seconds; ground = terrain.surfaceAt(x, z); points.visible = true; },
    update(dt) {
      if (left <= 0) return;
      left -= dt; t += dt;
      for (let i = 0; i < COUNT; i++) {
        positions[i * 3] = cx + seeds[i * 3];
        positions[i * 3 + 1] = ground + TOP * (1 - ((seeds[i * 3 + 1] + t * 1.3) % 1));
        positions[i * 3 + 2] = cz + seeds[i * 3 + 2];
      }
      geometry.attributes.position.needsUpdate = true;
      points.material.opacity = Math.min(0.85, left);
      if (left <= 0) points.visible = false;
    },
  };
}
