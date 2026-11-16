// EL DIOS PRESIDENTE — Phase 1 bootstrap and frame loop.
// Engine, island, water, day/night, DS4 hand (grab/throw), orbit camera, radial wheels.
import * as THREE from './three.js';
import { createTerrain, SITES } from './terrain.js';
import { createSky } from './sky.js';
import { createWater } from './water.js';
import { createScenery } from './scenery.js';
import { createEntities, TYPES } from './entities.js';
import { createInput } from './input.js';
import { createCameraRig } from './camera.js';
import { createHand, createPulses } from './hand.js';
import { createRadial } from './radial.js';
import { createHud } from './hud.js';
import { clamp } from './noise.js';

// ---------------------------------------------------------------------------------
// Renderer. Resolution is dynamic: if the TV chipset can't hold 60 fps we shed pixels,
// not frames.
// ---------------------------------------------------------------------------------
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const BASE_PIXEL_RATIO = Math.min(window.devicePixelRatio || 1, 1.5);
let renderScale = 1;
renderer.setPixelRatio(BASE_PIXEL_RATIO);

const scene = new THREE.Scene();
const terrain = createTerrain(1961);
scene.add(terrain.mesh);
const sky = createSky(scene);
const water = createWater(terrain, sky.env, scene.fog);
scene.add(water.mesh);
const scenery = createScenery(scene, terrain);

const hud = createHud();
const input = createInput();
const rig = createCameraRig(terrain);
const pulses = createPulses(scene, terrain);
const radial = createRadial(document.getElementById('radial'));

const stats = { lostAtSea: 0, dunked: 0, miracles: 0, edicts: 0 };

// ---------------------------------------------------------------------------------
// World events -> juice (rings, rumble, camera shake) and advisor commentary.
// ---------------------------------------------------------------------------------
const entities = createEntities(scene, terrain, (event, o, data) => {
  if (event === 'splash') {
    pulses.emit(o.pos.x, o.pos.z, 3 + o.def.mass * 1.5, 0xffffff, 0.8);
    input.rumble(0.15, 0.5, 120);
    if (o.type === 'citizen') {
      stats.dunked++;
      hud.advise('penultimo', `${o.name} is in the sea. He will swim back a more loyal man, Presidente.`, 'dunk');
    } else if (o.type === 'boulder') {
      hud.advise('xochitl', 'The sea accepts your boulder, Great One. The fish are less enthusiastic.', 'boulder-sea');
    } else {
      stats.lostAtSea++;
      hud.advise('penultimo', 'That was export-grade cargo! I am sending heaven an invoice.', 'cargo-sea');
    }
  } else if (event === 'impact') {
    const big = data.strength > 60;
    pulses.emit(o.pos.x, o.pos.z, big ? 9 : 2.5 + o.def.mass * 0.5, big ? 0xff9a3c : 0xe8d9a8, big ? 0.9 : 0.45);
    if (o.meteor) {
      o.meteor = false;
      entities.shockwave(o.pos.x, o.pos.z, 18, 26);
      rig.addShake(1.2);
      input.rumble(1, 1, 450);
      hud.advise('penultimo', 'Magnificent. Aim the next one at something that owes us money.', 'meteor');
    } else if (data.strength > 18) {
      rig.addShake(clamp(data.strength / 120, 0.1, 0.6));
      input.rumble(clamp(data.strength / 80, 0.2, 1), 0.3, 140);
    }
  } else if (event === 'landed') {
    if (data.distance > hand.stats.longest) hand.stats.longest = data.distance;
    if (o.type === 'citizen' && data.distance > 25) {
      hud.advise('xochitl', `You threw ${o.name} ${Math.round(data.distance)} metres. Benevolence, Great One. We discussed benevolence.`, 'long-throw');
    }
  } else if (event === 'ashore') {
    hud.advise('xochitl', `${o.name} crawls ashore, baptised. Technically, that counts as worship.`, 'ashore');
  }
});
entities.populate();

const hand = createHand(scene, terrain, entities, input, {
  onGrab(o) {
    if (o.type === 'citizen') {
      hud.advise('penultimo', `You have ${o.name} by the collar. Hold R2 and release while moving to… reassign him.`, 'grab-citizen');
    } else {
      hud.advise('xochitl', 'Carry it gently. Tap R2 to keep hold with a free finger; tap again to set it down.', 'grab-cargo');
    }
  },
  onThrow() {},
});
hand.teleport(SITES.palace.x + 6, SITES.palace.z + 16);
rig.snapTo(hand.pos.x, hand.pos.z);

// ---------------------------------------------------------------------------------
// Radial wheels. Phase 1 fills them with physical sandbox powers; later phases add
// buildings, costed edicts and creature commands to the same data structure.
// ---------------------------------------------------------------------------------
const _v = new THREE.Vector3();

function deliver(type) {
  const jitter = () => (Math.random() - 0.5) * 2.5;
  const o = entities.spawn(type, hand.pos.x + jitter(), hand.pos.y + 28, hand.pos.z + jitter());
  if (!o) { hud.toast(`Heaven's warehouse is out of ${TYPES[type].label.toLowerCase()}s`); return null; }
  o.vel.set(0, -6, 0);
  return o;
}

function moveSun(hour, label) {
  sky.setHour(hour);
  stats.miracles++;
  hud.toast(`☀️ ${label}`);
  hud.advise('xochitl', 'You moved the SUN. The farmers’ almanac is now a work of fiction.', 'sun');
}

const WHEEL_L1 = {
  title: 'Requisitions & Edicts',
  hint: 'Deliveries land at the Hand',
  items: [
    { icon: '📦', label: 'Sugar Crate', desc: 'Raw cane sugar, airmailed from heaven.', action: () => deliver('crate') },
    { icon: '🛢️', label: 'Rum Barrel', desc: 'Aged twelve minutes. Floats.', action: () => deliver('barrel') },
    { icon: '🪨', label: 'Boulder', desc: 'Heavy. Persuasive. Sinks.', action: () => deliver('boulder') },
    {
      icon: '🧑‍🌾', label: 'Islander', desc: 'Immigration by divine airdrop.',
      action: () => { if (deliver('citizen')) hud.advise('penultimo', 'A new voter! Falling from the sky makes them humble.', 'airdrop'); },
    },
    {
      icon: '📜', label: 'Edicts', desc: 'Presidential decrees.',
      children: [
        {
          icon: '😴', label: 'Mandatory\nSiesta', desc: 'Everyone lies down. That is an order.',
          action: () => {
            const n = entities.siesta(14);
            stats.edicts++;
            hud.toast(`😴 ${n} islanders ordered to nap`);
            hud.advise('penultimo', 'A sleeping population cannot protest. Efficient.', 'siesta');
          },
        },
        {
          icon: '🎉', label: '¡Fiesta!', desc: 'Compulsory spontaneous joy.',
          action: () => {
            let n = 0;
            for (const c of entities.lists.citizen) {
              if (c.state === 'walk' || c.state === 'idle' || c.state === 'siesta') { entities.launch(c, 0, 7 + Math.random() * 4, 0, 0.5); n++; }
            }
            stats.edicts++;
            hud.toast(`🎉 ${n} islanders jump for joy`);
          },
        },
        {
          icon: '🧹', label: 'Confiscate\nCargo', desc: 'All loose cargo becomes state property.',
          action: () => {
            const n = entities.clearCargo();
            stats.edicts++;
            hud.toast(`🧹 ${n} items confiscated`);
            hud.advise('penultimo', 'Nationalised. It will be stored safely in my garage.', 'confiscate');
          },
        },
      ],
    },
  ],
};

const WHEEL_R1 = {
  title: 'Miracles',
  hint: 'Miracles strike at the Hand',
  items: [
    {
      icon: '☀️', label: 'Move\nthe Sun', desc: 'Time is a suggestion.',
      children: [
        { icon: '🌅', label: 'Dawn', desc: 'Roosters, confused.', action: () => moveSun(6.2, 'Dawn') },
        { icon: '☀️', label: 'High Noon', desc: 'Peak tourist tanning.', action: () => moveSun(12, 'High noon') },
        { icon: '🌇', label: 'Dusk', desc: 'Golden hour, on demand.', action: () => moveSun(17.6, 'Dusk') },
        { icon: '🌙', label: 'Midnight', desc: 'Curfew made easy.', action: () => moveSun(0, 'Midnight') },
      ],
    },
    {
      icon: '🌋', label: 'Tremor', desc: 'The ground hiccups under the Hand.',
      action: () => {
        const n = entities.shockwave(hand.pos.x, hand.pos.z, 17, 24);
        pulses.emit(hand.pos.x, hand.pos.z, 17, 0xff9a3c, 0.9);
        rig.addShake(0.9);
        input.rumble(1, 0.6, 350);
        stats.miracles++;
        hud.toast(`🌋 Tremor! ${n} things airborne`);
        hud.advise('xochitl', 'The earth trembles at your whim. So do the chickens.', 'tremor');
      },
    },
    {
      icon: '🧲', label: 'Rapture', desc: 'Everything nearby flies to the Hand.',
      action: () => {
        let n = 0;
        entities.forEachNear(hand.pos.x, hand.pos.z, 34, (o, d) => {
          if (d < 3) return;
          // Solve a ~1.1 s ballistic arc that ends at the cursor.
          const T = 1.1;
          _v.set((hand.pos.x - o.pos.x) / T, (hand.pos.y + 1 - o.pos.y) / T + 0.5 * 34 * T, (hand.pos.z - o.pos.z) / T);
          entities.launch(o, _v.x, _v.y, _v.z);
          n++;
        });
        pulses.emit(hand.pos.x, hand.pos.z, 12, 0x9fd8ff, 1.0);
        stats.miracles++;
        hud.toast(`🧲 ${n} things answer the call`);
      },
    },
    {
      icon: '☄️', label: 'Meteor', desc: 'A boulder, but from much higher up.',
      action: () => {
        const o = entities.spawn('boulder', hand.pos.x - 40, hand.pos.y + 120, hand.pos.z - 14);
        if (!o) { hud.toast('The heavens are out of rocks'); return; }
        // Flight time so it lands on the cursor: solve y(t) = 0 for a fixed dive speed.
        const vy = -40, T = (vy + Math.sqrt(vy * vy + 2 * 34 * 120)) / 34;
        entities.launch(o, 40 / T, vy, 14 / T, 0.3);
        o.meteor = true;
        o.tint.setRGB(1.6, 0.7, 0.35);
        stats.miracles++;
        hud.toast('☄️ Incoming!');
      },
    },
  ],
};

// ---------------------------------------------------------------------------------
// Context actions
// ---------------------------------------------------------------------------------
function biomeAt(x, z) {
  for (const key of ['palace', 'nest']) {
    const s = SITES[key];
    if (Math.hypot(x - s.x, z - s.z) < s.r) return [key === 'palace' ? '🏛️' : '🥚', s.name];
  }
  const h = terrain.heightAt(x, z);
  if (h < 0) return ['🌊', 'Caribbean Sea'];
  if (h < 2.4) return ['🏖️', 'Playa del Presidente'];
  if (Math.hypot(x - SITES.volcano.x, z - SITES.volcano.z) < 30 && h > 22) return ['🌋', SITES.volcano.name];
  return h < 9 ? ['🌾', 'Lowland pasture'] : ['🌴', 'Jungle highlands'];
}

function inspectCard() {
  const o = hand.hover || hand.held;
  if (!o) {
    const [icon, name] = biomeAt(hand.pos.x, hand.pos.z);
    const h = terrain.heightAt(hand.pos.x, hand.pos.z);
    return { icon, title: name, sub: h < 0 ? `${(-h).toFixed(1)} m deep` : `Elevation ${h.toFixed(1)} m` };
  }
  if (o.type === 'citizen') {
    const mood = { walk: 'Out for a stroll', idle: 'Loitering', siesta: 'Napping by decree', swim: 'Swimming for it', dazed: 'Seeing stars', held: 'Dangling', air: 'Airborne' }[o.state];
    return {
      icon: o.def.icon, title: o.name, sub: `${o.job} · ${mood}`,
      bars: [
        ['Morale', clamp(0.8 - o.dunkings * 0.22, 0.05, 1), '#ffd34d'],
        ['Faith', clamp(0.35 + o.dunkings * 0.25, 0, 1), '#7de3ff'],
      ],
    };
  }
  return {
    icon: o.def.icon, title: o.def.label,
    sub: `${o.def.floats ? 'Floats' : 'Sinks'} · ${o.state === 'float' ? 'Adrift at sea' : 'Grab with R2'}`,
    bars: [['Heft', clamp(o.def.mass / 5, 0.1, 1), '#ff8a4a']],
  };
}

function bless() {
  const o = hand.hover;
  pulses.emit(hand.pos.x, hand.pos.z, 5, 0xffe066, 0.5);
  input.rumble(0, 0.35, 50);
  if (!o) return;
  if (o.type === 'citizen') {
    if (o.state === 'siesta' || o.state === 'dazed') { o.state = 'idle'; o.timer = 0.3; }
    hud.toast(`✨ ${o.name} feels noticed`);
    hud.advise('xochitl', 'A gentle tap of blessing. See? The Hand can do more than throw.', 'bless');
  } else {
    entities.launch(o, 0, 9 / Math.sqrt(o.def.mass), 0, 0.6);
  }
}

// ---------------------------------------------------------------------------------
// Frame loop
// ---------------------------------------------------------------------------------
let speed = 1;            // D-pad: 0 pause, 1x, 2x
let simTime = 0;
let started = false;
let snapToNest = false;
let last = performance.now();
let fps = 60, frameMs = 16.7, perfTimer = 0;
const perf = { calls: 0, triangles: 0 };

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  rig.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

function almanacData() {
  return {
    island: [
      ['Date', `Day ${sky.env.day}, ${sky.clockText()}`],
      ['Islanders', entities.count('citizen')],
      ['Loose cargo', entities.count('crate') + entities.count('barrel') + entities.count('boulder')],
      ['Trees', scenery.counts.palms + scenery.counts.trees],
    ],
    hand: [
      ['Things grabbed', hand.stats.grabs],
      ['Things thrown', hand.stats.throws],
      ['Longest throw', `${Math.round(hand.stats.longest)} m`],
      ['Islanders dunked', stats.dunked],
      ['Cargo lost at sea', stats.lostAtSea],
      ['Miracles · Edicts', `${stats.miracles} · ${stats.edicts}`],
    ],
    engine: [
      ['Frame rate', fps, 60, fps > 55 ? '#7dff7a' : fps > 40 ? '#ffd34d' : '#ff6b5b', `${Math.round(fps)} fps`],
      ['Draw calls', perf.calls, 150, perf.calls <= 150 ? '#7dff7a' : '#ff6b5b', `${perf.calls} / 150`],
      ['Triangles', perf.triangles, 400000, '#7de3ff', `${Math.round(perf.triangles / 1000)}k`],
      ['Render scale', renderScale, 1, '#c9a0ff', `${Math.round(renderScale * 100)}%`],
    ],
  };
}

function updateHints() {
  if (hud.almanacOpen()) return hud.setHints([['options', 'Close'], ['circle', 'Close']]);
  if (radial.isOpen) return hud.setHints([]);
  if (hand.held) return hud.setHints([['ls', 'Wind up'], ['r2', 'Release to throw'], ['circle', 'Set down'], ['square', 'Inspect']]);
  if (hand.hover) return hud.setHints([['r2', 'Grab'], ['cross', 'Bless'], ['square', 'Inspect'], ['l2', 'Precision']]);
  hud.setHints([['ls', 'Hand'], ['rs', 'Camera'], ['l1', 'Requisitions'], ['r1', 'Miracles'], ['triangle', 'Palace / Nest'], ['options', 'Almanac']]);
}

function frame(now) {
  requestAnimationFrame(frame);
  const realDt = Math.min(0.05, (now - last) / 1000);
  frameMs += ((now - last) - frameMs) * 0.05;
  last = now;
  const pad = input.poll();

  // --- title / controller gate -------------------------------------------------------
  if (!started) {
    if (input.anyInput()) {
      const anyPress = Object.values(pad.pressed).some(Boolean);
      hud.showTitle(true, pad.connected
        ? 'DualShock 4 connected — press <span class="btn cross">✕</span> to rule'
        : 'Keyboard detected — press <b>Enter</b> to rule');
      if (anyPress) {
        started = true;
        hud.showTitle(false);
        hud.advise('penultimo', 'Presidente! The Hand works. Try R2 on a citizen — purely for morale.');
        hud.advise('xochitl', 'The island breathes, Great One. Be gentle… or at least be accurate.');
      }
    }
    rig.yaw += realDt * 0.12; // attract-mode orbit
  } else if (!input.anyInput() || (!pad.connected && !pad.usingKeyboard)) {
    hud.showTitle(true, 'Controller lost — press <span class="pill">PS</span> to reconnect your DualShock 4');
  } else if (!document.getElementById('title').hidden) {
    hud.showTitle(false);
  }

  const playing = started;
  if (playing) {
    // --- Almanac (Options / touchpad click) --------------------------------------------
    if (pad.pressed.options || pad.pressed.touchpad) {
      if (hud.almanacOpen()) hud.almanac(null);
      else { radial.close(); hud.almanac(almanacData()); }
    } else if (hud.almanacOpen() && pad.pressed.circle) hud.almanac(null);

    if (!hud.almanacOpen()) {
      // --- D-pad: game speed + alerts ---------------------------------------------------
      if (pad.pressed.left) { speed = 0; hud.setSpeed(0); }
      if (pad.pressed.up) { speed = 1; hud.setSpeed(1); }
      if (pad.pressed.right) { speed = 2; hud.setSpeed(2); }
      if (pad.pressed.down) hud.cycleAlerts();

      // --- radial wheels: hold bumper ---------------------------------------------------
      if (radial.isOpen) {
        if (!pad.down[radial.owner]) radial.close();
        else radial.update(pad);
      } else if (pad.pressed.l1) radial.open(WHEEL_L1, 'l1');
      else if (pad.pressed.r1) radial.open(WHEEL_R1, 'r1');
      else {
        // --- face buttons ---------------------------------------------------------------
        if (pad.pressed.cross) bless();
        if (pad.pressed.square) hud.inspect(inspectCard());
        if (pad.pressed.circle) {
          if (hud.inspectOpen()) hud.inspect(null);
          else if (hand.held) hand.drop();
        }
        if (pad.pressed.triangle) {
          const site = snapToNest ? SITES.nest : SITES.palace;
          snapToNest = !snapToNest;
          if (hand.held) hand.drop();
          hand.teleport(site.x + 4, site.z + site.r * 0.8);
          rig.snapTo(hand.pos.x, hand.pos.z);
          hud.toast(`△ ${site.name}`);
        }
      }
    }
  }

  // --- simulate ------------------------------------------------------------------------
  const menuOpen = radial.isOpen || hud.almanacOpen();
  const timeScale = !playing ? 1 : hud.almanacOpen() ? 0 : radial.isOpen ? 0.12 : speed;
  const dt = realDt * timeScale;
  simTime += dt;

  hand.update(realDt, pad, rig, playing && !menuOpen);
  entities.update(dt, simTime);
  pulses.update(realDt);
  rig.update(realDt, pad, hand.pos, playing && !menuOpen);
  sky.update(dt, rig.focus);
  water.update(simTime, sky.env, rig.focus);
  hud.update(realDt);

  renderer.render(scene, rig.camera);
  perf.calls = renderer.info.render.calls;
  perf.triangles = renderer.info.render.triangles;

  // --- HUD refresh + dynamic resolution (twice a second) ----------------------------------
  updateHints();
  perfTimer += realDt;
  if (perfTimer > 0.5) {
    perfTimer = 0;
    fps = 1000 / frameMs;
    hud.setClock(sky.env.day, sky.clockText(), sky.env.daylight);
    if (hud.almanacOpen()) hud.almanac(almanacData());
    if (frameMs > 20 && renderScale > 0.6) renderScale = Math.max(0.6, renderScale - 0.1);
    else if (frameMs < 17.2 && renderScale < 1) renderScale = Math.min(1, renderScale + 0.05);
    else return;
    renderer.setPixelRatio(BASE_PIXEL_RATIO * renderScale);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  }
}

hud.setSpeed(1);
hud.showTitle(true);
window.__game = { renderer, scene, rig, hand, entities, sky, input, perf, stats, radial };
requestAnimationFrame(frame);
