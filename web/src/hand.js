// "La Mano del Presidente": a floating white dress glove with a gold cuff.
// Left stick moves it (camera-relative), L2 slows it for precision, R2 grabs.
// Hold R2 and release to throw with the hand's momentum, or tap R2 to latch an
// object in the fist and tap again to let go.
import * as THREE from './three.js';
import { paint, place, merge } from './geo.js';
import { clamp, lerp } from './noise.js';

const MOVE_SPEED = 48;
const PRECISION_FACTOR = 0.26;
const HOVER = 9;
const REACH_TIME = 0.13;
const TAP_TIME = 0.26;
const ROAM_RADIUS = 168;

/** A ring or disc that drapes over the terrain facets under the cursor. */
function createGroundDecal(scene, inner, outer, segments, color, opacity) {
  const rows = inner > 0 ? 2 : 1;
  const count = rows * (segments + 1) + (inner > 0 ? 0 : 1);
  const positions = new Float32Array(count * 3);
  const index = [];
  for (let k = 0; k < segments; k++) {
    if (inner > 0) {
      const a = k * 2, b = a + 1, c = a + 2, d = a + 3;
      index.push(a, c, b, b, c, d);
    } else {
      index.push(segments + 1, k + 1, k);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setIndex(index);
  const material = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthWrite: false, fog: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  scene.add(mesh);

  return {
    mesh, material,
    /** Re-drape at (x, z). `scale` multiplies both radii. */
    drape(terrain, x, z, scale = 1, lift = 0.22) {
      let o = 0;
      for (let k = 0; k <= segments; k++) {
        const a = (k / segments) * Math.PI * 2, cs = Math.cos(a), sn = Math.sin(a);
        if (inner > 0) {
          const ix = x + cs * inner * scale, iz = z + sn * inner * scale;
          positions[o++] = ix; positions[o++] = terrain.surfaceAt(ix, iz) + lift; positions[o++] = iz;
        }
        const ox = x + cs * outer * scale, oz = z + sn * outer * scale;
        positions[o++] = ox; positions[o++] = terrain.surfaceAt(ox, oz) + lift; positions[o++] = oz;
      }
      if (inner === 0) {
        positions[o++] = x; positions[o++] = terrain.surfaceAt(x, z) + lift; positions[o++] = z;
      }
      geometry.attributes.position.needsUpdate = true;
    },
  };
}

function buildGlove() {
  const GLOVE = 0xfaf7ee, SEAM = 0xd9d2bf, GOLD = 0xe8b530, RUBY = 0xc8202c;
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x30302c });
  const root = new THREE.Group();

  // Palm + cuff: one merged mesh. Fingers point along local -Z, palm faces -Y.
  const palm = new THREE.Mesh(merge([
    paint(new THREE.BoxGeometry(2.3, 0.7, 2.3), GLOVE, 0.82),
    place(paint(new THREE.BoxGeometry(2.0, 0.6, 0.5), SEAM), 0, 0.02, 1.3),
    place(paint(new THREE.CylinderGeometry(1.2, 1.32, 1.1, 8), GOLD, 0.8), 0, 0, 2.0, Math.PI / 2, 0, 0, new THREE.Vector3(1, 1, 0.5)),
    place(paint(new THREE.OctahedronGeometry(0.34, 0), RUBY), 0, 0.42, 2.0),
  ]), material);
  root.add(palm);

  const fingers = [];
  function finger(x, z, yaw, length, width) {
    const knuckle = new THREE.Group();
    knuckle.position.set(x, 0, z);
    knuckle.rotation.order = 'YXZ';
    knuckle.rotation.y = yaw;
    const seg1 = new THREE.Mesh(place(paint(new THREE.BoxGeometry(width, 0.52, length), GLOVE, 0.85), 0, 0, -length / 2), material);
    const joint = new THREE.Group();
    joint.position.set(0, 0, -length);
    const seg2 = new THREE.Mesh(place(paint(new THREE.BoxGeometry(width * 0.92, 0.46, length * 0.85), GLOVE, 0.85), 0, 0, -length * 0.42), material);
    joint.add(seg2);
    knuckle.add(seg1, joint);
    root.add(knuckle);
    const f = { knuckle, joint, curl: 0 };
    fingers.push(f);
    return f;
  }
  const index = finger(-0.84, -1.15, 0.05, 1.05, 0.5);
  finger(-0.28, -1.15, 0, 1.2, 0.5);
  finger(0.28, -1.15, 0, 1.1, 0.5);
  finger(0.84, -1.15, -0.05, 0.85, 0.46);
  const thumb = finger(-1.2, 0.35, 1.05, 0.9, 0.56);

  return { root, fingers, index, thumb };
}

export function createHand(scene, terrain, entities, input, fx) {
  const glove = buildGlove();
  glove.root.rotation.order = 'YXZ';
  glove.root.scale.setScalar(2);
  scene.add(glove.root);

  const cursor = createGroundDecal(scene, 2.5, 3.1, 40, 0xffd34d, 0.9);
  const shadow = createGroundDecal(scene, 0, 3.6, 20, 0x000000, 0.28);

  const marker = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.55, 0),
    new THREE.MeshBasicMaterial({ color: 0xffe066, fog: false })
  );
  marker.visible = false;
  scene.add(marker);

  const hand = {
    pos: new THREE.Vector3(),      // cursor point on the ground
    world: glove.root.position,    // where the glove actually floats
    vel: new THREE.Vector3(),      // smoothed, used as throw momentum
    mode: 'open',                  // open | reach | hold
    held: null,
    hover: null,                   // grabbable under the cursor
    precision: false,
    stats: { grabs: 0, throws: 0, longest: 0 },
  };
  let hoverY = HOVER, reachTimer = 0, pressAge = 0, latched = false, candidate = null;
  const prev = new THREE.Vector3();
  const COLOR_IDLE = new THREE.Color(0xffd34d), COLOR_TARGET = new THREE.Color(0x7dff7a), COLOR_HOLD = new THREE.Color(0xff8a4a);

  let gesture = null;
  hand.extraHover = 0;
  hand.gesture = (kind) => { gesture = { kind, t: 0, d: kind === 'pet' ? 0.7 : 0.32 }; };

  hand.teleport = (x, z) => {
    hand.pos.set(x, terrain.surfaceAt(x, z), z);
    prev.copy(hand.pos);
    hand.vel.set(0, 0, 0);
  };

  function release(gentle) {
    const o = hand.held;
    if (!o) return;
    const speed = Math.hypot(hand.vel.x, hand.vel.z);
    if (gentle || speed < 7) {
      entities.launch(o, hand.vel.x * 0.3, 0, hand.vel.z * 0.3, 0.2);
    } else {
      const power = 0.85 / Math.pow(o.def.mass, 0.2);
      entities.launch(o, hand.vel.x * power, 4 + speed * 0.26 * power, hand.vel.z * power);
      o.thrown = true;
      o.throwFrom = { x: o.pos.x, z: o.pos.z };
      hand.stats.throws++;
      input.rumble(0.2, 0.7, 90);
      fx.onThrow(o, speed);
    }
    hand.held = null;
    hand.mode = 'open';
    latched = false;
  }
  hand.drop = () => release(true);

  hand.update = (dt, pad, rig, enabled, canGrab = true) => {
    // --- movement -----------------------------------------------------------------
    hand.precision = enabled && pad.down.l2;
    if (enabled) {
      const speed = MOVE_SPEED * (hand.precision ? PRECISION_FACTOR : 1);
      hand.pos.x += (rig.right.x * pad.lx - rig.forward.x * pad.ly) * speed * dt;
      hand.pos.z += (rig.right.y * pad.lx - rig.forward.y * pad.ly) * speed * dt;
      const r = Math.hypot(hand.pos.x, hand.pos.z);
      if (r > ROAM_RADIUS) { hand.pos.x *= ROAM_RADIUS / r; hand.pos.z *= ROAM_RADIUS / r; }
    }
    hand.pos.y = terrain.surfaceAt(hand.pos.x, hand.pos.z);
    if (dt > 0) {
      const k = 1 - Math.exp(-14 * dt);
      hand.vel.x = lerp(hand.vel.x, (hand.pos.x - prev.x) / dt, k);
      hand.vel.z = lerp(hand.vel.z, (hand.pos.z - prev.z) / dt, k);
    }
    prev.copy(hand.pos);

    // --- what is under the cursor? ---------------------------------------------------
    hand.hover = hand.mode === 'open' ? entities.nearest(hand.pos.x, hand.pos.z, hand.precision ? 2.2 : 3.4) : null;

    // --- R2 grab state machine --------------------------------------------------------
    if (enabled && (canGrab || hand.mode !== 'open')) {
      if (hand.mode === 'open' && pad.pressed.r2 && hand.hover) {
        candidate = hand.hover;
        hand.mode = 'reach';
        reachTimer = REACH_TIME;
        pressAge = 0;
      } else if (hand.mode === 'reach') {
        pressAge += dt;
        reachTimer -= dt;
        if (reachTimer <= 0) {
          if (candidate.state !== 'gone' && candidate.state !== 'sink') {
            hand.held = candidate;
            candidate.state = 'held';
            candidate.vel.set(0, 0, 0);
            hand.mode = 'hold';
            latched = !pad.down.r2; // already let go => it was a tap
            hand.stats.grabs++;
            input.rumble(0.45, 0.25, 70);
            fx.onGrab(candidate);
          } else hand.mode = 'open';
          candidate = null;
        }
      } else if (hand.mode === 'hold') {
        pressAge += dt;
        if (!latched && pad.released.r2) {
          if (pressAge < TAP_TIME) latched = true; else release(false);
        } else if (latched && pad.pressed.r2) {
          release(false);
        }
      }
    }

    // --- pose the glove ---------------------------------------------------------------
    const hoverTarget = (hand.mode === 'reach' ? 3.2 : HOVER) + hand.extraHover;
    hoverY = lerp(hoverY, hoverTarget, 1 - Math.exp(-(hand.mode === 'reach' ? 30 : 12) * dt));
    const t = performance.now() / 1000;
    // Pet = two soft strokes; slap = one fast swipe.
    let dip = 0, swipe = 0;
    if (gesture) {
      gesture.t += dt;
      const k = gesture.t / gesture.d;
      if (k >= 1) gesture = null;
      else if (gesture.kind === 'pet') dip = Math.abs(Math.sin(k * Math.PI * 2)) * 2.4;
      else { dip = Math.sin(k * Math.PI) * 3.2; swipe = Math.sin(k * Math.PI * 2) * 1.1; }
    }
    glove.root.position.set(hand.pos.x, hand.pos.y + hoverY - dip + Math.sin(t * 2.1) * 0.18, hand.pos.z);
    const vf = hand.vel.x * rig.forward.x + hand.vel.z * rig.forward.y;
    const vr = hand.vel.x * rig.right.x + hand.vel.z * rig.right.y;
    glove.root.rotation.set(
      lerp(glove.root.rotation.x, clamp(-vf * 0.007, -0.4, 0.4) - 0.12, 0.2),
      rig.yaw,
      lerp(glove.root.rotation.z, clamp(-vr * 0.007, -0.4, 0.4), 0.2) + swipe
    );

    const fist = hand.mode === 'hold' ? 0.85 : hand.mode === 'reach' ? 0.45 : pad.down.r2 && enabled ? 1 : 0.12;
    for (const f of glove.fingers) {
      let target = fist;
      if (hand.precision && hand.mode === 'open') target = f === glove.index ? 0 : f === glove.thumb ? 0.5 : 0.95; // pointing
      f.curl = lerp(f.curl, target, 1 - Math.exp(-18 * dt));
      const isThumb = f === glove.thumb;
      f.knuckle.rotation.x = -f.curl * (isThumb ? 0.5 : 1.15);
      f.joint.rotation.x = -f.curl * (isThumb ? 0.9 : 1.35);
    }

    // --- carry the held object --------------------------------------------------------
    if (hand.held) {
      const o = hand.held;
      const dangle = o.type === 'citizen' ? 3.7 : 2.1 + o.def.ground;
      o.pos.set(glove.root.position.x, glove.root.position.y - dangle, glove.root.position.z);
      if (o.type === 'citizen') {
        // Legs kicking, facing the camera in mute appeal.
        o.quat.setFromEuler(new THREE.Euler(Math.sin(t * 13 + o.id) * 0.3, rig.yaw, Math.sin(t * 9) * 0.35, 'YXZ'));
      } else {
        o.quat.slerp(glove.root.quaternion, 0.25);
      }
    }

    // --- ground feedback --------------------------------------------------------------
    const pulse = 1 + Math.sin(t * 5) * 0.04;
    cursor.drape(terrain, hand.pos.x, hand.pos.z, (hand.precision ? 0.55 : 1) * pulse);
    cursor.material.color.copy(hand.held ? COLOR_HOLD : hand.hover ? COLOR_TARGET : COLOR_IDLE);
    shadow.drape(terrain, hand.pos.x, hand.pos.z, 1.25 - hoverY * 0.04, 0.15);

    const focus = hand.hover || null;
    marker.visible = !!focus;
    if (focus) {
      marker.position.set(focus.pos.x, focus.pos.y + (focus.type === 'citizen' ? 3.1 : 2.6) + Math.sin(t * 4) * 0.25, focus.pos.z);
      marker.rotation.y = t * 3;
    }
  };

  return hand;
}

/** Expanding rings for impacts, splashes and blessings. Pooled: 6 draw calls worst case. */
export function createPulses(scene, terrain) {
  const pool = [];
  for (let i = 0; i < 6; i++) {
    const decal = createGroundDecal(scene, 0.75, 1, 28, 0xffffff, 0);
    decal.mesh.visible = false;
    pool.push({ decal, life: 0, duration: 1, x: 0, z: 0, size: 1 });
  }
  let cursor = 0;
  return {
    emit(x, z, size, color, duration = 0.6) {
      const p = pool[cursor++ % pool.length];
      p.x = x; p.z = z; p.size = size; p.life = duration; p.duration = duration;
      p.decal.material.color.set(color);
      p.decal.mesh.visible = true;
    },
    update(dt) {
      for (const p of pool) {
        if (p.life <= 0) continue;
        p.life -= dt;
        const k = 1 - Math.max(0, p.life) / p.duration;
        p.decal.drape(terrain, p.x, p.z, 0.3 + k * p.size, 0.3);
        p.decal.material.opacity = (1 - k) * 0.9;
        if (p.life <= 0) p.decal.mesh.visible = false;
      }
    },
  };
}
