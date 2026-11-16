// Society: the islanders' minds and the national ledger.
//  - Needs (Food, Housing, Healthcare, Liberty, Faith) decay and drive a priority
//    state machine: eat > heal > protest > sleep > pray > work/haul > build > wander.
//  - Pesos come from exports; wages and upkeep are paid at midnight.
//  - Mana comes from prayer (fast in a cathedral, a trickle at the palace shrine).
import { SITES } from './terrain.js';
import { GOODS } from './buildings.js';
import { clamp } from './noise.js';

const WAGE = 9;                // pesos per employed islander per day
const FOOD_DECAY = 1 / 300;    // need units per second
const FAITH_DECAY = 1 / 340;
const HEALTH_DECAY = 1 / 1100;
const WEIGHTS = { food: 0.28, housing: 0.2, health: 0.17, liberty: 0.15, faith: 0.2 };

export function createSociety(entities, buildings, terrain, sky, hooks) {
  const S = {
    pesos: 4500, mana: 40, pantry: 45,
    today: { income: 0, expenses: 0 },
    ledger: [],          // per-day { day, income, expenses }
    history: [],         // sampled { pesos, mana, pop, mood }
    exported: 0, deaths: 0, arrivals: 0,
    avg: { food: 1, housing: 0, health: 1, liberty: 1, faith: 1, mood: 0.6 },
    employed: 0, homeless: 0, protesters: 0,
  };
  const citizens = entities.lists.citizen;
  let lastDay = sky.env.day, jobTimer = 0, sampleTimer = 0, immigrationTimer = 30;
  const rnd = Math.random;

  S.manaCap = () => 100 + 60 * buildings.count('cathedral');
  S.canAfford = (n) => S.pesos >= n;
  S.spend = (n) => { if (S.pesos < n) return false; S.pesos -= n; S.today.expenses += n; return true; };
  S.earn = (n) => { S.pesos += n; S.today.income += n; };
  S.spendMana = (n) => { if (S.mana < n) return false; S.mana -= n; return true; };

  // --- needs -----------------------------------------------------------------------------
  const guards = () => buildings.built((b) => b.def.guard && b.present > 0).length;
  S.liberty = (o) => clamp(0.85 - 0.09 * guards() - o.trauma, 0, 1);
  S.needsOf = (o) => ({
    food: o.needs.food, housing: o.home ? 1 : 0.15, health: o.needs.health, liberty: S.liberty(o), faith: o.needs.faith,
  });
  S.mood = (o) => {
    const n = S.needsOf(o);
    return n.food * WEIGHTS.food + n.housing * WEIGHTS.housing + n.health * WEIGHTS.health + n.liberty * WEIGHTS.liberty + n.faith * WEIGHTS.faith;
  };
  /** The Hand's rough handling is remembered. */
  S.traumatise = (o, amount) => { if (o.type === 'citizen') o.trauma = clamp(o.trauma + amount, 0, 0.8); };

  // --- task helpers ----------------------------------------------------------------------
  function start(o, kind, b, x, z) {
    o.task = { kind, b, t: 0 };
    entities.goTo(o, x, z);
  }
  function release(o) { // leave whatever they were doing, cleanly
    o.atWork = null; o.hidden = false; o.task = null;
  }
  function rest(o, seconds) { release(o); o.state = 'idle'; o.timer = seconds; }

  function quitJob(o) {
    if (!o.job) return;
    const i = o.job.workers.indexOf(o);
    if (i >= 0) o.job.workers.splice(i, 1);
    o.job = null;
  }
  /** `force` is the Hand's prerogative: a full workplace sacks someone to make room. */
  S.assignJob = (o, b, force = false) => {
    if (!b.built || !b.def.workers || o.job === b) return false;
    if (b.workers.length >= b.def.workers) {
      if (!force) return false;
      quitJob(b.workers[0]);
    }
    quitJob(o);
    o.job = b; b.workers.push(o);
    return true;
  };

  const foodSource = (o) => buildings.nearest(o.pos.x, o.pos.z, (b) => b.built && b.def.produces === 'food' && b.out > 0);
  const jobBlocked = (b) => (b.def.produces && b.out >= b.def.cap) || (b.def.consumes && b.inp === 0 && b.out === 0);

  // --- the brain: called by entities.js whenever an islander is idle ---------------------------
  const brain = {
    decide(o) {
      if (o.task) release(o);
      const n = o.needs, hour = sky.env.hour, night = hour >= 21.5 || hour < 5;
      const P = SITES.palace;

      if (o.carry) { // finish the delivery first
        const dest = buildings.destinationFor(o.carry.good, o.pos);
        if (dest) return start(o, 'haul', dest, dest.door.x, dest.door.z);
        o.carry = null;
      }
      if (n.food < 0.4) {
        const farm = foodSource(o);
        if (farm) return start(o, 'eat', farm, farm.door.x, farm.door.z);
        if (S.pantry > 0) return start(o, 'eat', null, P.x + (rnd() - 0.5) * 8, P.z + P.r * 0.55);
      }
      if (n.health < 0.4) {
        const clinic = buildings.nearest(o.pos.x, o.pos.z, (b) => b.built && b.def.heals && b.present > 0);
        if (clinic) return start(o, 'heal', clinic, clinic.door.x, clinic.door.z);
      }
      if (o.mood < 0.33 && rnd() < 0.6) {
        const a = rnd() * Math.PI * 2;
        return start(o, 'protest', null, P.x + Math.cos(a) * P.r * 0.7, P.z + Math.sin(a) * P.r * 0.7);
      }
      if (night) {
        if (o.home) return start(o, 'sleep', o.home, o.home.door.x, o.home.door.z);
        return start(o, 'sleep', null, o.pos.x + (rnd() - 0.5) * 6, o.pos.z + (rnd() - 0.5) * 6);
      }
      if (n.faith < 0.4) {
        const church = buildings.nearest(o.pos.x, o.pos.z, (b) => b.built && b.def.faith);
        if (church) return start(o, 'pray', church, church.door.x, church.door.z);
        return start(o, 'pray', null, P.x + (rnd() - 0.5) * 10, P.z + P.r * 0.6 + rnd() * 3);
      }
      const site = buildings.nearest(o.pos.x, o.pos.z, (b) => !b.built && b.present < 4);
      if (o.job && !(site && jobBlocked(o.job))) return start(o, 'work', o.job, o.job.door.x, o.job.door.z);
      if (site) return start(o, 'build', site, site.door.x, site.door.z);
      entities.wander(o);
    },

    arrive(o) {
      const t = o.task, b = t.b;
      if (b && !b.alive) return rest(o, 0.3);
      switch (t.kind) {
        case 'work': t.t = 9 + rnd() * 5; o.atWork = b; o.hidden = !!b.def.indoor; break;
        case 'build': if (b.built) return rest(o, 0.2); t.t = 7; o.atWork = b; break;
        case 'eat': t.t = 2.5; break;
        case 'heal': t.t = 7; o.hidden = true; break;
        case 'pray': t.t = 10; o.hidden = !!b; break;
        case 'sleep': o.hidden = !!b; t.t = 1e9; break;
        case 'protest': t.t = 26 / (1 + guards()); break;
        case 'haul':
          buildings.deliver(b, o.carry.good, o.carry.n);
          o.carry = null;
          return rest(o, 0.4);
      }
    },

    act(o, dt, time) {
      const t = o.task, b = t.b;
      if (b && !b.alive) return rest(o, 0.3);
      t.t -= dt;
      switch (t.kind) {
        case 'work':
          if (!b.def.indoor) { // tend the rows: amble around the plot
            if (!t.wx || Math.hypot(t.wx - o.pos.x, t.wz - o.pos.z) < 0.6) {
              const pt = buildings.toWorld(b, (rnd() - 0.5) * b.def.w * 0.8, (rnd() - 0.2) * b.def.d * 0.6, {});
              t.wx = pt.x; t.wz = pt.z;
            }
            const dx = t.wx - o.pos.x, dz = t.wz - o.pos.z, d = Math.hypot(dx, dz) || 1;
            o.pos.x += (dx / d) * 1.4 * dt; o.pos.z += (dz / d) * 1.4 * dt;
            o.yaw = Math.atan2(dx, dz);
          }
          if (t.t <= 0) {
            const good = b.def.produces;
            const dest = good && b.out > 0 ? buildings.destinationFor(good, b) : null;
            if (dest) {
              const n = Math.min(3, b.out);
              b.out -= n;
              o.carry = { good, n };
              release(o);
              return start(o, 'haul', dest, dest.door.x, dest.door.z);
            }
            return rest(o, 0.2);
          }
          break;
        case 'build':
          if (b.built || t.t <= 0) return rest(o, 0.2);
          break;
        case 'eat':
          if (t.t <= 0) {
            if (b && b.out > 0) { b.out--; o.needs.food = 1; }
            else if (!b && S.pantry > 0) { S.pantry--; o.needs.food = 1; }
            return rest(o, 0.5);
          }
          break;
        case 'heal':
          if (t.t <= 0) { o.needs.health = 1; return rest(o, 0.5); }
          break;
        case 'pray':
          S.mana = Math.min(S.manaCap(), S.mana + dt * (b ? 0.55 : 0.14));
          o.needs.faith = Math.min(1, o.needs.faith + dt / 9);
          if (t.t <= 0) return rest(o, 0.5);
          break;
        case 'sleep': {
          const hour = sky.env.hour;
          if (hour >= 5 && hour < 21.5) return rest(o, rnd() * 3);
          o.needs.health = Math.min(1, o.needs.health + (o.home ? dt / 400 : 0));
          break;
        }
        case 'protest':
          o.pos.y += Math.abs(Math.sin(time * 6 + o.id)) * 0.35; // placard-waving hop
          if (t.t <= 0) { o.trauma = Math.max(0, o.trauma - 0.12); o.needs.faith = Math.min(1, o.needs.faith + 0.1); return rest(o, 1); }
          break;
      }
    },

    abandon(o) { rest(o, 1 + rnd() * 2); },
  };
  entities.setBrain(brain);

  // --- per-frame simulation ------------------------------------------------------------------
  S.update = (dt) => {
    if (dt <= 0) return;
    for (const b of buildings.list) b.present = 0;
    const sum = { food: 0, housing: 0, health: 0, liberty: 0, faith: 0, mood: 0 };
    let employed = 0, homeless = 0, protesters = 0;

    for (let i = citizens.length - 1; i >= 0; i--) {
      const o = citizens[i];
      const thinking = o.state === 'idle' || o.state === 'walk' || o.state === 'act';
      if (!thinking && (o.task || o.hidden)) release(o);      // grabbed, thrown, napping…
      if (o.atWork && o.atWork.alive && o.state === 'act') o.atWork.present++;

      const n = o.needs;
      const asleep = o.task && o.task.kind === 'sleep' ? 0.4 : 1;
      n.food = Math.max(0, n.food - dt * FOOD_DECAY * asleep);
      n.faith = Math.max(0, n.faith - dt * FAITH_DECAY);
      n.health = Math.max(0, n.health - dt * (HEALTH_DECAY + (n.food <= 0 ? 1 / 70 : 0)));
      o.trauma = Math.max(0, o.trauma - dt / 500);
      if (n.health <= 0 && thinking) {
        quitJob(o);
        if (o.home) { o.home.residents.splice(o.home.residents.indexOf(o), 1); o.home = null; }
        S.deaths++;
        hooks.onDeath(o);
        entities.remove(o);
        continue;
      }
      const needs = S.needsOf(o);
      o.mood = S.mood(o);
      for (const k in needs) sum[k] += needs[k];
      sum.mood += o.mood;
      if (o.job) employed++;
      if (!o.home) homeless++;
      if (o.task && o.task.kind === 'protest' && o.state === 'act') protesters++;
    }
    const pop = citizens.length || 1;
    for (const k in sum) S.avg[k] = sum[k] / pop;
    S.employed = employed; S.homeless = homeless; S.protesters = protesters;

    // Housing and job offices, twice a second.
    jobTimer -= dt;
    if (jobTimer <= 0) {
      jobTimer = 0.5;
      for (const o of citizens) {
        if (!o.home) {
          const home = buildings.nearest(o.pos.x, o.pos.z, (b) => b.built && b.def.housing && b.residents.length < b.def.housing);
          if (home) { o.home = home; home.residents.push(o); }
        }
        if (!o.job) {
          const job = buildings.nearest(o.pos.x, o.pos.z, (b) => b.built && b.def.workers && b.workers.length < b.def.workers);
          if (job) S.assignJob(o, job);
        }
      }
    }

    // Immigration: free beds and a contented island attract newcomers by boat.
    immigrationTimer -= dt;
    if (immigrationTimer <= 0) {
      immigrationTimer = 40;
      const dock = buildings.list.find((b) => b.built && b.def.coastal);
      const beds = buildings.built((b) => b.def.housing).reduce((a, b) => a + b.def.housing - b.residents.length, 0);
      if (dock && beds > 0 && S.avg.mood > 0.5 && citizens.length < 110) {
        const o = entities.spawn('citizen', dock.door.x, terrain.heightAt(dock.door.x, dock.door.z), dock.door.z);
        if (o) { o.state = 'idle'; o.timer = 0.5; S.arrivals++; hooks.onImmigrant(o); }
      }
    }

    // Midnight: payroll and upkeep.
    if (sky.env.day !== lastDay) {
      lastDay = sky.env.day;
      const wages = S.employed * WAGE;
      const upkeep = buildings.built(() => true).reduce((a, b) => a + b.def.upkeep, 0);
      S.pesos -= wages + upkeep;
      S.today.expenses += wages + upkeep;
      S.ledger.push({ day: lastDay - 1, ...S.today });
      if (S.ledger.length > 7) S.ledger.shift();
      hooks.onPayday(lastDay - 1, S.today, wages, upkeep);
      S.today = { income: 0, expenses: 0 };
    }

    sampleTimer -= dt;
    if (sampleTimer <= 0) {
      sampleTimer = 15;
      S.history.push({ pesos: S.pesos, mana: S.mana, pop: citizens.length, mood: S.avg.mood });
      if (S.history.length > 80) S.history.shift();
    }
  };

  /** Floating thought-bubbles over islanders with something on their mind. */
  S.renderIcons = (icons) => {
    for (const o of citizens) {
      if (o.hidden) continue;
      let icon = null;
      const kind = o.task && o.state === 'act' ? o.task.kind : null;
      if (kind === 'protest') icon = '✊';
      else if (kind === 'pray') icon = '🙏';
      else if (kind === 'sleep' || o.state === 'siesta') icon = '💤';
      else if (o.needs.health < 0.3) icon = '🤒';
      else if (o.needs.food < 0.2) icon = '🍌';
      else if (o.carry) icon = '📦';
      if (icon) icons.add(o.pos.x, o.pos.y + 3.4, o.pos.z, 1.7, icon);
    }
  };

  S.describe = (o) => {
    const k = o.task ? o.task.kind : null;
    const where = o.task && o.task.b ? o.task.b.def.label : '';
    if (o.state === 'walk') return { work: `Off to work`, haul: `Hauling ${o.carry ? GOODS[o.carry.good].label.toLowerCase() : 'goods'}`, eat: 'Looking for food', pray: 'Going to pray', sleep: 'Heading to bed', heal: 'Going to the clinic', protest: 'Marching on the palace', build: 'Off to the building site' }[k] || 'Out for a stroll';
    if (o.state === 'act') return { work: `Working · ${where}`, build: `Building · ${where}`, eat: 'Eating', pray: 'Praying', sleep: 'Asleep', heal: 'Being treated', protest: 'Protesting!' }[k] || 'Loitering';
    return { idle: 'Thinking', siesta: 'Napping by decree', swim: 'Swimming for it', dazed: 'Seeing stars', held: 'Dangling', air: 'Airborne' }[o.state] || '';
  };

  return S;
}
