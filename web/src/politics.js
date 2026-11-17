// Politics: the four factions, guerrillas, elections, plague, and how the game ends.
//
//  - Every islander belongs to a faction. A faction's approval is computed from the
//    state of the island plus a decaying modifier that edicts and deeds push around.
//  - A faction left below 25% starts losing members to the guerrillas, who gather at
//    a jungle camp and raid the palace once there are enough of them.
//  - Every fourth midnight there is an election (unless rigged, or suspended by martial law).
//  - You win by completing the Golden Ziggurat-Casino. You lose an election, lose the
//    palace to a raid, or lose the people's faith.
import * as THREE from './three.js';
import { paint, place, merge, vertexLit } from './geo.js';
import { SITES } from './terrain.js';
import { clamp } from './noise.js';

export const FACTIONS = {
  campesinos: { icon: '🌾', label: 'Campesinos', wants: 'food, homes and jobs' },
  industrialists: { icon: '🏭', label: 'Industrialists', wants: 'factories, exports and a full treasury' },
  devout: { icon: '⛪', label: 'The Devout', wants: 'cathedrals, faith and a spiritual ruler' },
  junta: { icon: '🪖', label: 'The Junta', wants: 'outposts, order and a firm hand' },
};
const KEYS = Object.keys(FACTIONS);
const ELECTION_EVERY = 4;      // days
const REBEL_THRESHOLD = 0.25;
const RAID_SIZE = 5;

export function createPolitics(scene, ctx) {
  const { entities, buildings, society, morality, terrain, scenery, sky, fx } = ctx;
  const citizens = entities.lists.citizen;
  const rnd = Math.random;
  const P = SITES.palace;

  const Pol = {
    approval: {}, mod: {}, grudge: {},
    martialLaw: false, rigged: false,
    palaceHp: 100, raid: false, rebels: 0, lurking: 0,
    election: null,            // last result { day, share, won, rigged }
    over: null,                // { won, title, text } once the game has ended
    plague: 0,                 // currently infected
    FACTIONS, KEYS,
  };
  for (const k of KEYS) { Pol.approval[k] = 0.5; Pol.mod[k] = 0; Pol.grudge[k] = 0; }
  let recruitTimer = 20, arrestTimer = 0, raidTimer = 0, faithless = 0, plagueTimer = 1500 + rnd() * 500, assignCursor = 0;

  // --- the guerrilla camp: a clearing in the jungle, far from the palace ------------------------
  const camp = { x: -8, z: -70 };
  search: for (let r = 70; r < 120; r += 6) for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2, x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r;
    const h = terrain.heightAt(x, z);
    if (h > 7 && h < 20 && Math.hypot(x - SITES.nest.x, z - SITES.nest.z) > 40) { camp.x = x; camp.z = z; break search; }
  }
  camp.y = terrain.heightAt(camp.x, camp.z);
  const campMesh = new THREE.Mesh(merge([
    place(paint(new THREE.ConeGeometry(2.6, 3, 4), 0x5f6b3a, 0.7), -3, 1.5, 0, 0, 0.6, 0),
    place(paint(new THREE.ConeGeometry(2.2, 2.6, 4), 0x6b5a3a, 0.7), 3, 1.3, 1.5, 0, 0.2, 0),
    place(paint(new THREE.ConeGeometry(2.4, 2.8, 4), 0x4a5a2f, 0.7), 0.5, 1.4, -3.5, 0, 1.0, 0),
    place(paint(new THREE.CylinderGeometry(0.1, 0.1, 6, 4), 0x3a2a1a), 0, 3, 1),
    place(paint(new THREE.BoxGeometry(2.2, 1.3, 0.08), 0x9a1414), 1.1, 5.2, 1),
    place(paint(new THREE.IcosahedronGeometry(0.7, 0), 0xff7a2a), 0, 0.4, 3.2),
  ]), vertexLit);
  campMesh.name = 'rebel-camp';
  campMesh.position.set(camp.x, camp.y, camp.z);
  campMesh.visible = false;
  scene.add(campMesh);
  Pol.camp = camp;

  /** Push a faction's approval modifier (it decays back toward zero over a few minutes). */
  Pol.bump = (faction, amount) => { Pol.mod[faction] = clamp(Pol.mod[faction] + amount, -0.6, 0.6); };

  // --- rebels ----------------------------------------------------------------------------------
  Pol.radicalise = (o) => {
    if (o.rebel) return;
    o.rebel = true;
    society.quitJob(o);
    entities.recolor(o, 0x7a1414);
    o.state = 'idle'; o.timer = 0.5;
  };
  Pol.reform = (o) => {
    if (!o.rebel) return false;
    o.rebel = false;
    o.trauma = Math.max(0, o.trauma - 0.3);
    o.needs.faith = 1;
    entities.recolor(o, 0xffffff);
    return true;
  };

  // Rebels ignore the normal daily routine (except eating): they lurk at camp or raid.
  society.override = (o, start) => {
    if (!o.rebel || o.needs.food < 0.35) return false;
    if (Pol.raid) {
      const a = rnd() * Math.PI * 2;
      start(o, 'raid', null, P.x + Math.cos(a) * P.r * 0.6, P.z + Math.sin(a) * P.r * 0.6);
    } else {
      start(o, 'lurk', null, camp.x + (rnd() - 0.5) * 10, camp.z + (rnd() - 0.5) * 10);
    }
    return true;
  };
  society.factionBonus = (o) => (o.faction ? (Pol.approval[o.faction] - 0.5) * 0.25 : 0);

  // --- approval --------------------------------------------------------------------------------
  function recompute() {
    const a = society.avg, pop = citizens.length || 1;
    const industry = buildings.built((b) => b.def.consumes || b.def.coastal).length;
    const cathedrals = buildings.count('cathedral'), outposts = buildings.count('outpost');
    const base = {
      campesinos: 0.22 + 0.3 * a.food + 0.25 * a.housing + 0.2 * (society.employed / pop),
      industrialists: 0.3 + 0.1 * Math.min(4, industry) + (society.pesos > 3000 ? 0.12 : society.pesos < 0 ? -0.18 : 0) + 0.12 * Math.min(1, society.exported / 6000),
      devout: 0.22 + 0.35 * a.faith + 0.14 * Math.min(2, cathedrals) + 0.2 * morality.spirit,
      junta: 0.42 + 0.14 * Math.min(2, outposts) + (Pol.martialLaw ? 0.25 : 0) - 0.15 * morality.benevolence - 0.08 * Math.min(3, society.protesters),
    };
    for (const k of KEYS) Pol.approval[k] = clamp(base[k] + Pol.mod[k], 0, 1);
  }

  // --- elections -------------------------------------------------------------------------------
  Pol.daysToElection = () => ELECTION_EVERY - ((sky.env.day - 1) % ELECTION_EVERY);

  /** Called at midnight with the number of the day that just ended. */
  Pol.endOfDay = (day) => {
    if (Pol.over) return;
    if (day % ELECTION_EVERY !== 0) {
      if ((day + 1) % ELECTION_EVERY === 0 && !Pol.martialLaw) fx.say('penultimo', 'Election tomorrow at midnight, Presidente. I could arrange the result for a modest $1,200 (L1 → Edicts).');
      return;
    }
    if (Pol.martialLaw) {
      Pol.bump('campesinos', -0.15); Pol.bump('devout', -0.1); morality.shift(-0.08, 0, 'Suspended an election');
      fx.toast('🗳️ Election suspended under martial law');
      return;
    }
    let yes = 0;
    for (const o of citizens) if (!o.rebel) yes += clamp(0.5 + (o.mood - 0.5) * 1.7, 0.02, 0.98);
    let share = yes / (citizens.length || 1);
    const rigged = Pol.rigged;
    if (rigged) { share = 0.9 + rnd() * 0.09; Pol.rigged = false; }
    Pol.election = { day, share, won: share >= 0.5, rigged };
    if (share >= 0.5) {
      fx.toast(`🗳️ Election won with ${Math.round(share * 100)}% of the vote`);
      fx.say('penultimo', rigged
        ? `${Math.round(share * 100)}%! A triumph of democracy. Some of the dead voted twice — such devotion.`
        : `Re-elected with ${Math.round(share * 100)}%, Presidente, and honestly too. How quaint.`);
    } else {
      end(false, 'Voted Out', `Only ${Math.round(share * 100)}% voted for you on day ${day}. The new president has turned your palace into a museum of your mistakes.`);
    }
  };

  function end(won, title, text) {
    if (Pol.over) return;
    Pol.over = { won, title, text };
    fx.ended(Pol.over);
  }
  Pol.win = () => end(true, 'The Golden Ziggurat-Casino Stands',
    'San Milagro is sovereign, solvent and suspiciously devout. Tourists pour in to lose their savings at your altar. You may keep ruling.');

  // --- per-frame -------------------------------------------------------------------------------
  Pol.update = (dt) => {
    if (dt <= 0 || Pol.over) return;
    recompute();

    let rebels = 0, lurking = 0, raiding = 0, sick = 0;
    for (const o of citizens) {
      if (!o.faction) o.faction = KEYS[assignCursor++ % KEYS.length];
      if (o.plague) sick++;
      if (!o.rebel) continue;
      rebels++;
      if (o.task && o.state === 'act') { if (o.task.kind === 'lurk') lurking++; else if (o.task.kind === 'raid') raiding++; }
    }
    Pol.rebels = rebels; Pol.lurking = lurking; Pol.plague = sick;
    campMesh.visible = rebels > 0;

    for (const k of KEYS) {
      Pol.mod[k] -= Math.sign(Pol.mod[k]) * Math.min(Math.abs(Pol.mod[k]), dt / 260);
      Pol.grudge[k] = Pol.approval[k] < REBEL_THRESHOLD ? Pol.grudge[k] + dt : 0;
    }

    // Recruitment: an ignored faction bleeds members into the jungle.
    recruitTimer -= dt;
    if (recruitTimer <= 0) {
      recruitTimer = 14;
      if (!Pol.martialLaw) for (const k of KEYS) {
        if (Pol.grudge[k] < 30) continue;
        const pool = citizens.filter((o) => o.faction === k && !o.rebel && !o.hidden && (o.state === 'walk' || o.state === 'idle' || o.state === 'act'));
        if (!pool.length) continue;
        const o = pool[Math.floor(rnd() * pool.length)];
        Pol.radicalise(o);
        fx.toast(`🚩 ${o.name} has joined the guerrillas`);
        fx.warn('rebels', 'penultimo', `${FACTIONS[k].label} are taking to the jungle! They want ${FACTIONS[k].wants}. Pluck the rebels out, drop them on a cathedral to re-educate them — or use the sea.`);
      }
    }

    // Raids.
    if (!Pol.raid && lurking >= RAID_SIZE) {
      Pol.raid = true; raidTimer = 75;
      for (const o of citizens) if (o.rebel && (o.state === 'act' || o.state === 'walk')) { o.task = null; o.state = 'idle'; o.timer = rnd(); }
      fx.toast('🚩 Guerrillas are marching on the palace!');
      fx.say('penultimo', 'REBELS at the gates, Presidente! Throw them, smite them, set the mascot on them — anything!');
      fx.rumble(1, 1, 500);
    }
    if (Pol.raid) {
      raidTimer -= dt;
      Pol.palaceHp = Math.max(0, Pol.palaceHp - society.raidDamage * 0.75);
      const guards = buildings.built((b) => b.def.guard && b.present > 0).length;
      arrestTimer -= dt * guards;
      if (guards && arrestTimer <= 0) {
        arrestTimer = 9;
        const o = citizens.find((c) => c.rebel && c.task && c.task.kind === 'raid');
        if (o) { Pol.reform(o); society.traumatise(o, 0.3); fx.toast(`🪖 Guards arrested ${o.name}`); }
      }
      if (rebels === 0 || raidTimer <= 0) {
        Pol.raid = false;
        for (const o of citizens) if (o.rebel) { o.task = null; if (o.state === 'act' || o.state === 'walk') { o.state = 'idle'; o.timer = rnd(); } }
        fx.toast(rebels === 0 ? '🚩 The rebellion is crushed' : '🚩 The guerrillas melt back into the jungle');
      }
      if (Pol.palaceHp <= 0) end(false, 'The Palace Has Fallen', 'Guerrillas storm the marble halls. Your portrait is replaced by a goat. The goat is, by all accounts, a better listener.');
    } else {
      Pol.palaceHp = Math.min(100, Pol.palaceHp + dt * 0.25);
    }
    society.raidDamage = 0;

    // Faith: a god nobody believes in becomes a roadside attraction.
    if (society.avg.faith < 0.16) {
      faithless += dt;
      fx.warn('faithless', 'xochitl', 'They are forgetting you, Great One! Faith is nearly gone. Bless them, preach, build a cathedral — quickly!', 60);
      if (faithless > 100) end(false, 'Forgotten', 'Nobody believes in you any more. You fade into a minor tourist attraction: “Giant Hand (non-functional). Gift shop this way.”');
    } else faithless = Math.max(0, faithless - dt * 2);

    // Plague: an occasional outbreak that only a clinic or the Heal miracle will stop.
    plagueTimer -= dt;
    if (plagueTimer <= 0) {
      plagueTimer = 1100 + rnd() * 700;
      if (citizens.length >= 12) Pol.outbreak(4 + Math.floor(rnd() * 3));
    }
  };

  Pol.outbreak = (n) => {
    const pool = citizens.filter((o) => !o.plague && !o.rebel);
    for (let i = 0; i < n && pool.length; i++) {
      const o = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      o.plague = true;
      o.needs.health = Math.min(o.needs.health, 0.5);
    }
    fx.toast('🤒 Plague has broken out!');
    fx.say('xochitl', 'A plague, Great One! The sick will die without a clinic — or your Heal miracle (R1).');
  };

  Pol.renderIcons = (icons) => {
    if (Pol.raid || Pol.palaceHp < 99) icons.bar(P.x, P.level + 17, P.z, 9, Pol.palaceHp / 100);
    if (Pol.rebels) icons.add(camp.x, camp.y + 8, camp.z, 3.2, '🚩');
  };

  return Pol;
}
