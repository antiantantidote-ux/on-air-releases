// Reproduces the Android TV failure and checks the fix, in headless Chromium:
// the Gamepad API lists a DualShock 4 that never reports a press (what the TV's WebView did),
// while a fake window.AndroidPad stands in for GamepadBridge.java.
//   node tools/serve.mjs 8080 &   then   node tools/android-bridge-test.mjs
import { chromium } from 'playwright';

const URL = process.env.GAME_URL || 'http://localhost:8080/';
let failures = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) failures++; };

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.addInitScript(() => {
  // A dead DS4 in the Gamepad API: listed, but nothing ever changes.
  const dead = {
    id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
    axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
  };
  navigator.getGamepads = () => [dead];
  // The native bridge, same string format as GamepadBridge.state().
  const S = { bits: Array(18).fill('0'), axes: [0, 0, 0, 0, 0, 0], events: 0, last: '' };
  window.__native = S;
  window.__rumbles = 0;
  window.AndroidPad = {
    state: () => `${S.bits.join('')}|${S.axes.join(',')}|1|${S.events}|${S.last}|Wireless Controller`,
    rumble: () => { window.__rumbles++; },
  };
});

const frames = (n) => page.evaluate((n) => new Promise((done) => { const t = () => (n-- <= 0 ? done() : requestAnimationFrame(t)); requestAnimationFrame(t); }), n);
const IDX = { cross: 0, circle: 1, square: 2, triangle: 3, l1: 4, r1: 5, l2: 6, r2: 7, options: 9, up: 12, down: 13, left: 14, right: 15 };
const press = (b, on = true) => page.evaluate(([i, on, name]) => { const S = window.__native; S.bits[i] = on ? '1' : '0'; S.events++; if (on) S.last = name; }, [IDX[b], on, b]);
const tap = async (b) => { await press(b); await frames(3); await press(b, false); await frames(3); };
const axes = (lx, ly, rx, ry) => page.evaluate((a) => { const S = window.__native; S.axes[0] = a[0]; S.axes[1] = a[1]; S.axes[2] = a[2]; S.axes[3] = a[3]; S.events++; }, [lx, ly, rx, ry]);
const game = (fn) => page.evaluate(fn);

await page.goto(URL);
await page.waitForFunction(() => window.__game && window.__game.perf.calls > 0, null, { timeout: 60000 });
await frames(5);
check('title shows the Android input path', (await game(() => document.getElementById('title-status').textContent)).includes('Android input'));

await tap('cross');
check('Cross via the native bridge leaves the title screen', await game(() => document.getElementById('title').hidden && !document.getElementById('choose').hidden));
await tap('right');
check('D-pad via the native bridge moves the Mascota choice', await game(() => document.querySelectorAll('.pick')[1].classList.contains('selected')));
await tap('left');
await tap('cross');
check('Cross hatches the Creature', await game(() => window.__game.creature.alive));

const p0 = await game(() => window.__game.hand.pos.toArray());
await axes(1, 0, 0, 0); await frames(12); await axes(0, 0, 0, 0); await frames(2);
const p1 = await game(() => window.__game.hand.pos.toArray());
check('left stick via the native bridge moves the Hand', Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) > 3);

const yaw0 = await game(() => window.__game.rig.yaw);
await axes(0, 0, 1, 0); await frames(10); await axes(0, 0, 0, 0); await frames(2);
check('right stick via the native bridge orbits the camera', Math.abs((await game(() => window.__game.rig.yaw)) - yaw0) > 0.2);

await press('l1'); await frames(4);
check('holding L1 opens the build wheel', await game(() => window.__game.radial.isOpen));
await press('l1', false); await frames(3);
check('releasing L1 closes it', await game(() => !window.__game.radial.isOpen));

await tap('options'); await frames(3);
check('Options opens the Almanac', await game(() => !document.getElementById('almanac').hidden));
await tap('circle'); await frames(3);
check('Circle closes it', await game(() => document.getElementById('almanac').hidden));

await game(() => window.__game.input.rumble(0.5, 0.5, 100));
check('rumble is forwarded to the native bridge', (await game(() => window.__rumbles)) > 0);
check('no runtime errors', errors.length === 0, errors.join(' | '));

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
