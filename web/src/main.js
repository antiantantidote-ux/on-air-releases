// EL DIOS PRESIDENTE — bootstrap and frame loop.
// Phase 1: engine, island, water, day/night, DS4 hand (grab/throw), camera, radial wheels.
// Phase 2: building placement, construction, supply chains, citizens' needs, Pesos & Mana.
// Phase 3: the Creature — utility AI, drive x action weight matrix, pet / slap training.
import * as THREE from './three.js';
import { createTerrain, SITES } from './terrain.js';
import { createSky } from './sky.js';
import { createWater } from './water.js';
import { createScenery } from './scenery.js';
import { createEntities, TYPES } from './entities.js';
import { createBuildings, BUILDINGS, GOODS } from './buildings.js';
import { createSociety } from './society.js';
import { createIcons } from './icons.js';
import { createCreature, SPECIES, DRIVES } from './creature.js';
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
const icons = createIcons(scene);

const hud = createHud();
const input = createInput();
const rig = createCameraRig(terrain);
const pulses = createPulses(scene, terrain);
const radial = createRadial(document.getElementById('radial'));

const stats = { lostAtSea: 0, dunked: 0, miracles: 0, edicts: 0 };
const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;

/** Advisor nagging with a cooldown, for conditions that can recur. */
const cooldowns = {};
function warn(key, who, text, seconds = 150) {
  if ((cooldowns[key] || 0) > simTime) return;
  cooldowns[key] = simTime + seconds;
  hud.advise(who, text);
}

// ---------------------------------------------------------------------------------
// Buildings and the economy
// ---------------------------------------------------------------------------------
const buildings = createBuildings(scene, terrain, scenery, icons, {
  onExport(total, sold) {
    society.earn(total);
    society.exported += total;
    hud.toast(`🚢 Freighter paid ${money(total)}`);
    input.rumble(0.2, 0.4, 120);
    hud.advise('penultimo', `The freighter took ${sold.join(', ')}. Pesos, Presidente! A modest handling fee has gone to the Swiss Altar Account.`, 'export');
  },
  onBuilt(b) {
    pulses.emit(b.x, b.z, Math.max(b.def.w, b.def.d), 0x7dff7a, 0.9);
    hud.toast(`${b.def.icon} ${b.def.label} complete`);
    if (b.def.faith) hud.advise('xochitl', 'A cathedral! Now their prayers will reach you four times as loudly.', 'cathedral');
    if (b.def.guard) hud.advise('penultimo', 'An outpost. Protests will be… brief. The people may feel slightly less free.', 'outpost');
    if (b.def.consumes) hud.advise('penultimo', `The ${b.def.label.toLowerCase()} needs ${GOODS[b.def.consumes].label.toLowerCase()}. Farm workers will haul it over.`, 'factory');
  },
});

// ---------------------------------------------------------------------------------
// World events -> juice (rings, rumble, camera shake) and advisor commentary.
// ---------------------------------------------------------------------------------
const entities = createEntities(scene, terrain, (event, o, data) => {
  if (event === 'splash') {
    pulses.emit(o.pos.x, o.pos.z, 3 + o.def.mass * 1.5, 0xffffff, 0.8);
    input.rumble(0.15, 0.5, 120);
    if (o.type === 'citizen') {
      stats.dunked++;
      society.traumatise(o, 0.18);
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
  } else if (event === 'settled') {
    // Things the Hand drops onto buildings do something.
    if (o.type === 'citizen') {
      const b = buildings.at(o.pos.x, o.pos.z);
      if (b && society.assignJob(o, b, true)) {
        hud.toast(`${b.def.icon} ${o.name} now works at the ${b.def.label}`);
        hud.advise('penultimo', 'Career counselling by divine hand. No one has ever refused the offer.', 'assign');
      }
    } else if (o.type !== 'boulder') {
      const r = buildings.receiveCargo(o);
      if (!r) return;
      pulses.emit(o.pos.x, o.pos.z, 5, 0x7dff7a, 0.6);
      entities.remove(o);
      if (r.kind === 'build') hud.toast(`🏗️ Materials delivered: ${r.b.def.label} ${Math.round(r.b.progress * 100)}%`);
      else if (r.kind === 'export') hud.toast(`⚓ ${GOODS[r.good].label} stowed for the next freighter`);
      else hud.toast(`📦 ${r.b.def.label} resupplied`);
    }
  }
});
entities.populate();

const society = createSociety(entities, buildings, terrain, sky, {
  onDeath(o) {
    hud.toast(`✝️ ${o.name} has died`);
    warn('death', 'xochitl', `${o.name} has starved, Great One. A plantain farm costs less than a funeral.`, 90);
  },
  onImmigrant(o) {
    hud.toast(`⚓ ${o.name} has immigrated`);
    hud.advise('penultimo', 'New arrivals at the dock! They heard we have free beds and a functioning deity.', 'immigrant');
  },
  onPayday(day, today, wages, upkeep) {
    hud.toast(`📒 Day ${day}: +${money(today.income)} · −${money(today.expenses)}`);
    hud.advise('penultimo', `Midnight payroll: ${money(wages)} in wages and ${money(upkeep)} in upkeep. Details are in the Almanac (OPTIONS).`, 'payday');
  },
});

// A starter town so the loop is alive on day one: beds, food and a way to export.
{
  const P = SITES.palace;
  for (const type of ['tenement', 'tenement', 'plantain', 'dock']) {
    const spot = buildings.findSpot(type, P.x, P.z, type === 'dock' ? 30 : 24);
    if (spot) buildings.add(type, spot.x, spot.z, spot.rot, true);
  }
}

const hand = createHand(scene, terrain, entities, input, {
  onGrab(o) {
    society.traumatise(o, 0.04);
    if (o.type === 'citizen') {
      hud.advise('penultimo', `You have ${o.name} by the collar. Drop him on a workplace to reassign him — or hold R2 and release while moving.`, 'grab-citizen');
    } else {
      hud.advise('xochitl', 'Carry it gently. Crates dropped on a building site speed the work; at the dock they are exported.', 'grab-cargo');
    }
  },
  onThrow(o) { society.traumatise(o, 0.14); },
});
hand.teleport(SITES.palace.x + 6, SITES.palace.z + 16);
rig.snapTo(hand.pos.x, hand.pos.z);

// ---------------------------------------------------------------------------------
// El Mascota Supremo
// ---------------------------------------------------------------------------------
const creature = createCreature(scene, terrain, {
  entities, buildings, society,
  fx: {
    pulse: (x, z, size, color) => pulses.emit(x, z, size, color, 0.8),
    shake: (amount) => rig.addShake(amount),
    rumble: (strong, weak, ms) => input.rumble(strong, weak, ms),
    toast: (text) => hud.toast(text),
    say: (who, text, key) => hud.advise(who, text, key),
  },
});

/** Square = pet (+1), Circle = slap (-1), while the Hand hovers over the Creature. */
function teach(sign) {
  const lesson = sign > 0 ? creature.pet() : creature.slap();
  hand.gesture(sign > 0 ? 'pet' : 'slap');
  if (sign > 0) input.rumble(0.1, 0.5, 220); else { input.rumble(1, 0.4, 120); rig.addShake(0.25); }
  const name = creature.species.name;
  if (lesson) {
    const pct = Math.round((lesson.weight / lesson.prior) * 100);
    hud.toast(`${sign > 0 ? '❤️' : '💢'} “${creature.ACTIONS[lesson.action].label}” when ${DRIVES[lesson.drive].label.toLowerCase()}: ${pct}% of instinct`);
  } else {
    hud.toast(sign > 0 ? `❤️ ${name} is pleased, but not sure what for` : `💢 ${name} flinches, confused`);
  }
  if (sign > 0) hud.advise('xochitl', `Praise teaches. Pet ${name} during a deed, or within a few seconds after, and it will do that deed more often.`, 'pet');
  else hud.advise('penultimo', `A firm slap stops ${name} mid-deed and makes that deed rarer. Too many and it stops obeying orders.`, 'slap');
}

function order(action, label, desc) {
  return {
    icon: creature.ACTIONS[action].icon, label, desc,
    action: () => {
      if (!creature.alive) return;
      const r = creature.command(action), name = creature.species.name;
      if (r === 'ok') hud.toast(`🐾 ${name}: “${creature.ACTIONS[action].label}” — at once!`);
      else if (r === 'refused') { hud.toast(`💢 ${name} ignores the order`); hud.advise('penultimo', `${name} is sulking. Its trust in you is low — pet it more, slap it less.`, 'refused'); }
      else hud.toast(`🐾 Nothing to ${creature.ACTIONS[action].label.toLowerCase()} right now`);
    },
  };
}

// ---------------------------------------------------------------------------------
// Modes: blueprint placement and demolition
// ---------------------------------------------------------------------------------
let mode = null; // null | { kind: 'place', type, rot, ghost } | { kind: 'demolish' }

function beginPlacement(type) {
  const def = BUILDINGS[type];
  if (!society.canAfford(def.cost)) { hud.toast(`Not enough pesos for a ${def.label} (${money(def.cost)})`); return; }
  if (hand.held) hand.drop();
  mode = { kind: 'place', type, rot: 0, ghost: null };
  hud.advise('penultimo', 'Move the blueprint with the Hand. Square rotates, Cross builds, L2 for fine adjustment.', 'placing');
}

function confirmPlacement() {
  const g = mode.ghost, def = BUILDINGS[mode.type];
  if (!g) return;
  if (!g.ok) { hud.toast(`⛔ ${g.reason}`); input.rumble(0.5, 0, 80); return; }
  if (!society.spend(def.cost)) { hud.toast('Not enough pesos'); return; }
  const b = buildings.add(mode.type, g.x, g.z, mode.rot);
  if (!b) { society.pesos += def.cost; society.today.expenses -= def.cost; return; }
  pulses.emit(g.x, g.z, Math.max(def.w, def.d) * 0.8, 0xffd34d, 0.6);
  input.rumble(0.6, 0.3, 120);
  hud.toast(`🏗️ ${def.label} site founded · −${money(def.cost)}`);
  hud.advise('xochitl', 'Idle hands will come to build. Drop a crate on the site if you are impatient, Great One.', 'site');
  mode = null;
}

function demolish(b) {
  const refund = Math.round(b.def.cost * 0.5);
  buildings.remove(b);
  society.pesos += refund;
  pulses.emit(b.x, b.z, Math.max(b.def.w, b.def.d), 0xff6b5b, 0.7);
  rig.addShake(0.4);
  hud.toast(`🧱 ${b.def.label} demolished · +${money(refund)}`);
}

// ---------------------------------------------------------------------------------
// Radial wheels
// ---------------------------------------------------------------------------------
const _v = new THREE.Vector3();

function deliver(type, cost) {
  if (!society.spend(cost)) { hud.toast(`Not enough pesos (${money(cost)})`); return null; }
  const jitter = () => (Math.random() - 0.5) * 2.5;
  const o = entities.spawn(type, hand.pos.x + jitter(), hand.pos.y + 28, hand.pos.z + jitter());
  if (!o) { society.pesos += cost; hud.toast(`Heaven's warehouse is out of ${TYPES[type].label.toLowerCase()}s`); return null; }
  o.vel.set(0, -6, 0);
  return o;
}

/** Wrap a miracle so it costs Mana. */
function miracle(cost, fn) {
  return () => {
    if (!society.spendMana(cost)) {
      hud.toast(`Not enough Mana (${cost}✨ needed)`);
      hud.advise('xochitl', 'Your Mana is spent, Great One. More worshippers — or a cathedral — will refill it.', 'no-mana');
      return;
    }
    stats.miracles++;
    fn();
  };
}

function edict(cost, fn) {
  return () => {
    if (!society.spend(cost)) { hud.toast(`Not enough pesos (${money(cost)})`); return; }
    stats.edicts++;
    fn();
  };
}

const buildItem = (type) => {
  const def = BUILDINGS[type];
  const label = def.label.length > 11 ? def.label.replace(' ', '\n') : def.label;
  return { icon: def.icon, label, desc: def.desc, cost: money(def.cost), action: () => beginPlacement(type) };
};

function moveSun(hour, label) {
  sky.setHour(hour);
  hud.toast(`☀️ ${label}`);
  hud.advise('xochitl', 'You moved the SUN. The farmers’ almanac is now a work of fiction.', 'sun');
}

const WHEEL_L1 = {
  title: 'Construction & Edicts',
  hint: 'Build, decree, requisition',
  items: [
    { icon: '🌾', label: 'Farms', desc: 'Food and cash crops.', children: ['plantain', 'sugar', 'tobacco', 'coffee'].map(buildItem) },
    { icon: '🏭', label: 'Industry', desc: 'Factories and the dock.', children: ['distillery', 'cigars', 'dock'].map(buildItem) },
    { icon: '🏛️', label: 'Civic', desc: 'Homes, health, faith, order.', children: ['tenement', 'clinic', 'cathedral', 'outpost'].map(buildItem) },
    {
      icon: '📦', label: 'Requisition', desc: 'Physical goods, airmailed to the Hand.',
      children: [
        { icon: '📦', label: 'Sugar Crate', desc: 'Drop on a site to rush it, or on a dock to export.', cost: '$120', action: () => deliver('crate', 120) },
        { icon: '🛢️', label: 'Rum Barrel', desc: 'Aged twelve minutes. Floats.', cost: '$160', action: () => deliver('barrel', 160) },
        { icon: '🪨', label: 'Boulder', desc: 'Heavy. Persuasive. Sinks.', cost: '$40', action: () => deliver('boulder', 40) },
        {
          icon: '🧑‍🌾', label: 'Islander', desc: 'Immigration by divine airdrop.', cost: '$300',
          action: () => { if (deliver('citizen', 300)) hud.advise('penultimo', 'A new voter! Falling from the sky makes them humble.', 'airdrop'); },
        },
      ],
    },
    {
      icon: '📜', label: 'Edicts', desc: 'Presidential decrees.',
      children: [
        {
          icon: '😴', label: 'Mandatory\nSiesta', desc: 'Everyone outdoors lies down. That is an order.', cost: '$150',
          action: edict(150, () => {
            const n = entities.siesta(14);
            hud.toast(`😴 ${n} islanders ordered to nap`);
            hud.advise('penultimo', 'A sleeping population cannot protest. Efficient.', 'siesta');
          }),
        },
        {
          icon: '🎉', label: '¡Fiesta!', desc: 'Compulsory joy: lifts Faith, soothes grudges.', cost: '$400',
          action: edict(400, () => {
            let n = 0;
            for (const c of entities.lists.citizen) {
              c.needs.faith = Math.min(1, c.needs.faith + 0.3);
              c.trauma = Math.max(0, c.trauma - 0.25);
              if ((c.state === 'walk' || c.state === 'idle' || c.state === 'act') && !c.hidden) { entities.launch(c, 0, 7 + Math.random() * 4, 0, 0.5); n++; }
            }
            hud.toast(`🎉 ${n} islanders jump for joy`);
          }),
        },
        {
          icon: '🧹', label: 'Confiscate\nCargo', desc: 'All loose cargo becomes state property.', cost: 'Free',
          action: edict(0, () => {
            const n = entities.clearCargo();
            hud.toast(`🧹 ${n} items confiscated`);
            hud.advise('penultimo', 'Nationalised. It will be stored safely in my garage.', 'confiscate');
          }),
        },
      ],
    },
    {
      icon: '🧱', label: 'Demolish', desc: 'Bulldoze buildings for a 50% refund.',
      action: () => { if (hand.held) hand.drop(); mode = { kind: 'demolish' }; },
    },
  ],
};

const WHEEL_R1 = {
  title: 'Miracles',
  hint: 'Miracles cost Mana and strike at the Hand',
  items: [
    {
      icon: '☀️', label: 'Move\nthe Sun', desc: 'Time is a suggestion.',
      children: [
        { icon: '🌅', label: 'Dawn', desc: 'Roosters, confused.', cost: '15 ✨', action: miracle(15, () => moveSun(6.2, 'Dawn')) },
        { icon: '☀️', label: 'High Noon', desc: 'Peak tourist tanning.', cost: '15 ✨', action: miracle(15, () => moveSun(12, 'High noon')) },
        { icon: '🌇', label: 'Dusk', desc: 'Golden hour, on demand.', cost: '15 ✨', action: miracle(15, () => moveSun(17.6, 'Dusk')) },
        { icon: '🌙', label: 'Midnight', desc: 'Curfew made easy. Payroll comes early.', cost: '15 ✨', action: miracle(15, () => moveSun(0, 'Midnight')) },
      ],
    },
    {
      icon: '🌋', label: 'Tremor', desc: 'The ground hiccups under the Hand.', cost: '30 ✨',
      action: miracle(30, () => {
        const n = entities.shockwave(hand.pos.x, hand.pos.z, 17, 24);
        pulses.emit(hand.pos.x, hand.pos.z, 17, 0xff9a3c, 0.9);
        rig.addShake(0.9);
        input.rumble(1, 0.6, 350);
        hud.toast(`🌋 Tremor! ${n} things airborne`);
        hud.advise('xochitl', 'The earth trembles at your whim. So do the chickens.', 'tremor');
      }),
    },
    {
      icon: '🧲', label: 'Rapture', desc: 'Everything nearby flies to the Hand.', cost: '20 ✨',
      action: miracle(20, () => {
        let n = 0;
        entities.forEachNear(hand.pos.x, hand.pos.z, 34, (o, d) => {
          if (d < 3) return;
          const T = 1.1; // solve a ballistic arc that ends at the cursor
          _v.set((hand.pos.x - o.pos.x) / T, (hand.pos.y + 1 - o.pos.y) / T + 0.5 * 34 * T, (hand.pos.z - o.pos.z) / T);
          entities.launch(o, _v.x, _v.y, _v.z);
          n++;
        });
        pulses.emit(hand.pos.x, hand.pos.z, 12, 0x9fd8ff, 1.0);
        hud.toast(`🧲 ${n} things answer the call`);
      }),
    },
    {
      icon: '🐾', label: 'Mascota', desc: 'Orders for your Creature. It obeys if it trusts you.',
      children: [
        order('water', 'Water\ncrops', 'Go and water the nearest thirsty farm.'),
        order('build', 'Help\nbuild', 'Lend a paw at the nearest building site.'),
        order('haul', 'Haul\ngoods', 'Carry a big load to the factory or dock.'),
        order('dance', 'Dance', 'Entertain the people at the palace.'),
        order('scare', 'Guard', 'Scatter the protesters.'),
        order('sleep', 'Go to\nsleep', 'Back to the nest for a nap.'),
      ],
    },
    {
      icon: '☄️', label: 'Meteor', desc: 'A boulder, but from much higher up.', cost: '60 ✨',
      action: miracle(60, () => {
        const o = entities.spawn('boulder', hand.pos.x - 40, hand.pos.y + 120, hand.pos.z - 14);
        if (!o) { society.mana += 60; hud.toast('The heavens are out of rocks'); return; }
        const vy = -40, T = (vy + Math.sqrt(vy * vy + 2 * 34 * 120)) / 34;
        entities.launch(o, 40 / T, vy, 14 / T, 0.3);
        o.meteor = true;
        o.tint.setRGB(1.6, 0.7, 0.35);
        hud.toast('☄️ Incoming!');
      }),
    },
  ],
};

// ---------------------------------------------------------------------------------
// Context actions
// ---------------------------------------------------------------------------------
let hoverBuilding = null;
let inspecting = null; // { kind: 'entity' | 'building' | 'ground', ref }

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

const NEED_COLORS = { food: '#ffd34d', housing: '#ffa64d', health: '#ff7a8a', liberty: '#9fd8ff', faith: '#58e0c0' };
const NEED_LABELS = { food: 'Food', housing: 'Home', health: 'Health', liberty: 'Liberty', faith: 'Faith' };

function buildingCard(b) {
  const def = b.def, bars = [];
  let sub;
  if (!b.built) {
    sub = `Under construction · ${b.present} builder${b.present === 1 ? '' : 's'} on site`;
    bars.push(['Built', b.progress, '#ffd34d']);
  } else {
    const bits = [];
    if (def.workers) { bits.push(`Staff ${b.workers.length}/${def.workers}`); bars.push(['Staff', b.workers.length / def.workers, '#9fd8ff']); }
    if (def.produces) {
      bits.push(`${GOODS[def.produces].label}: ${b.out} ready`);
      bars.push(['Work', b.prod, '#7dff7a'], ['Output', b.out / def.cap, '#ffd34d']);
    }
    if (def.consumes) bars.push(['Input', Math.min(1, b.inp / 8), '#ffa64d']);
    if (def.housing) { bits.push(`Residents ${b.residents.length}/${def.housing}`); bars.push(['Beds', b.residents.length / def.housing, '#ffa64d']); }
    if (def.coastal) {
      const waiting = Object.entries(b.stock).filter(([, n]) => n > 0).map(([g, n]) => `${n} ${GOODS[g].label.toLowerCase()}`);
      bits.push(waiting.length ? `Awaiting freighter: ${waiting.join(', ')}` : 'Warehouse empty');
    }
    if (b.boost > 0) bits.push('Blessed ✨');
    sub = bits.join(' · ') || def.desc;
  }
  return { icon: def.icon, title: def.label, sub, bars };
}

function cardFor(target) {
  if (target.kind === 'creature') {
    const sp = creature.species, d = DRIVES[creature.drive()];
    return {
      icon: sp.icon, title: `${sp.name} · ${sp.title}`, sub: `${d.icon} ${d.label} · ${creature.describe()}`,
      bars: [['Fed', 1 - creature.hunger, '#ffd34d'], ['Energy', creature.energy, '#9fd8ff'], ['Trust', creature.affection, '#ff9be0']],
    };
  }
  if (target.kind === 'building') return target.ref.alive ? buildingCard(target.ref) : null;
  if (target.kind === 'ground') {
    const [icon, name] = biomeAt(target.x, target.z);
    const h = terrain.heightAt(target.x, target.z);
    return { icon, title: name, sub: h < 0 ? `${(-h).toFixed(1)} m deep` : `Elevation ${h.toFixed(1)} m` };
  }
  const o = target.ref;
  if (o.state === 'gone') return null;
  if (o.type === 'citizen') {
    const needs = society.needsOf(o);
    const job = o.job ? o.job.def.label : 'Unemployed';
    return {
      icon: o.def.icon, title: o.name, sub: `${job} · ${society.describe(o)}`,
      bars: Object.keys(needs).map((k) => [NEED_LABELS[k], needs[k], NEED_COLORS[k]]),
    };
  }
  return {
    icon: o.def.icon, title: o.def.label,
    sub: `${o.def.floats ? 'Floats' : 'Sinks'} · ${o.state === 'float' ? 'Adrift at sea' : 'Grab with R2'}`,
    bars: [['Heft', clamp(o.def.mass / 5, 0.1, 1), '#ff8a4a']],
  };
}

function openInspect() {
  const o = hand.hover || hand.held;
  if (o) inspecting = { kind: 'entity', ref: o };
  else if (hoverBuilding) inspecting = { kind: 'building', ref: hoverBuilding };
  else inspecting = { kind: 'ground', x: hand.pos.x, z: hand.pos.z };
  hud.inspect(cardFor(inspecting));
}

function bless() {
  const o = hand.hover;
  pulses.emit(hand.pos.x, hand.pos.z, 5, 0xffe066, 0.5);
  input.rumble(0, 0.35, 50);
  if (o) {
    if (o.type === 'citizen') {
      if (o.state === 'siesta' || o.state === 'dazed') { o.state = 'idle'; o.timer = 0.3; }
      o.needs.faith = Math.min(1, o.needs.faith + 0.15);
      hud.toast(`✨ ${o.name} feels noticed`);
      hud.advise('xochitl', 'A gentle tap of blessing. See? The Hand can do more than throw.', 'bless');
    } else {
      entities.launch(o, 0, 9 / Math.sqrt(o.def.mass), 0, 0.6);
    }
    return;
  }
  const b = hoverBuilding;
  if (!b) return;
  if (!society.spendMana(10)) { hud.toast('Blessing a building costs 10✨'); return; }
  pulses.emit(b.x, b.z, Math.max(b.def.w, b.def.d), 0xffe066, 0.8);
  if (!b.built) { b.progress = Math.min(1, b.progress + 0.2); hud.toast(`✨ Divine scaffolding: ${b.def.label} +20%`); }
  else if (b.def.produces) { b.boost = 30; hud.toast(`✨ ${b.def.label} blessed: output ×2.5 for 30 s`); }
  else {
    for (const c of [...b.residents, ...b.workers]) c.needs.faith = Math.min(1, c.needs.faith + 0.3);
    hud.toast(`✨ ${b.def.label} blessed`);
  }
}

// ---------------------------------------------------------------------------------
// Frame loop
// ---------------------------------------------------------------------------------
let speed = 1;            // D-pad: 0 pause, 1x, 2x
let simTime = 0;
let started = false;
let snapToCreature = false;
let choosing = false, pick = 0, stickArmed = true;
let hoverCreature = false;
let almanacPage = 0;
let last = performance.now();
let fps = 60, frameMs = 16.7, perfTimer = 0;
const perf = { calls: 0, triangles: 0 };

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  rig.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

/** Advance the simulation (not the Hand, camera or HUD) by dt seconds. */
function simulate(dt) {
  simTime += dt;
  entities.update(dt, simTime);
  society.update(dt);
  buildings.update(dt, simTime);
  creature.update(dt, simTime, hand.pos);
  sky.update(dt, rig.focus);
}

function watchTheRepublic() {
  if (society.protesters >= 3) warn('protest', 'penultimo', `${society.protesters} protesters at the palace gates! Feed them, house them, bless them… or build an outpost.`);
  if (society.avg.food < 0.35) warn('hunger', 'xochitl', 'The people are hungry, Great One. Another plantain farm, I beg you.');
  if (society.homeless > 8 && society.homeless > entities.count('citizen') * 0.4) warn('homeless', 'xochitl', `${society.homeless} of your people sleep under the palms. A tenement houses eight.`, 240);
  if (society.pesos < 0) warn('debt', 'penultimo', 'The treasury is empty! Export something — sugar, rum, anything — before payroll.');
  if (society.mana >= society.manaCap() - 1) warn('mana-full', 'xochitl', 'Your Mana overflows, Great One. Hold R1 and spend it; unused miracles are wasted.', 300);
}

function creatureCards() {
  const C = creature, sp = C.species, drive = C.drive();
  const cols = C.ACTION_KEYS.length;
  let grid = `<div class="mind" style="grid-template-columns:auto repeat(${cols},1fr)"><div></div>`;
  for (const a of C.ACTION_KEYS) grid += `<div class="head">${C.ACTIONS[a].icon}</div>`;
  for (const d of C.DRIVE_KEYS) {
    grid += `<div class="row${d === drive ? ' active' : ''}">${DRIVES[d].icon} ${DRIVES[d].label}</div>`;
    for (const a of C.ACTION_KEYS) {
      const w = C.W[d][a], ratio = w / C.P[d][a];
      const size = (0.35 + 1.9 * Math.sqrt(w / 4)).toFixed(2);
      const color = ratio > 1.12 ? '#5fe36a' : ratio < 0.9 ? '#ff6b5b' : '#c9d2e6';
      const active = C.current && C.current.action === a && C.current.drive === d;
      grid += `<div class="cell${active ? ' active' : ''}"><i style="width:${size}rem;height:${size}rem;background:${color}"></i></div>`;
    }
  }
  grid += `</div><div class="mind-legend">Bigger dot = more likely<i style="background:#5fe36a"></i>rewarded<i style="background:#ff6b5b"></i>punished<i style="background:#c9d2e6"></i>instinct</div>`;
  grid += `<div class="mind-legend">${C.ACTION_KEYS.map((a) => `<span>${C.ACTIONS[a].icon} ${C.ACTIONS[a].label}</span>`).join(' ')}</div>`;
  const favourite = C.ACTION_KEYS.reduce((best, a) => (C.deeds[a] > C.deeds[best] ? a : best), C.ACTION_KEYS[0]);
  return [
    {
      title: `${sp.icon} ${sp.name}`,
      bars: [
        ['Fed', 1 - C.hunger, 1, '#ffd34d', `${Math.round((1 - C.hunger) * 100)}%`],
        ['Energy', C.energy, 1, '#9fd8ff', `${Math.round(C.energy * 100)}%`],
        ['Trust', C.affection, 1, '#ff9be0', `${Math.round(C.affection * 100)}%`],
      ],
      stats: [
        ['Mood', `${DRIVES[drive].icon} ${DRIVES[drive].label}`],
        ['Doing', C.describe()],
        ['Good · Bad deeds', `${C.good} · ${C.evil}`],
        ['Pets · Slaps', `${C.pets} · ${C.slaps}`],
        ['Favourite deed', C.deeds[favourite] ? `${C.ACTIONS[favourite].icon} ×${C.deeds[favourite]}` : '—'],
      ],
    },
    { title: '🧠 What it has learned', wide: true, html: grid },
  ];
}

function almanacCards() {
  if (almanacPage === 1 && creature.alive) return creatureCards();
  const S = society, a = S.avg;
  const tone = (v) => (v > 0.6 ? '#7dff7a' : v > 0.35 ? '#ffd34d' : '#ff6b5b');
  const pct = (v) => `${Math.round(v * 100)}%`;
  const hist = S.history.map((h) => h.pesos);
  const yesterday = S.ledger[S.ledger.length - 1];
  return [
    {
      title: '💰 La Economía',
      chart: { values: hist.concat(S.pesos), color: '#ffd34d', caption: `Treasury · ${money(Math.min(...hist, S.pesos))} to ${money(Math.max(...hist, S.pesos))}` },
      stats: [
        ['Treasury', money(S.pesos)],
        ['Today', `+${money(S.today.income)} · −${money(S.today.expenses)}`],
        ['Yesterday', yesterday ? `+${money(yesterday.income)} · −${money(yesterday.expenses)}` : '—'],
        ['Exports, all time', money(S.exported)],
      ],
    },
    {
      title: '👥 El Pueblo',
      bars: [
        ['Food', a.food, 1, tone(a.food), pct(a.food)],
        ['Housing', a.housing, 1, tone(a.housing), pct(a.housing)],
        ['Health', a.health, 1, tone(a.health), pct(a.health)],
        ['Liberty', a.liberty, 1, tone(a.liberty), pct(a.liberty)],
        ['Faith', a.faith, 1, tone(a.faith), pct(a.faith)],
      ],
      stats: [
        ['Population', `${entities.count('citizen')} · ${S.employed} employed`],
        ['Homeless · Protesting', `${S.homeless} · ${S.protesters}`],
      ],
    },
    {
      title: '🧤 Lo Divino',
      bars: [
        ['Mana', S.mana, S.manaCap(), '#58e0c0', `${Math.floor(S.mana)}/${S.manaCap()}`],
        ['Happiness', a.mood, 1, tone(a.mood), pct(a.mood)],
        ['Frame rate', fps, 60, fps > 55 ? '#7dff7a' : fps > 40 ? '#ffd34d' : '#ff6b5b', `${Math.round(fps)} fps`],
        ['Draw calls', perf.calls, 150, perf.calls <= 150 ? '#7dff7a' : '#ff6b5b', `${perf.calls}/150`],
      ],
      stats: [
        ['Miracles · Edicts', `${stats.miracles} · ${stats.edicts}`],
        ['Thrown · Longest', `${hand.stats.throws} · ${Math.round(hand.stats.longest)} m`],
      ],
    },
  ];
}

function updateHints() {
  if (hud.almanacOpen()) return hud.setHints([['dpad', almanacPage ? 'Economy page' : 'Creature page'], ['options', 'Close']]);
  if (radial.isOpen) return hud.setHints([]);
  if (mode && mode.kind === 'place') return hud.setHints([['cross', `Build ${money(BUILDINGS[mode.type].cost)}`], ['square', 'Rotate'], ['circle', 'Cancel'], ['l2', 'Precision']]);
  if (mode && mode.kind === 'demolish') return hud.setHints([['cross', hoverBuilding ? `Demolish ${hoverBuilding.def.label}` : 'Demolish'], ['circle', 'Done']]);
  if (hand.held) return hud.setHints([['ls', 'Wind up'], ['r2', 'Release to throw'], ['circle', 'Set down'], ['square', 'Inspect']]);
  if (hoverCreature) return hud.setHints([['square', 'Pet'], ['circle', 'Slap'], ['r2', creature.leashed ? 'Unleash' : 'Leash'], ['r1', 'Commands']]);
  if (hand.hover) return hud.setHints([['r2', 'Grab'], ['cross', 'Bless'], ['square', 'Inspect'], ['l2', 'Precision']]);
  if (hoverBuilding) return hud.setHints([['cross', hoverBuilding.built ? 'Bless 10✨' : 'Rush 10✨'], ['square', `Inspect ${hoverBuilding.def.label}`], ['l1', 'Build']]);
  if (creature.leashed) return hud.setHints([['ls', 'Lead the way'], ['r2', 'Unleash'], ['triangle', 'Palace / Mascota'], ['options', 'Almanac']]);
  hud.setHints([['ls', 'Hand'], ['rs', 'Camera'], ['l1', 'Build'], ['r1', 'Miracles'], ['triangle', 'Palace / Mascota'], ['options', 'Almanac']]);
}

function refreshHud() {
  hud.setClock(sky.env.day, sky.clockText(), sky.env.daylight);
  hud.setResources({ pesos: society.pesos, mana: society.mana, manaCap: society.manaCap(), pop: entities.count('citizen'), mood: society.avg.mood });
  if (hud.almanacOpen()) hud.almanac(almanacCards());
  if (inspecting && hud.inspectOpen()) {
    const card = cardFor(inspecting);
    if (card) hud.inspect(card); else { hud.inspect(null); inspecting = null; }
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const realDt = Math.min(0.05, (now - last) / 1000);
  frameMs += ((now - last) - frameMs) * 0.05;
  last = now;
  const pad = input.poll();

  // --- title / controller gate -------------------------------------------------------
  if (!started) {
    if (choosing) {
      // Choose your Mascota: D-pad or left stick, Cross hatches the egg.
      const flick = Math.abs(pad.lx) > 0.6 ? Math.sign(pad.lx) : 0;
      let dir = (pad.pressed.right ? 1 : 0) - (pad.pressed.left ? 1 : 0);
      if (flick && stickArmed) dir += flick;
      stickArmed = !flick;
      if (dir) { pick = (pick + dir + SPECIES.length) % SPECIES.length; hud.choose(SPECIES, pick); }
      if (pad.pressed.cross) {
        choosing = false; started = true;
        hud.choose(null);
        scenery.egg.visible = false;
        creature.hatch(SPECIES[pick]);
        pulses.emit(SITES.nest.x, SITES.nest.z, 16, 0xffe066, 1.0);
        rig.addShake(0.6); input.rumble(0.8, 0.8, 400);
        const name = creature.species.name;
        hud.advise('xochitl', `${name} has hatched! Hover the Hand over it: Square to pet when it does well, Circle to slap when it misbehaves. It learns.`);
        hud.advise('penultimo', 'Presidente! Press Triangle for the palace, then hold L1 to build. A sugar plantation near the dock and the pesos will flow.');
      }
    } else if (input.anyInput()) {
      const anyPress = Object.values(pad.pressed).some(Boolean);
      hud.showTitle(true, pad.connected
        ? 'DualShock 4 connected — press <span class="btn cross">✕</span> to rule'
        : 'Keyboard detected — press <b>Enter</b> to rule');
      if (anyPress) {
        hud.showTitle(false);
        choosing = true;
        hud.choose(SPECIES, pick);
        hand.teleport(SITES.nest.x + 5, SITES.nest.z + SITES.nest.r);
        rig.snapTo(SITES.nest.x, SITES.nest.z);
      }
    }
    rig.yaw += realDt * 0.12; // attract-mode orbit
  } else if (!input.anyInput() || (!pad.connected && !pad.usingKeyboard)) {
    hud.showTitle(true, 'Controller lost — press <span class="pill">PS</span> to reconnect your DualShock 4');
  } else if (!document.getElementById('title').hidden) {
    hud.showTitle(false);
  }

  const playing = started;
  hoverCreature = playing && creature.alive && !hand.held && !mode
    && Math.hypot(hand.pos.x - creature.pos.x, hand.pos.z - creature.pos.z) < creature.radius + 2.5;
  hand.extraHover = hoverCreature ? creature.height - 3 : 0;
  const demolishing = mode && mode.kind === 'demolish';
  hoverBuilding = hoverCreature || hand.held || (hand.hover && !demolishing) ? null : buildings.at(hand.pos.x, hand.pos.z);
  // The Creature's status card follows the Hand on and off it (Square is "pet" there, not "inspect").
  if (hoverCreature) {
    if (!inspecting || inspecting.kind !== 'creature') { inspecting = { kind: 'creature' }; hud.inspect(cardFor(inspecting)); }
  } else if (inspecting && inspecting.kind === 'creature') { inspecting = null; hud.inspect(null); }

  if (playing) {
    // --- Almanac (Options / touchpad click) --------------------------------------------
    if (pad.pressed.options || pad.pressed.touchpad) {
      if (hud.almanacOpen()) hud.almanac(null);
      else { radial.close(); hud.almanac(almanacCards()); }
    } else if (hud.almanacOpen() && pad.pressed.circle) hud.almanac(null);
    else if (hud.almanacOpen() && (pad.pressed.left || pad.pressed.right)) { almanacPage = 1 - almanacPage; hud.almanac(almanacCards()); }

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
      } else if (pad.pressed.l1) { mode = null; radial.open(WHEEL_L1, 'l1'); }
      else if (pad.pressed.r1) { mode = null; radial.open(WHEEL_R1, 'r1'); }
      else if (mode && mode.kind === 'place') {
        if (pad.pressed.square) mode.rot += buildings.ROT_STEP;
        if (pad.pressed.cross) confirmPlacement();
        else if (pad.pressed.circle) mode = null;
      } else if (mode && mode.kind === 'demolish') {
        if (pad.pressed.cross && hoverBuilding) demolish(hoverBuilding);
        if (pad.pressed.circle) mode = null;
      } else if (hoverCreature) {
        // --- the Creature: pet, slap, leash -------------------------------------------------
        if (pad.pressed.square) teach(1);
        if (pad.pressed.circle) teach(-1);
        if (pad.pressed.r2) {
          const on = creature.toggleLeash();
          hud.toast(on ? `🐾 ${creature.species.name} is on the leash — lead the way` : `🐾 ${creature.species.name} is off the leash`);
          hud.advise('xochitl', 'On the leash it follows the Hand. Lead it to what you want it to learn about, then press R2 again to let it choose.', 'leash');
        }
      } else {
        // --- face buttons ---------------------------------------------------------------
        if (creature.leashed && pad.pressed.r2 && !hand.hover && !hand.held) { creature.toggleLeash(); hud.toast(`🐾 ${creature.species.name} is off the leash`); }
        if (pad.pressed.cross) bless();
        if (pad.pressed.square) openInspect();
        if (pad.pressed.circle) {
          if (hud.inspectOpen()) { hud.inspect(null); inspecting = null; }
          else if (hand.held) hand.drop();
        }
        if (pad.pressed.triangle) {
          const toCreature = snapToCreature && creature.alive;
          snapToCreature = !snapToCreature;
          if (hand.held) hand.drop();
          if (toCreature) hand.teleport(creature.pos.x + creature.radius + 3, creature.pos.z + creature.radius + 3);
          else hand.teleport(SITES.palace.x + 4, SITES.palace.z + SITES.palace.r * 0.8);
          rig.snapTo(hand.pos.x, hand.pos.z);
          hud.toast(`△ ${toCreature ? creature.species.name : SITES.palace.name}`);
        }
      }
    }
  }

  // --- simulate ------------------------------------------------------------------------
  const menuOpen = radial.isOpen || hud.almanacOpen();
  const timeScale = !playing ? 1 : hud.almanacOpen() ? 0 : radial.isOpen ? 0.12 : speed;

  hand.update(realDt, pad, rig, playing && !menuOpen, !mode && !hoverCreature);
  simulate(realDt * timeScale);
  pulses.update(realDt);
  rig.update(realDt, pad, hand.pos, playing && !menuOpen);
  water.update(simTime, sky.env, rig.focus);
  hud.update(realDt);

  // Blueprint ghost follows the Hand.
  if (mode && mode.kind === 'place') mode.ghost = buildings.showGhost(mode.type, hand.pos.x, hand.pos.z, mode.rot);
  else buildings.showGhost(null);

  // World-space icons: rebuilt every frame into one instanced draw call.
  icons.begin();
  buildings.render(simTime);
  society.renderIcons(icons);
  creature.renderIcons(icons);
  if (mode && mode.kind === 'demolish' && hoverBuilding) icons.add(hoverBuilding.x, hoverBuilding.y + hoverBuilding.def.h + 5, hoverBuilding.z, 3.4, '🧱');
  icons.end();

  renderer.render(scene, rig.camera);
  perf.calls = renderer.info.render.calls;
  perf.triangles = renderer.info.render.triangles;

  // --- HUD refresh + dynamic resolution (twice a second) ----------------------------------
  updateHints();
  perfTimer += realDt;
  if (perfTimer > 0.5) {
    perfTimer = 0;
    fps = 1000 / frameMs;
    refreshHud();
    if (playing) watchTheRepublic();
    if (frameMs > 20 && renderScale > 0.6) renderScale = Math.max(0.6, renderScale - 0.1);
    else if (frameMs < 17.2 && renderScale < 1) renderScale = Math.min(1, renderScale + 0.05);
    else return;
    renderer.setPixelRatio(BASE_PIXEL_RATIO * renderScale);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  }
}

hud.setSpeed(1);
hud.showTitle(true);
refreshHud();
window.__game = {
  renderer, scene, rig, hand, entities, buildings, society, creature, sky, input, perf, stats, radial,
  get hoverCreature() { return hoverCreature; },
  SPECIES,
  get mode() { return mode; },
  /** Test hook: run the simulation headlessly for `seconds` of island time. */
  fastForward(seconds, step = 0.05) { for (let t = 0; t < seconds; t += step) simulate(step); refreshHud(); },
};
requestAnimationFrame(frame);
