// El Mascota Supremo: the giant Creature, its utility AI and its education.
//
// Every few seconds the Creature works out its dominant DRIVE (hungry, tired, unrest,
// industrious, playful) and samples an ACTION from that row of a weight matrix
// W[drive][action]. Petting multiplies the weight of whatever it is doing (or just
// did) up; slapping multiplies it down and stops the action cold. Feedback is
// strongest during the act and fades over the 12 seconds after it, and 30% of every
// lesson generalises to the same action under the other drives.
import * as THREE from './three.js';
import { paint, place, merge, vertexLit } from './geo.js';
import { SITES } from './terrain.js';
import { clamp } from './noise.js';

const box = (w, h, d, color, x = 0, y = 0, z = 0, shade = 0.8) =>
  place(paint(new THREE.BoxGeometry(w, h, d), color, shade), x, y, z);
const blob = (r, color, x, y, z, sx, sy, sz, detail = 1) =>
  place(paint(new THREE.IcosahedronGeometry(r, detail), color, 0.65), x, y, z, 0, 0, 0, new THREE.Vector3(sx, sy, sz));
const limb = (r, h, color) => place(paint(new THREE.CylinderGeometry(r, r * 0.8, h, 6), color, 0.7), 0, -h / 2, 0);
const cone = (r, h, color, x, y, z, rx = 0, rz = 0) => place(paint(new THREE.ConeGeometry(r, h, 5), color, 0.85), x, y, z, rx, 0, rz);
const mesh = (geos, x, y, z) => { const m = new THREE.Mesh(merge(geos), vertexLit); m.position.set(x, y, z); return m; };

// --- the three candidates ---------------------------------------------------------------
function buildCapybara() {
  const FUR = 0x9a6b3f, DARK = 0x5e3d22, root = new THREE.Group();
  root.add(mesh([
    blob(1, FUR, 0, 0, 0, 3.0, 2.5, 4.6), blob(1, 0xb98a58, 0, -0.9, 0.4, 2.5, 1.7, 3.8),
    box(1.2, 1.2, 0.3, 0xe8b530, 0, 0.6, 4.3), box(3.4, 0.5, 0.5, 0xd0252b, 0, 1.7, 2.6), // medal + sash
  ], 0, 4.4, 0));
  const head = mesh([
    box(2.9, 2.5, 3.2, 0xa87848, 0, 0, 1.2), box(2.3, 1.3, 0.9, DARK, 0, -0.5, 3.0),
    box(0.6, 0.7, 0.4, DARK, -1.1, 1.5, 0.2), box(0.6, 0.7, 0.4, DARK, 1.1, 1.5, 0.2),
    box(0.35, 0.35, 0.2, 0x111111, -1.48, 0.5, 1.8), box(0.35, 0.35, 0.2, 0x111111, 1.48, 0.5, 1.8),
  ], 0, 5.6, 3.6);
  root.add(head);
  const legs = [[-1.7, 2.6], [1.7, 2.6], [-1.7, -2.6], [1.7, -2.6]].map(([x, z]) => {
    const l = new THREE.Mesh(limb(0.75, 2.6, DARK), vertexLit); l.position.set(x, 2.6, z); root.add(l); return l;
  });
  return { root, head, legs, wings: [], height: 8, radius: 4.5, headY: 5.6 };
}

function buildJaguar() {
  const GOLD = 0xe0a030, SPOT = 0x4a2f12, root = new THREE.Group();
  const spots = [];
  for (let i = 0; i < 14; i++) {
    const a = i * 2.4, y = Math.sin(i * 1.7) * 1.0, z = -3.6 + (i / 13) * 7;
    spots.push(box(0.7, 0.7, 0.7, SPOT, Math.cos(a) * 1.9, 0.6 + y * 0.8, z));
  }
  root.add(mesh([
    blob(1, GOLD, 0, 0, 0, 2.2, 2.0, 5.0), blob(1, 0xf3d9a0, 0, -0.9, 0.5, 1.7, 1.2, 4.0), ...spots,
    place(paint(new THREE.CylinderGeometry(0.35, 0.2, 5, 5), GOLD, 0.8), 0, 1.4, -6, 0.9, 0, 0), // tail
  ], 0, 4.6, 0));
  const head = mesh([
    place(paint(new THREE.CylinderGeometry(2.9, 2.9, 0.3, 12), 0xffc928, 0.9), 0, 0, -0.6, Math.PI / 2, 0, 0), // solar disc
    box(2.4, 2.2, 2.6, GOLD, 0, 0, 0.8), box(1.5, 1.0, 1.0, 0xf6ead0, 0, -0.55, 2.3), box(0.5, 0.35, 0.2, 0x222222, 0, -0.2, 2.85),
    cone(0.5, 0.9, GOLD, -0.9, 1.5, 0.3), cone(0.5, 0.9, GOLD, 0.9, 1.5, 0.3),
    box(0.4, 0.3, 0.2, 0x2ecc40, -0.7, 0.4, 2.12), box(0.4, 0.3, 0.2, 0x2ecc40, 0.7, 0.4, 2.12),
  ], 0, 5.6, 4.6);
  root.add(head);
  const legs = [[-1.3, 3.2], [1.3, 3.2], [-1.3, -3.2], [1.3, -3.2]].map(([x, z]) => {
    const l = new THREE.Mesh(limb(0.55, 3.2, GOLD), vertexLit); l.position.set(x, 3.2, z); root.add(l); return l;
  });
  return { root, head, legs, wings: [], height: 8.5, radius: 4.5, headY: 5.6 };
}

function buildMacaw() {
  const RED = 0xd0252b, BLUE = 0x1f6fd0, YEL = 0xf2c61f, GOLD = 0xe8b530, root = new THREE.Group();
  root.add(mesh([
    blob(1, RED, 0, 0, 0, 2.4, 3.4, 2.6), blob(1, YEL, 0, -0.6, 0.9, 1.8, 2.4, 1.9),
    box(1.5, 0.5, 2.2, GOLD, -2.2, 2.4, 0), box(1.5, 0.5, 2.2, GOLD, 2.2, 2.4, 0),                 // epaulets
    box(0.5, 0.5, 0.2, GOLD, -0.6, 1.0, 2.5), box(0.5, 0.5, 0.2, GOLD, 0.2, 1.2, 2.5),            // medals
    place(paint(new THREE.BoxGeometry(1.6, 0.4, 5), BLUE, 0.8), 0, -3.2, -2.6, -0.9, 0, 0),         // tail
  ], 0, 5.6, 0));
  const head = mesh([
    blob(1, RED, 0, 0, 0, 1.5, 1.5, 1.6), box(1.7, 1.0, 0.5, 0xf6f1e6, 0, 0, 1.3),
    cone(0.8, 1.8, 0x2b2b2b, 0, -0.3, 2.3, 2.1), cone(0.6, 1.1, YEL, 0, 0.3, 2.0, 1.9),
    box(0.3, 0.3, 0.2, 0x111111, -0.75, 0.3, 1.5), box(0.3, 0.3, 0.2, 0x111111, 0.75, 0.3, 1.5),
    place(paint(new THREE.CylinderGeometry(1.5, 1.5, 0.8, 8), 0x4a5a2f, 0.9), 0, 1.5, 0),          // peaked cap
    box(2.2, 0.2, 1.4, 0x222222, 0, 1.15, 1.5), box(0.6, 0.5, 0.2, GOLD, 0, 1.6, 1.5),
  ], 0, 9.9, 0.4);
  root.add(head);
  const wings = [-1, 1].map((side) => {
    const w = new THREE.Mesh(merge([box(0.5, 4.4, 2.8, BLUE, 0, -2.2, 0), box(0.55, 1.6, 2.6, YEL, 0, -1.0, 0.05)]), vertexLit);
    w.position.set(side * 2.6, 7.6, 0); root.add(w); return w;
  });
  const legs = [-1, 1].map((side) => {
    const l = new THREE.Mesh(limb(0.35, 2.6, 0x555555), vertexLit); l.position.set(side * 0.9, 2.6, 0); root.add(l); return l;
  });
  return { root, head, legs, wings, height: 12, radius: 4, headY: 9.9 };
}

export const SPECIES = [
  {
    key: 'capybara', icon: '🦫', name: 'Don Carpincho', title: 'El Capibara Gigante', build: buildCapybara, speed: 8,
    blurb: 'Stoic and gentle. Waters crops twice as well and dances twice as soothingly.',
    affinity: { water: 1.7, build: 1.1, dance: 1.5, eatFood: 1.3, sleep: 1.3, eatCitizen: 0.2, smash: 0.3, scare: 0.5 },
    bonus: { water: 2, dance: 2 },
  },
  {
    key: 'jaguar', icon: '🐆', name: 'Coronel Balam', title: 'El Jaguar Solar', build: buildJaguar, speed: 14,
    blurb: 'Fierce and fast. Scatters protesters across twice the distance. Keep it fed.',
    affinity: { scare: 1.9, eatCitizen: 1.6, haul: 1.3, smash: 1.2, play: 1.2, dance: 0.5, water: 0.6 },
    bonus: { scare: 2, haul: 1.5 },
  },
  {
    key: 'macaw', icon: '🦜', name: 'Mariscal Guaco', title: 'El Guacamayo Real', build: buildMacaw, speed: 10,
    blurb: 'A feathered field marshal. Its sermons raise twice the Mana and Faith.',
    affinity: { preach: 1.9, dance: 1.5, play: 1.3, haul: 0.8, smash: 0.8, eatCitizen: 0.5 },
    bonus: { preach: 2 },
  },
];

export const DRIVES = {
  hungry: { icon: '🍽️', label: 'Hungry' },
  tired: { icon: '💤', label: 'Tired' },
  unrest: { icon: '✊', label: 'Unrest' },
  industrious: { icon: '👷', label: 'Diligent' },
  playful: { icon: '⚽', label: 'Playful' },
};

// Starting tendencies before species affinity: rows = drives, columns = actions.
const PRIOR = {
  hungry: { eatFood: 1.0, eatCitizen: 0.5, sleep: 0.1 },
  tired: { sleep: 1.6 },
  unrest: { scare: 1.0, dance: 0.6, preach: 0.5, eatCitizen: 0.25 },
  industrious: { water: 1, build: 1, haul: 1, preach: 0.3 },
  playful: { play: 1, dance: 0.8, preach: 0.5, smash: 0.35, water: 0.3, sleep: 0.2 },
};
const FLOOR = 0.08, W_MIN = 0.02, W_MAX = 4, CREDIT_WINDOW = 12;

export function createCreature(scene, terrain, ctx) {
  const { entities, buildings, society, fx } = ctx;
  const N = SITES.nest;
  const citizens = entities.lists.citizen;
  const rnd = Math.random;

  // --- what it can do ------------------------------------------------------------------------
  // find(): returns a target { x, z, time, ref? } or null if the action is impossible right now.
  // done(): applies the effect; may return another target to chain (haul's second leg).
  const near = (pred) => buildings.nearest(C.pos.x, C.pos.z, pred);
  const at = (b, time, extra) => ({ x: b.door.x, z: b.door.z, time, b, ...extra });
  const crowd = (x, z, r, fn) => { let n = 0; for (const o of citizens) if (Math.hypot(o.pos.x - x, o.pos.z - z) < r) { fn(o); n++; } return n; };
  const bonus = (k) => (C.species.bonus[k] || 1);

  const ACTIONS = {
    water: {
      icon: '💧', label: 'Water crops', moral: 1,
      find: () => { const b = near((b) => b.built && b.def.produces && !b.def.indoor && b.boost <= 2); return b && at(b, 5); },
      done: (t) => { t.b.boost = 35 * bonus('water'); fx.pulse(t.b.x, t.b.z, 9, 0x6fc8ff); fx.say('xochitl', `${C.species.name} waters the fields! The harvest swells.`, 'c-water'); },
    },
    build: {
      icon: '🏗️', label: 'Help build', moral: 1,
      find: () => { const b = near((b) => !b.built); return b && at(b, 6); },
      done: (t) => { if (!t.b.built) t.b.progress = Math.min(1, t.b.progress + 0.5); fx.pulse(t.b.x, t.b.z, 8, 0xffd34d); },
    },
    haul: {
      icon: '📦', label: 'Haul goods', moral: 1,
      find: () => {
        const b = near((b) => b.built && b.def.produces && b.def.produces !== 'food' && b.out >= 3 && buildings.destinationFor(b.def.produces, b));
        return b && at(b, 2);
      },
      done: (t) => {
        const good = t.b.def.produces, dest = buildings.destinationFor(good, t.b);
        if (!dest || !t.b.alive) return null;
        const n = Math.min(Math.round(10 * bonus('haul')), t.b.out);
        t.b.out -= n; C.carrying = n;
        return { x: dest.door.x, z: dest.door.z, time: 2, b: dest, finish: () => { if (dest.alive) buildings.deliver(dest, good, n); C.carrying = 0; fx.pulse(dest.x, dest.z, 7, 0x7dff7a); } };
      },
    },
    dance: {
      icon: '🎵', label: 'Dance', moral: 1,
      find: () => ({ x: SITES.palace.x + (rnd() - 0.5) * 14, z: SITES.palace.z + SITES.palace.r * 1.1 + rnd() * 6, time: 8 }),
      done: (t) => {
        const n = crowd(t.x, t.z, 30, (o) => { o.needs.faith = Math.min(1, o.needs.faith + 0.12 * bonus('dance')); o.trauma = Math.max(0, o.trauma - 0.08 * bonus('dance')); });
        fx.pulse(t.x, t.z, 14, 0xff9be0);
        if (n) fx.say('penultimo', `${C.species.name} danced for ${n} citizens. Cheaper than bread, almost as effective.`, 'c-dance');
      },
    },
    preach: {
      icon: '📣', label: 'Preach', moral: 0,
      find: () => { const b = near((b) => b.built && b.def.faith); return b ? at(b, 7) : { x: SITES.palace.x, z: SITES.palace.z + SITES.palace.r * 0.95, time: 7 }; },
      done: (t) => {
        society.mana = Math.min(society.manaCap(), society.mana + 12 * bonus('preach'));
        crowd(t.x, t.z, 32, (o) => { o.needs.faith = Math.min(1, o.needs.faith + 0.08 * bonus('preach')); });
        fx.pulse(t.x, t.z, 16, 0x58e0c0);
        fx.say('xochitl', `${C.species.name} proclaims your glory from the plaza. Mana flows.`, 'c-preach');
      },
    },
    eatFood: {
      icon: '🍌', label: 'Eat plantains', moral: 0,
      find: () => { const b = near((b) => b.built && b.def.produces === 'food' && b.out >= 4); return b && at(b, 3); },
      done: (t) => { const n = Math.min(6, t.b.out); t.b.out -= n; C.hunger = Math.max(0, C.hunger - n * 0.13); },
    },
    eatCitizen: {
      icon: '😈', label: 'Eat a citizen', moral: -1,
      find: () => {
        if (C.hunger < 0.3 || citizens.length < 9) return null;
        let o = null, bd = 90;
        for (const c of citizens) {
          const d = Math.hypot(c.pos.x - C.pos.x, c.pos.z - C.pos.z);
          if (!c.hidden && (c.state === 'walk' || c.state === 'idle' || c.state === 'act') && d < bd) { bd = d; o = c; }
        }
        return o && { x: o.pos.x, z: o.pos.z, time: 1.6, ref: o };
      },
      done: (t) => {
        const o = t.ref;
        if (!o || o.state === 'gone' || o.hidden || Math.hypot(o.pos.x - C.pos.x, o.pos.z - C.pos.z) > 9) return;
        crowd(o.pos.x, o.pos.z, 30, (w) => society.traumatise(w, 0.3));
        fx.toast(`😈 ${C.species.name} ate ${o.name}`);
        society.removeCitizen(o);
        C.eaten++;
        C.hunger = Math.max(0, C.hunger - 0.8);
        fx.shake(0.3);
        fx.say('xochitl', `It ATE one of your people! Slap it, Great One — Circle, while the crime is fresh!`, 'c-eat');
      },
    },
    smash: {
      icon: '💥', label: 'Smash a building', moral: -1,
      find: () => { const b = near((b) => b.built && !b.def.coastal && Math.hypot(b.x - C.pos.x, b.z - C.pos.z) < 120); return b && at(b, 3); },
      done: (t) => {
        if (!t.b.alive || !t.b.built) return;
        t.b.built = false; t.b.progress = 0.3;
        fx.pulse(t.b.x, t.b.z, 12, 0xff6b5b); fx.shake(0.7); fx.rumble(1, 0.5, 300);
        fx.toast(`💥 ${C.species.name} smashed the ${t.b.def.label}`);
        fx.say('penultimo', `Your pet has flattened the ${t.b.def.label.toLowerCase()}. Discipline it, or bill it.`, 'c-smash');
      },
    },
    scare: {
      icon: '😱', label: 'Scare protesters', moral: -1,
      find: () => { const o = citizens.find((o) => o.task && o.task.kind === 'protest' && o.state === 'act'); return o && { x: o.pos.x, z: o.pos.z, time: 2.5 }; },
      done: (t) => {
        let n = 0;
        crowd(t.x, t.z, 16 * bonus('scare'), (o) => { if (o.task && o.task.kind === 'protest') { society.disperse(o); n++; } });
        fx.pulse(t.x, t.z, 14, 0xff6b5b); fx.shake(0.4);
        if (n) { fx.toast(`😱 ${n} protesters scattered`); fx.say('penultimo', 'The mascot has explained the situation to the protesters. Loudly.', 'c-scare'); }
      },
    },
    sleep: {
      icon: '💤', label: 'Sleep', moral: 0,
      find: () => ({ x: N.x + 9, z: N.z + 3, time: 60 }),
      tick: (t, dt) => { C.energy = Math.min(1, C.energy + dt / 22); return C.energy >= 1; },
      done: () => {},
    },
    play: {
      icon: '⚽', label: 'Play', moral: 0,
      find: () => {
        let toy = null, bd = 90;
        for (const type of ['crate', 'barrel', 'boulder']) for (const o of entities.lists[type]) {
          const d = Math.hypot(o.pos.x - C.pos.x, o.pos.z - C.pos.z);
          if (o.state === 'rest' && d < bd) { bd = d; toy = o; }
        }
        if (toy) return { x: toy.pos.x, z: toy.pos.z, time: 1.2, ref: toy };
        for (let k = 0; k < 10; k++) { // nothing to kick: go for a romp
          const a = rnd() * Math.PI * 2, x = C.pos.x + Math.cos(a) * 30, z = C.pos.z + Math.sin(a) * 30;
          if (terrain.heightAt(x, z) > 1) return { x, z, time: 3 };
        }
        return { x: N.x, z: N.z + 10, time: 3 };
      },
      done: (t) => {
        if (t.ref && t.ref.state === 'rest') { const a = rnd() * Math.PI * 2; entities.launch(t.ref, Math.cos(a) * 15, 16, Math.sin(a) * 15); }
        C.boredom = 0;
      },
    },
  };
  const ACTION_KEYS = Object.keys(ACTIONS), DRIVE_KEYS = Object.keys(DRIVES);

  // --- state ---------------------------------------------------------------------------------
  const C = {
    alive: false, species: null, rig: null,
    pos: new THREE.Vector3(N.x, N.level, N.z), yaw: 0,
    hunger: 0.35, energy: 0.9, affection: 0.6, boredom: 0,
    state: 'idle', timer: 2,      // idle | go | do | react
    current: null,                // { action, drive, target, commanded }
    credit: null,                 // { action, drive, until }  — what a pet or slap is about
    leashed: false, carrying: 0, paused: false,
    W: {}, P: {},
    deeds: {}, good: 0, evil: 0, pets: 0, slaps: 0, eaten: 0,
    height: 8, radius: 4.5,
  };
  let moving = false, walkPhase = 0, reactKind = null, time = 0;

  C.hatch = (species) => {
    C.species = species;
    C.rig = species.build();
    C.height = C.rig.height; C.radius = C.rig.radius;
    scene.add(C.rig.root);
    for (const d of DRIVE_KEYS) {
      C.W[d] = {}; C.P[d] = {};
      for (const a of ACTION_KEYS) C.P[d][a] = C.W[d][a] = clamp((PRIOR[d][a] || FLOOR) * (species.affinity[a] || 1), W_MIN, W_MAX);
    }
    for (const a of ACTION_KEYS) C.deeds[a] = 0;
    C.pos.set(N.x, N.level + 1, N.z);
    C.alive = true; C.state = 'react'; reactKind = 'pet'; C.timer = 1.5;
  };

  // --- the mind ------------------------------------------------------------------------------
  C.drive = () => {
    const work = buildings.list.some((b) => !b.built || (b.def.produces && !b.def.indoor && b.boost <= 2) || (b.def.produces && b.def.produces !== 'food' && b.out >= 3));
    const score = {
      hungry: C.hunger > 0.55 ? C.hunger : 0,
      tired: C.energy < 0.3 ? 1 - C.energy : 0,
      unrest: Math.min(1, society.protesters / 3) * 0.95,
      industrious: work ? 0.5 - C.boredom * 0.3 : 0,
      playful: 0.3 + C.boredom * 0.3,
    };
    return DRIVE_KEYS.reduce((best, d) => (score[d] > score[best] ? d : best), 'playful');
  };

  function begin(action, drive, target, commanded = false) {
    C.current = { action, drive, target, commanded };
    C.credit = { action, drive, until: Infinity };
    C.state = 'go';
  }

  function decide() {
    const drive = C.drive(), options = [];
    let total = 0;
    for (const a of ACTION_KEYS) {
      const target = ACTIONS[a].find();
      if (!target) continue;
      const w = Math.pow(C.W[drive][a], 1.5);
      options.push({ a, target, w }); total += w;
    }
    let r = rnd() * total;
    for (const o of options) { r -= o.w; if (r <= 0) return begin(o.a, drive, o.target); }
    if (options.length) begin(options[0].a, drive, options[0].target);
  }

  function finish() {
    const cur = C.current, def = ACTIONS[cur.action];
    const next = cur.target.finish ? (cur.target.finish(), null) : def.done(cur.target);
    if (next) { cur.target = next; C.state = 'go'; return; }
    C.deeds[cur.action]++;
    if (def.moral > 0) C.good++; else if (def.moral < 0) C.evil++;
    if (cur.action !== 'play' && cur.action !== 'sleep') C.boredom = Math.min(1, C.boredom + 0.22);
    C.credit = { action: cur.action, drive: cur.drive, until: time + CREDIT_WINDOW };
    C.current = null; C.state = 'idle'; C.timer = 1.5 + rnd() * 2;
  }

  function abort() {
    if (C.current) C.credit = { action: C.current.action, drive: C.current.drive, until: time + CREDIT_WINDOW };
    C.current = null; C.carrying = 0;
  }

  /** Pet (+1) or slap (-1). Returns what, if anything, was learned. */
  function feedback(sign) {
    C.affection = clamp(C.affection + (sign > 0 ? 0.07 : -0.09), 0, 1);
    if (sign > 0) C.pets++; else C.slaps++;
    const cr = C.credit;
    let lesson = null;
    if (cr && time <= cr.until) {
      const strength = cr.until === Infinity ? 1 : (cr.until - time) / CREDIT_WINDOW;
      const factor = sign > 0 ? 1 + 0.45 * strength : 1 - 0.5 * strength;
      for (const d of DRIVE_KEYS) {
        const f = d === cr.drive ? factor : 1 + (factor - 1) * 0.3; // lessons generalise a little
        C.W[d][cr.action] = clamp(C.W[d][cr.action] * f, W_MIN, W_MAX);
      }
      lesson = { action: cr.action, drive: cr.drive, weight: C.W[cr.drive][cr.action], prior: C.P[cr.drive][cr.action] };
    }
    if (sign < 0) abort(); // a slap always stops it in its tracks
    C.state = 'react'; reactKind = sign > 0 ? 'pet' : 'slap'; C.timer = sign > 0 ? 0.8 : 1.4;
    return lesson;
  }
  C.pet = () => feedback(1);
  C.slap = () => feedback(-1);

  C.toggleLeash = () => {
    C.leashed = !C.leashed;
    if (C.leashed) abort();
    C.state = 'idle'; C.timer = 0.5;
    return C.leashed;
  };

  /** A wheel command. Obedience depends on affection. Returns 'ok' | 'refused' | 'impossible'. */
  C.command = (action) => {
    if (!C.alive) return 'impossible';
    const target = ACTIONS[action].find();
    if (!target) return 'impossible';
    if (rnd() > 0.35 + 0.65 * C.affection) { C.state = 'react'; reactKind = 'slap'; C.timer = 0.8; return 'refused'; }
    abort(); C.leashed = false;
    begin(action, C.drive(), target, true);
    return 'ok';
  };

  // --- the body ------------------------------------------------------------------------------
  const STEER = [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9];
  function walkTo(x, z, dt, stop) {
    const dx = x - C.pos.x, dz = z - C.pos.z, d = Math.hypot(dx, dz);
    if (d <= stop) return true;
    let ux = dx / d, uz = dz / d, clear = d < 6;
    if (!clear) for (const a of STEER) {
      const c = Math.cos(a), s = Math.sin(a), hx = ux * c - uz * s, hz = ux * s + uz * c;
      if (terrain.heightAt(C.pos.x + hx * 5, C.pos.z + hz * 5) > 0.3) { ux = hx; uz = hz; clear = true; break; }
    }
    if (clear) {
      const step = Math.min(d, C.species.speed * (C.energy < 0.15 ? 0.6 : 1) * dt);
      C.pos.x += ux * step; C.pos.z += uz * step;
      let turn = Math.atan2(ux, uz) - C.yaw;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      C.yaw += turn * Math.min(1, dt * 7);
      moving = true;
    }
    return false;
  }

  C.update = (dt, simTime, handPos) => {
    if (!C.alive) return;
    time = simTime;
    moving = false;
    if (dt > 0 && !C.paused) {
      C.hunger = Math.min(1, C.hunger + dt / 280);
      C.energy = Math.max(0, C.energy - dt / (C.state === 'go' || C.state === 'do' ? 240 : 420));
      if (C.hunger >= 1) C.affection = Math.max(0, C.affection - dt / 300);

      if (C.state === 'react') {
        C.timer -= dt;
        if (C.timer <= 0) { C.state = C.current ? 'go' : 'idle'; C.timer = 0.6; }
      } else if (C.leashed) {
        walkTo(handPos.x, handPos.z, dt, C.radius + 4);
      } else if (C.state === 'idle') {
        C.timer -= dt;
        if (C.timer <= 0) decide();
      } else if (C.state === 'go') {
        const t = C.current.target;
        if (t.ref && t.ref.state !== 'gone') { t.x = t.ref.pos.x; t.z = t.ref.pos.z; } // chase moving prey / toys
        if (walkTo(t.x, t.z, dt, C.radius + 1.5)) { C.state = 'do'; C.timer = t.time; }
      } else if (C.state === 'do') {
        C.timer -= dt;
        const def = ACTIONS[C.current.action];
        const over = def.tick ? def.tick(C.current.target, dt) : false;
        if (over || C.timer <= 0) finish();
      }
    }

    // Pose.
    const rig = C.rig, act = C.state === 'do' ? C.current.action : null;
    const ground = terrain.surfaceAt(C.pos.x, C.pos.z);
    C.pos.y = ground;
    if (moving) walkPhase += dt * C.species.speed * 0.75;
    let lift = moving ? Math.abs(Math.sin(walkPhase)) * 0.5 : 0, tiltX = 0, squash = 1, yaw = C.yaw, nod = 0, flap = 0.12;
    if (act === 'dance') { yaw += simTime * 5; lift = Math.abs(Math.sin(simTime * 7)) * 2.2; flap = 0.9; }
    else if (act === 'sleep') { squash = 0.62; tiltX = 0.08; nod = 0.5; }
    else if (act === 'preach') { nod = -0.5 + Math.sin(simTime * 9) * 0.15; flap = 0.5 + Math.sin(simTime * 12) * 0.4; }
    else if (act === 'smash' || act === 'scare') { lift = Math.abs(Math.sin(simTime * 9)) * 1.6; tiltX = -0.25; }
    else if (act) { nod = 0.45 + Math.sin(simTime * 8) * 0.25; }
    if (C.state === 'react') {
      if (reactKind === 'pet') { lift = Math.abs(Math.sin(simTime * 10)) * 1.2; nod = -0.4; flap = 0.7; }
      else { tiltX = 0.3; squash = 0.85; nod = 0.6; }
    }
    if (moving && rig.wings.length) flap = 0.3 + Math.abs(Math.sin(walkPhase)) * 0.5;
    rig.root.position.set(C.pos.x, ground + lift, C.pos.z);
    rig.root.rotation.set(tiltX, yaw, 0);
    rig.root.scale.set(1, squash, 1);
    rig.head.rotation.x = nod;
    rig.legs.forEach((l, i) => { l.rotation.x = moving ? Math.sin(walkPhase + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0)) * 0.6 : 0; });
    rig.wings.forEach((w, i) => { w.rotation.z = (i ? 1 : -1) * flap; });
  };

  C.renderIcons = (icons) => {
    if (!C.alive) return;
    const y = C.pos.y + C.height + 3;
    let icon = '🐾';
    if (C.state === 'react') icon = reactKind === 'pet' ? '❤️' : '💢';
    else if (C.leashed) icon = '🐾';
    else if (C.current) icon = ACTIONS[C.current.action].icon;
    else icon = '❓';
    icons.add(C.pos.x, y, C.pos.z, 4.2, icon);
    if (C.carrying) icons.add(C.pos.x + 3.5, y - 1, C.pos.z, 2.6, '📦');
  };

  C.describe = () => {
    if (C.leashed) return 'On the leash';
    if (C.state === 'react') return reactKind === 'pet' ? 'Delighted' : 'Chastened';
    if (!C.current) return 'Thinking';
    return `${C.state === 'go' ? 'Going to' : 'Busy'}: ${ACTIONS[C.current.action].label.toLowerCase()}`;
  };

  C.ACTIONS = ACTIONS; C.ACTION_KEYS = ACTION_KEYS; C.DRIVE_KEYS = DRIVE_KEYS;
  return C;
}
