// Android TV controller test, in headless Chromium.
// A fake window.AndroidPad speaks GamepadBridge.java's raw protocol (held Android key codes plus
// joystick axes) while the W3C Gamepad API lists a dead controller, exactly like the TV did.
// Each run presses *physical* DualShock 4 buttons and sticks and translates them through one of the
// ways Android may lay the controller out, then checks the game understood them.
//   node tools/serve.mjs 8080 &   then   node tools/android-bridge-test.mjs
import { chromium } from 'playwright';

const URL = process.env.GAME_URL || 'http://localhost:8080/';
let failures = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) failures++; };

const KC = { DPAD_UP: 19, DPAD_DOWN: 20, DPAD_LEFT: 21, DPAD_RIGHT: 22, A: 96, B: 97, C: 98, X: 99, Y: 100, Z: 101,
  L1: 102, R1: 103, L2: 104, R2: 105, THUMBL: 106, THUMBR: 107, START: 108, SELECT: 109, MODE: 110 };
const AX = { X: 0, Y: 1, Z: 11, RX: 12, RY: 13, RZ: 14, HAT_X: 15, HAT_Y: 16, LTRIGGER: 17, RTRIGGER: 18,
  THROTTLE: 19, RUDDER: 20, WHEEL: 21, GENERIC_1: 32 };
const range = (axis, min, max) => ({ axis, name: String(axis), min, max, flat: 0 });
const centred = (...axes) => axes.map((a) => range(a, -1, 1));
const DS4 = { id: 7, name: 'Wireless Controller', vendor: 0x054c, product: 0x09cc, sources: 16786961, android: 30 };

// How a physical DualShock 4 reaches the app under each Android layout.
const SETUPS = {
  standard: {
    expect: 'standard Android layout',
    device: { ...DS4, axes: [...centred(AX.X, AX.Y, AX.Z, AX.RZ, AX.HAT_X, AX.HAT_Y), range(AX.LTRIGGER, 0, 1), range(AX.RTRIGGER, 0, 1)],
      keys: [KC.A, KC.B, KC.X, KC.Y, KC.L1, KC.R1, KC.L2, KC.R2, KC.THUMBL, KC.THUMBR, KC.START, KC.SELECT, KC.MODE] },
    keys: { cross: KC.A, circle: KC.B, square: KC.X, triangle: KC.Y, l1: KC.L1, r1: KC.R1, l2: KC.L2, r2: KC.R2, share: KC.SELECT, options: KC.START },
    sticks: { lx: [AX.X, 1], ly: [AX.Y, 1], rx: [AX.Z, 1], ry: [AX.RZ, 1] },
    triggers: { l2: [AX.LTRIGGER, 0, 1], r2: [AX.RTRIGGER, 0, 1] },
    dpad: 'hat',
  },
  ds4generic: {
    expect: 'generic layout',
    device: { ...DS4, axes: centred(AX.X, AX.Y, AX.Z, AX.RX, AX.RY, AX.RZ, AX.HAT_X, AX.HAT_Y),
      keys: [KC.A, KC.B, KC.C, KC.X, KC.Y, KC.Z, KC.L1, KC.R1, KC.L2, KC.R2, KC.SELECT, KC.START, KC.MODE, KC.THUMBL] },
    keys: { square: KC.A, cross: KC.B, circle: KC.C, triangle: KC.X, l1: KC.Y, r1: KC.Z, l2: KC.L1, r2: KC.R1, share: KC.L2, options: KC.R2 },
    sticks: { lx: [AX.X, 1], ly: [AX.Y, 1], rx: [AX.Z, 1], ry: [AX.RZ, 1] },
    triggers: { l2: [AX.RX, -1, 1], r2: [AX.RY, -1, 1] },
    dpad: 'hat',
  },
  ds4genericNew: {
    expect: 'new driver',
    device: { ...DS4, axes: centred(AX.X, AX.Y, AX.Z, AX.RX, AX.RY, AX.RZ, AX.HAT_X, AX.HAT_Y),
      keys: [KC.A, KC.B, KC.X, KC.Y, KC.L1, KC.R1, KC.L2, KC.R2, KC.SELECT, KC.START, KC.MODE, KC.THUMBL, KC.THUMBR] },
    keys: { cross: KC.A, circle: KC.B, square: KC.Y, triangle: KC.X, l1: KC.L1, r1: KC.R1, l2: KC.L2, r2: KC.R2, share: KC.SELECT, options: KC.START },
    sticks: { lx: [AX.X, 1], ly: [AX.Y, 1], rx: [AX.RX, 1], ry: [AX.RY, 1] },
    triggers: { l2: [AX.Z, -1, 1], r2: [AX.RZ, -1, 1] },
    dpad: 'hat',
  },
  // Not recognisable as a DualShock 4: right stick on RX/RY, triggers resting at -1 on Z/RZ.
  // The game first guesses Z/RZ for the right stick, then notices they sit pinned and swaps.
  unknown: {
    expect: 'sticks auto-fixed',
    device: { id: 9, name: 'USB Gamepad', vendor: 0x0079, product: 0x0011, sources: 16786961, android: 30,
      axes: centred(AX.X, AX.Y, AX.Z, AX.RX, AX.RY, AX.RZ, AX.HAT_X, AX.HAT_Y),
      keys: [KC.A, KC.B, KC.X, KC.Y, KC.L1, KC.R1, KC.L2, KC.R2, KC.SELECT, KC.START] },
    keys: { cross: KC.A, circle: KC.B, square: KC.X, triangle: KC.Y, l1: KC.L1, r1: KC.R1, l2: KC.L2, r2: KC.R2, share: KC.SELECT, options: KC.START },
    sticks: { lx: [AX.X, 1], ly: [AX.Y, 1], rx: [AX.RX, 1], ry: [AX.RY, 1] },
    triggers: { l2: [AX.Z, -1, 1], r2: [AX.RZ, -1, 1] },
    dpad: 'hat',
  },
  // Nothing about this one is guessable: buttons on BUTTON_1.., an inverted Y axis, the right stick
  // on RUDDER/WHEEL, triggers on THROTTLE and GENERIC_1, D-pad as keys. Only the set-up can map it.
  mystery: {
    expect: 'your controller set-up',
    device: { id: 11, name: 'Mystery Pad', vendor: 0x1234, product: 0x5678, sources: 16786961, android: 30,
      axes: [...centred(AX.X, AX.Y, AX.RUDDER, AX.WHEEL, AX.GENERIC_1), range(AX.THROTTLE, 0, 1)],
      keys: [188, 189, 190, 191, 192, 193, 194, 195, 196, 197, KC.DPAD_UP, KC.DPAD_DOWN, KC.DPAD_LEFT, KC.DPAD_RIGHT] },
    keys: { square: 188, cross: 189, circle: 190, triangle: 191, l1: 192, r1: 193, l2: 194, r2: 195, share: 196, options: 197 },
    sticks: { lx: [AX.X, 1], ly: [AX.Y, -1], rx: [AX.RUDDER, 1], ry: [AX.WHEEL, 1] },
    triggers: { l2: [AX.THROTTLE, 0, 1], r2: [AX.GENERIC_1, -1, 1] },
    dpad: 'keys',
  },
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function run(name) {
  const setup = SETUPS[name];
  console.log(`\n--- ${name} ---`);
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.addInitScript((cfg) => {
    // A dead DS4 in the Gamepad API: listed, never changes (what the TV's WebView did).
    const dead = { id: 'Wireless Controller (Vendor: 054c Product: 09cc)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
      axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    navigator.getGamepads = () => [dead];
    const C = cfg.setup;
    const down = new Set(), axes = new Map();
    let keyEvents = 0, motionEvents = 0, last = -1;
    const ranges = new Map(C.device.axes.map((r) => [r.axis, r]));
    for (const a of [0, 1, 11, 12, 13, 14, 15, 16, 17, 18, 22, 23]) axes.set(a, 0); // always reported, like GamepadBridge
    for (const r of C.device.axes) axes.set(r.axis, 0);
    for (const t of Object.values(C.triggers)) axes.set(t[0], t[1]);              // triggers rest at the bottom
    const r0 = (a) => ranges.get(a) || { min: -1, max: 1 };
    window.__phys = {
      button(b, on) {
        if (['up', 'down', 'left', 'right'].includes(b)) {
          if (C.dpad === 'hat') {
            const hx = b === 'left' ? -1 : b === 'right' ? 1 : 0, hy = b === 'up' ? -1 : b === 'down' ? 1 : 0;
            if (hx) axes.set(15, on ? hx : 0);
            if (hy) axes.set(16, on ? hy : 0);
            motionEvents++;
            return;
          }
          b = { up: 19, down: 20, left: 21, right: 22 }[b];
        } else if (C.triggers[b]) {
          const [a, rest, full] = C.triggers[b];
          axes.set(a, on ? full : rest);
          motionEvents++;
        }
        const code = typeof b === 'number' ? b : C.keys[b];
        if (code === undefined) return;
        if (on) { if (!down.has(code)) last = code; down.add(code); } else down.delete(code);
        keyEvents++;
      },
      stick(s, v) { // physical deflection -1..1 (right / down positive)
        const [a, sign] = C.sticks[s], r = r0(a);
        axes.set(a, (r.min + r.max) / 2 + sign * v * (r.max - r.min) / 2);
        motionEvents++;
      },
    };
    window.AndroidPad = {
      state: () => `${[...down].join(',')}|${[...axes].map(([a, v]) => `${a}:${Math.round(v * 1000)}`).join(',')}|`
        + `${keyEvents},${motionEvents},0|${last},16777232,0|${C.device.id},1,1|KEY_${last}`,
      device: () => JSON.stringify(C.device),
      rumble: () => { window.__rumbles = (window.__rumbles || 0) + 1; },
    };
  }, { setup });

  const frames = (n) => page.evaluate((n) => new Promise((done) => { const t = () => (n-- <= 0 ? done() : requestAnimationFrame(t)); requestAnimationFrame(t); }), n);
  const button = (b, on = true) => page.evaluate(([b, on]) => window.__phys.button(b, on), [b, on]);
  const stick = (s, v) => page.evaluate(([s, v]) => window.__phys.stick(s, v), [s, v]);
  const tap = async (b) => { await button(b); await frames(3); await button(b, false); await frames(3); };
  const game = (fn, arg) => page.evaluate(fn, arg);
  const diag = () => game(() => window.__game.input.state.diag);

  await page.goto(URL);
  await page.waitForFunction(() => window.__game && window.__game.perf.calls > 0, null, { timeout: 60000 });
  await frames(4);

  if (name === 'mystery') {
    check('unknown controller: falls back to the standard guess', (await diag()).layout.includes('standard'));
    check('title offers the controller set-up', (await game(() => document.getElementById('title-status').textContent)).includes('Hold any button'));
    // Hold the physical Cross for 3+ seconds to start the set-up.
    await button('cross');
    await page.waitForTimeout(3300);
    await frames(3);
    check('holding a button for 3 s starts the set-up', await game(() => window.__game.input.wizard.active));
    await button('cross', false);
    await page.waitForTimeout(800); await frames(3);
    check('title stays up while setting up', await game(() => !document.getElementById('title').hidden));
    await page.screenshot({ path: `${process.env.OUT || '.'}/bridge-${name}-setup.png` });
    const step = async (fn, undo) => { await fn(); await page.waitForTimeout(250); await frames(2); await undo(); await page.waitForTimeout(250); await frames(2); };
    for (const s of ['lx', 'ly', 'rx', 'ry']) await step(() => stick(s, 1), () => stick(s, 0));
    for (const b of ['cross', 'circle', 'square', 'triangle', 'l1', 'r1']) await step(() => button(b), () => button(b, false));
    for (const b of ['l2', 'r2']) await step(async () => { await button(b); await page.waitForTimeout(450); await frames(2); }, () => button(b, false));
    for (const b of ['share', 'options']) await step(() => button(b), () => button(b, false));
    await frames(3);
    const w = await game(() => ({ active: window.__game.input.wizard.active, message: window.__game.input.wizard.message }));
    check('set-up completes all 14 steps', !w.active && w.message.includes('set up'), JSON.stringify(w));
    check('set-up is saved for this controller', await game(() => Object.keys(localStorage).some((k) => k.startsWith('edp.pad.') && k.includes('Mystery Pad'))));
    check('panel shows the saved set-up', (await diag()).layout === 'your controller set-up');
    check('releasing the last button did not start the game by itself', await game(() => !document.getElementById('title').hidden));
  } else {
    if (name === 'unknown') { // the pinned-trigger check needs 1.5 s of polling; headless frames are slow
      await page.waitForFunction(() => window.__game.input.state.diag.layout.includes('auto-fixed'), null, { timeout: 15000 }).catch(() => {});
    }
    check(`layout recognised (${setup.expect})`, (await diag()).layout.includes(setup.expect), (await diag()).layout);
  }
  if (name === 'standard') await page.screenshot({ path: `${process.env.OUT || '.'}/bridge-${name}-title.png` });

  await tap('cross');
  check('✕ starts the game', await game(() => document.getElementById('title').hidden && !document.getElementById('choose').hidden));
  await tap('right');
  check('D-pad right moves the Mascota choice', await game(() => document.querySelectorAll('.pick')[1].classList.contains('selected')));
  await tap('left');
  await tap('cross');
  check('✕ hatches the Creature', await game(() => window.__game.creature.alive));

  const p0 = await game(() => window.__game.hand.pos.toArray());
  await stick('lx', 1); await frames(12); await stick('lx', 0); await frames(2);
  const p1 = await game(() => window.__game.hand.pos.toArray());
  check('left stick moves the Hand', Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) > 3, `${Math.hypot(p1[0] - p0[0], p1[2] - p0[2]).toFixed(1)} units`);
  await stick('ly', 1); await frames(4);
  check('left stick down reads as down', (await game(() => window.__game.input.state.ly)) > 0.5);
  await stick('ly', 0); await frames(2);

  const yaw0 = await game(() => window.__game.rig.yaw), pitch0 = await game(() => window.__game.rig.pitch);
  await stick('rx', 1); await frames(10); await stick('rx', 0); await frames(2);
  check('right stick turns the camera', Math.abs((await game(() => window.__game.rig.yaw)) - yaw0) > 0.2);
  check('camera does not drift on its own', Math.abs((await game(() => window.__game.rig.pitch)) - pitch0) < 0.05);

  await button('l2'); await frames(3);
  check('L2 reads as fully squeezed', (await game(() => window.__game.input.state.l2)) > 0.9);
  await button('l2', false); await frames(3);
  check('L2 at rest reads as released', (await game(() => window.__game.input.state.l2)) < 0.1);

  const wrong = [];
  for (const b of ['cross', 'circle', 'square', 'triangle', 'l1', 'r1', 'share', 'options']) {
    await button(b); await frames(2);
    const ok = await game((b) => window.__game.input.state.down[b], b);
    await button(b, false); await frames(2);
    if (!ok) wrong.push(b);
    await game(() => window.__game.radial.close());
  }
  check('every face and shoulder button maps to itself', wrong.length === 0, wrong.length ? `wrong: ${wrong.join(', ')}` : '');

  if (name === 'mystery') {
    await page.reload();
    await page.waitForFunction(() => window.__game && window.__game.perf.calls > 0, null, { timeout: 60000 });
    await frames(4);
    check('saved set-up is used after a restart', (await diag()).layout === 'your controller set-up');
  }
  check('no runtime errors', errors.length === 0, errors.join(' | '));
  await context.close();
}

for (const name of Object.keys(SETUPS)) await run(name);
await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
