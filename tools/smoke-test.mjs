// Headless smoke test: boots the game in Chromium with a simulated DualShock 4
// (standard Gamepad API mapping) and drives every Phase 1 control.
//   node tools/serve.mjs 8080 &   then   node tools/smoke-test.mjs [outDir]
// Requires Playwright (npm i -D playwright) — it is not needed to play the game.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.GAME_URL || 'http://localhost:8080/';
const OUT = process.argv[2] || 'smoke-out';
mkdirSync(OUT, { recursive: true });

const B = { cross: 0, circle: 1, square: 2, triangle: 3, l1: 4, r1: 5, l2: 6, r2: 7, options: 9, up: 12, down: 13, left: 14, right: 15 };
const W = 1280, H = 720; // software GL is slow; 720p keeps the run short
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.addInitScript(() => {
  const pad = {
    id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)', index: 0, connected: true,
    mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 18 }, () => ({ pressed: false, touched: false, value: 0 })),
    vibrationActuator: { playEffect: () => { window.__rumbles = (window.__rumbles || 0) + 1; return Promise.resolve('complete'); } },
  };
  window.__pad = pad;
  navigator.getGamepads = () => [pad];
});

const press = (i, on = true) => page.evaluate(([i, on]) => { const b = window.__pad.buttons[i]; b.pressed = on; b.value = on ? 1 : 0; }, [i, on]);
const axes = (lx, ly, rx, ry) => page.evaluate((a) => { window.__pad.axes = a; }, [lx, ly, rx, ry]);
// Headless software GL may only manage ~10 fps, so all timing is counted in rendered
// frames (the game clamps dt to 50 ms/frame), never in wall-clock milliseconds.
const frames = (n) => page.evaluate((n) => new Promise((done) => {
  const tick = () => (n-- <= 0 ? done() : requestAnimationFrame(tick));
  requestAnimationFrame(tick);
}), n);
const wait = (ms) => frames(Math.ceil(ms / 50));
const tap = async (i, n = 3) => { await press(i); await frames(n); await press(i, false); await frames(3); };
const game = (fn) => page.evaluate(fn);
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });

await page.goto(URL);
await page.waitForFunction(() => window.__game && window.__game.perf.calls > 0, null, { timeout: 60000 });
await wait(600);
await shot('01-title');
check('boots without errors', errors.length === 0, errors.join(' | '));

await tap(B.cross);
check('title dismissed by Cross', await game(() => document.getElementById('title').hidden));
await wait(500);
await shot('02-island');

// Left stick moves the hand, camera-relative.
const p0 = await game(() => window.__game.hand.pos.toArray());
await axes(1, 0, 0, 0); await wait(600); await axes(0, 0, 0, 0);
const p1 = await game(() => window.__game.hand.pos.toArray());
const moved = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
check('left stick moves the Hand', moved > 8, `${moved.toFixed(1)} units`);

// L2 precision mode is much slower.
await press(B.l2); await axes(-1, 0, 0, 0); await wait(600); await axes(0, 0, 0, 0); await press(B.l2, false);
const p2 = await game(() => window.__game.hand.pos.toArray());
const slow = Math.hypot(p2[0] - p1[0], p2[2] - p1[2]);
check('L2 precision slows the Hand', slow > 0.5 && slow < moved * 0.5, `${slow.toFixed(1)} units`);

// Right stick orbits and pitches.
const c0 = await game(() => [window.__game.rig.yaw, window.__game.rig.pitch]);
await axes(0, 0, 1, -1); await wait(500); await axes(0, 0, 0, 0);
const c1 = await game(() => [window.__game.rig.yaw, window.__game.rig.pitch]);
check('right stick orbits + pitches camera', Math.abs(c1[0] - c0[0]) > 0.3 && Math.abs(c1[1] - c0[1]) > 0.1);

// L1 wheel: deliver a crate (item 0 is straight up).
await press(B.l1); await wait(250);
check('L1 opens radial wheel', await game(() => window.__game.radial.isOpen));
await axes(0, 0, 0, -1); await wait(150);
await shot('03-wheel-l1');
const crates0 = await game(() => window.__game.entities.count('crate'));
await tap(B.cross); await axes(0, 0, 0, 0); await press(B.l1, false); await wait(200);
check('Cross confirms wheel item (crate delivered)', (await game(() => window.__game.entities.count('crate'))) === crates0 + 1);
check('wheel closes after choice', !(await game(() => window.__game.radial.isOpen)));
await wait(2500); // let it land

// Grab the crate (hold R2), wind up, release => throw.
await game(() => { const g = window.__game, c = g.entities.lists.crate.at(-1); g.hand.teleport(c.pos.x, c.pos.z); });
await wait(200);
check('hovering highlights a grabbable', await game(() => !!window.__game.hand.hover));
await shot('04-hover');
await press(B.r2); await wait(400);
check('R2 hold grabs', await game(() => window.__game.hand.held && window.__game.hand.held.type === 'crate'));
await shot('05-holding');
await axes(0, -1, 0, 0); await wait(450); await press(B.r2, false); await wait(60); await axes(0, 0, 0, 0);
check('release while moving throws', await game(() => !window.__game.hand.held && window.__game.hand.stats.throws === 1));
await wait(300);
await shot('06-thrown');
await wait(2500);
check('throw distance recorded', await game(() => window.__game.hand.stats.longest > 5), `${(await game(() => window.__game.hand.stats.longest)).toFixed(1)} m`);
check('rumble fired', (await game(() => window.__rumbles || 0)) > 0);

// Tap-to-latch on a citizen, Square inspect, Circle to set down.
await game(() => { const g = window.__game, c = g.entities.lists.citizen[0]; g.hand.teleport(c.pos.x, c.pos.z); });
await wait(150);
await tap(B.r2, 2); await wait(300);
check('R2 tap latches', await game(() => window.__game.hand.held && window.__game.hand.held.type === 'citizen'));
await tap(B.square);
check('Square opens inspect card', await game(() => !document.getElementById('inspect').hidden));
await shot('07-inspect-citizen');
await tap(B.circle);
check('Circle closes inspect', await game(() => document.getElementById('inspect').hidden));
await tap(B.circle);
check('Circle sets held object down', await game(() => !window.__game.hand.held));

// R1 wheel -> Move the Sun (sub-wheel) -> Dusk.
await press(B.r1); await wait(200);
await axes(0, 0, 0, -1); await wait(120); await tap(B.cross);      // "Move the Sun" (item 0)
await axes(0, 0, -1, 0); await wait(150);                           // 4 items: left = index 3 (Midnight)
await axes(0, 0, 0, 1); await wait(150);                            // down = index 2 (Dusk)
await shot('08-wheel-sun');
await tap(B.cross); await axes(0, 0, 0, 0); await press(B.r1, false); await wait(400);
const hour = await game(() => window.__game.sky.env.hour);
check('sub-wheel miracle: sun moved to dusk', hour > 17 && hour < 19, `hour ${hour.toFixed(2)}`);
await shot('09-dusk');

// Tremor at the palace.
await tap(B.triangle);
check('Triangle snaps to Palace', await game(() => Math.hypot(window.__game.hand.pos.x - 22, window.__game.hand.pos.z - 47.6) < 1));
await press(B.r1); await wait(200); await axes(0, 0, 1, 0); await wait(150); await tap(B.cross);
await axes(0, 0, 0, 0); await press(B.r1, false); await wait(500);
check('Tremor miracle fired', await game(() => window.__game.stats.miracles === 2));
await shot('10-tremor');
await tap(B.triangle);
check('Triangle toggles to the Nest', await game(() => window.__game.hand.pos.x < -30));
await wait(400);
await shot('11-nest');

// D-pad speed + Almanac.
await tap(B.left);
check('D-pad Left pauses', await game(() => document.getElementById('speed').textContent.includes('PAUSED')));
await tap(B.right);
check('D-pad Right = 2x', await game(() => document.getElementById('speed').textContent.includes('2')));
await tap(B.up);
await tap(B.down);
check('D-pad Down cycles advisor alerts', await game(() => !document.getElementById('advisor').hidden));
await tap(B.options); await wait(700);
check('Options opens Almanac', await game(() => !document.getElementById('almanac').hidden));
await shot('12-almanac');
await tap(B.options);

// Midnight render + budget checks.
await game(() => window.__game.sky.setHour(0)); await wait(300);
await shot('13-midnight');
await game(() => window.__game.sky.setHour(10));
const perf = await game(() => ({ ...window.__game.perf }));
check('draw calls within 150 budget', perf.calls <= 150, `${perf.calls} calls, ${perf.triangles} tris`);
const minFont = await game(() => {
  let min = 1e9;
  for (const el of document.querySelectorAll('#ui *')) {
    if (el.closest('svg') || !el.textContent.trim() || el.children.length) continue;
    min = Math.min(min, parseFloat(getComputedStyle(el).fontSize));
  }
  return min;
});
check('no HUD text below 24px at 1080p', minFont * (1080 / H) >= 24, `smallest ${(minFont * (1080 / H)).toFixed(1)}px @1080p`);
check('no runtime errors', errors.length === 0, errors.join(' | '));

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
