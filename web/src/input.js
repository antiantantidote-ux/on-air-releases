// DualShock 4 input layer. Three sources are merged every frame:
//  1. window.AndroidPad — raw controller data from the Android TV app (GamepadBridge.java): the
//     Android key codes being held and the value of every joystick axis. This module decides what
//     they mean, because Android builds lay the DualShock 4 out differently (see LAYOUTS);
//  2. the W3C Gamepad API — desktop browsers;
//  3. the keyboard — desk debugging, and the TV remote's D-pad / OK button.
// It also runs the guided controller set-up (saved per controller), gathers live diagnostics for
// the controller test panel, and produces a normalised snapshot with edge detection and deadzones.

export const BUTTONS = [
  'cross', 'circle', 'square', 'triangle', 'l1', 'r1', 'l2', 'r2',
  'share', 'options', 'l3', 'r3', 'up', 'down', 'left', 'right', 'ps', 'touchpad',
];

// W3C "standard" mapping: button index -> name.
const STANDARD = BUTTONS;

// Raw DS4 HID layout, used when a desktop browser reports mapping === "" for a Sony pad.
const RAW_DS4 = {
  buttons: ['square', 'cross', 'circle', 'triangle', 'l1', 'r1', 'l2', 'r2',
    'share', 'options', 'l3', 'r3', 'ps', 'touchpad'],
  axes: { lx: 0, ly: 1, rx: 2, ry: 5, l2: 3, r2: 4, hat: 9 },
};

const KEYS = {
  cross: ['Enter', 'KeyJ'], circle: ['Escape', 'Backspace', 'KeyL'], square: ['KeyF', 'KeyU'],
  triangle: ['KeyT', 'KeyI'], l1: ['KeyQ'], r1: ['KeyE'], l2: ['ShiftLeft', 'ShiftRight'],
  r2: ['Space'], options: ['Tab', 'KeyM'], touchpad: [], share: ['KeyP'], l3: [], r3: [], ps: [],
  up: ['Digit2'], left: ['Digit1'], right: ['Digit3'], down: ['Digit4'],
};

const STICK_DEADZONE = 0.14;
const TRIGGER_THRESHOLD = 0.35;
const HOLD_FOR_SETUP = 3;      // seconds a button is held on the title screen to start the set-up
const STEP_TIMEOUT = 20;       // seconds before a set-up step is skipped

// --- Android ----------------------------------------------------------------------------------
// KeyEvent key codes and MotionEvent axis ids.
const KC = {
  BACK: 4, DPAD_UP: 19, DPAD_DOWN: 20, DPAD_LEFT: 21, DPAD_RIGHT: 22, DPAD_CENTER: 23, MENU: 82,
  A: 96, B: 97, C: 98, X: 99, Y: 100, Z: 101, L1: 102, R1: 103, L2: 104, R2: 105,
  THUMBL: 106, THUMBR: 107, START: 108, SELECT: 109, MODE: 110, B1: 188,
};
const AX = { X: 0, Y: 1, Z: 11, RX: 12, RY: 13, RZ: 14, HAT_X: 15, HAT_Y: 16, LTRIGGER: 17, RTRIGGER: 18, GAS: 22, BRAKE: 23 };
const AXIS_NAME = {
  0: 'X', 1: 'Y', 11: 'Z', 12: 'RX', 13: 'RY', 14: 'RZ', 15: 'HAT_X', 16: 'HAT_Y', 17: 'LTRIGGER', 18: 'RTRIGGER',
  19: 'THROTTLE', 20: 'RUDDER', 21: 'WHEEL', 22: 'GAS', 23: 'BRAKE',
};
const ZERO_BASED = new Set([AX.LTRIGGER, AX.RTRIGGER, AX.GAS, AX.BRAKE, 19]); // Android scales these 0..1
const HATS = new Set([AX.HAT_X, AX.HAT_Y]);
const axisName = (a) => AXIS_NAME[a] || (a >= 32 && a <= 47 ? `GENERIC_${a - 31}` : `AXIS_${a}`);

const DPAD_KEYS = { up: [KC.DPAD_UP], down: [KC.DPAD_DOWN], left: [KC.DPAD_LEFT], right: [KC.DPAD_RIGHT] };

// How Android may present a DualShock 4. `right` and `triggers` name axis pairs; without them
// the pairs are worked out from the axes the controller reports.
const LAYOUTS = {
  standard: {
    label: 'standard Android layout',
    buttons: {
      cross: [KC.A, KC.DPAD_CENTER], circle: [KC.B, KC.BACK], square: [KC.X], triangle: [KC.Y],
      l1: [KC.L1], r1: [KC.R1], l2: [KC.L2], r2: [KC.R2], share: [KC.SELECT], options: [KC.START, KC.MENU],
      l3: [KC.THUMBL], r3: [KC.THUMBR], ps: [KC.MODE], touchpad: [KC.B1], ...DPAD_KEYS,
    },
  },
  // No Sony key layout on this Android build plus an older kernel driver: Android falls back to
  // Generic.kl and every button shifts along (the table Chrome uses for the same case).
  ds4generic: {
    label: 'DualShock 4 · generic layout',
    buttons: {
      square: [KC.A], cross: [KC.B, KC.DPAD_CENTER], circle: [KC.C, KC.BACK], triangle: [KC.X],
      l1: [KC.Y], r1: [KC.Z], l2: [KC.L1], r2: [KC.R1], share: [KC.L2], options: [KC.R2, KC.MENU],
      l3: [KC.SELECT], r3: [KC.START], ps: [KC.MODE], touchpad: [KC.THUMBL], ...DPAD_KEYS,
    },
    right: [AX.Z, AX.RZ], triggers: [AX.RX, AX.RY],
  },
  // Generic.kl with a newer kernel driver: buttons almost standard (□ and △ swap),
  // right stick on RX/RY, triggers on Z/RZ.
  ds4genericNew: {
    label: 'DualShock 4 · generic layout, new driver',
    buttons: {
      cross: [KC.A, KC.DPAD_CENTER], circle: [KC.B, KC.BACK], square: [KC.Y], triangle: [KC.X],
      l1: [KC.L1], r1: [KC.R1], l2: [KC.L2], r2: [KC.R2], share: [KC.SELECT], options: [KC.START, KC.MENU],
      l3: [KC.THUMBL], r3: [KC.THUMBR], ps: [KC.MODE], touchpad: [KC.B1], ...DPAD_KEYS,
    },
    right: [AX.RX, AX.RY], triggers: [AX.Z, AX.RZ],
  },
  // A Sony layout file written for the old driver, applied to the new one.
  ds4mismatch: {
    label: 'DualShock 4 · mismatched layout',
    buttons: {
      cross: [KC.X, KC.DPAD_CENTER], circle: [KC.A, KC.BACK], square: [KC.L1], triangle: [KC.Y],
      l1: [KC.L2], r1: [KC.R2], l2: [KC.SELECT], r2: [KC.START], share: [KC.THUMBL], options: [KC.THUMBR, KC.MENU],
      l3: [KC.B1], r3: [], ps: [KC.MODE], touchpad: [], ...DPAD_KEYS,
    },
    right: [AX.LTRIGGER, AX.RTRIGGER], triggers: [AX.Z, AX.RZ],
  },
};

function detectLayout(dev) {
  const keys = new Set(dev.keys || []);
  const axes = new Set((dev.axes || []).map((a) => a.axis));
  const sony = dev.vendor === 0x054c || /wireless controller|dualshock|playstation|sony/i.test(dev.name || '');
  if (!sony || !keys.size) return 'standard';
  if (keys.has(KC.C) && keys.has(KC.Z)) return 'ds4generic';
  if (keys.has(KC.A) && !keys.has(KC.B)) return 'ds4mismatch';
  if (!axes.has(AX.LTRIGGER) && !axes.has(AX.BRAKE)
      && axes.has(AX.Z) && axes.has(AX.RZ) && axes.has(AX.RX) && axes.has(AX.RY)) return 'ds4genericNew';
  return 'standard';
}

/** Turn a controller description (and an optional saved set-up) into a mapping. */
function buildProfile(dev, calib) {
  const ranges = new Map((dev.axes || []).map((a) => [a.axis, a]));
  const has = (a) => ranges.has(a);
  const range = (a) => ranges.get(a) || (ZERO_BASED.has(a) ? { min: 0, max: 1 } : { min: -1, max: 1 });
  const stick = (axis, sign = 1) => {
    const r = range(axis), half = (r.max - r.min) / 2 || 1;
    return { axis, center: (r.min + r.max) / 2, scale: sign / half };
  };
  const trigger = (axis) => { const r = range(axis); return { axis, rest: r.min, full: r.max }; };
  const key = detectLayout(dev);
  const layout = LAYOUTS[key];
  let right = layout.right;
  let triggers = layout.triggers;
  if (!right) right = has(AX.Z) && has(AX.RZ) ? [AX.Z, AX.RZ] : has(AX.RX) && has(AX.RY) ? [AX.RX, AX.RY] : [AX.Z, AX.RZ];
  if (!triggers) {
    if (has(AX.LTRIGGER) || has(AX.RTRIGGER)) triggers = [AX.LTRIGGER, AX.RTRIGGER];
    else if (has(AX.BRAKE) || has(AX.GAS)) triggers = [AX.BRAKE, AX.GAS];
    else if (right[0] === AX.Z && has(AX.RX) && has(AX.RY)) triggers = [AX.RX, AX.RY];
    else if (right[0] === AX.RX && has(AX.Z) && has(AX.RZ)) triggers = [AX.Z, AX.RZ];
    else triggers = null;
  }
  const p = {
    layout: key, label: layout.label, calibrated: false, swapped: false,
    buttons: Object.fromEntries(BUTTONS.map((b) => [b, [...(layout.buttons[b] || [])]])),
    lx: stick(AX.X), ly: stick(AX.Y), rx: stick(right[0]), ry: stick(right[1]),
    l2: triggers ? trigger(triggers[0]) : null, r2: triggers ? trigger(triggers[1]) : null,
    pairs: [[AX.Z, AX.RZ], [AX.RX, AX.RY], [AX.LTRIGGER, AX.RTRIGGER]].filter(([a, b]) => has(a) && has(b)),
    stick, trigger, range,
  };
  if (calib) {
    for (const b of Object.keys(calib.buttons || {})) {
      const ks = calib.buttons[b];
      for (const other of BUTTONS) p.buttons[other] = p.buttons[other].filter((k) => !ks.includes(k));
      p.buttons[b] = [...ks];
    }
    for (const k of ['lx', 'ly', 'rx', 'ry', 'l2', 'r2']) if (calib[k]) p[k] = { ...calib[k] };
    p.calibrated = true;
    p.label = 'your controller set-up';
  }
  return p;
}

const clamp1 = (v) => (v < -1 ? -1 : v > 1 ? 1 : v);
const stickValue = (axes, s) => {
  if (!s) return 0;
  const v = axes.get(s.axis);
  return v === undefined ? 0 : clamp1((v - s.center) * s.scale);
};
const triggerValue = (axes, t) => {
  if (!t) return 0;
  const v = axes.get(t.axis), span = t.full - t.rest;
  if (v === undefined || !span) return 0;
  return Math.min(1, Math.max(0, (v - t.rest) / span));
};

function readBridge(bridge) {
  let s;
  try { s = String(bridge.state()); } catch { return null; }
  const [keysPart, axesPart, counts, lasts, devPart, lastName] = s.split('|');
  const down = new Set();
  if (keysPart) for (const k of keysPart.split(',')) down.add(Number(k));
  const axes = new Map();
  if (axesPart) for (const kv of axesPart.split(',')) {
    const i = kv.indexOf(':');
    if (i > 0) axes.set(Number(kv.slice(0, i)), Number(kv.slice(i + 1)) / 1000);
  }
  const [keyEvents = 0, motionEvents = 0, otherMotion = 0] = (counts || '').split(',').map(Number);
  const [lastKey = -1, motionSource = 0, otherSource = 0] = (lasts || '').split(',').map(Number);
  const [deviceId = -1, deviceVersion = 0, padCount = 0] = (devPart || '').split(',').map(Number);
  return { down, axes, keyEvents, motionEvents, otherMotion, lastKey, motionSource, otherSource, deviceId, deviceVersion, padCount, lastKeyName: lastName || '' };
}

const WIZARD_STEPS = [
  { kind: 'stick', target: 'lx', prompt: 'Push the <b>LEFT stick</b> to the <b>RIGHT</b>' },
  { kind: 'stick', target: 'ly', prompt: 'Push the <b>LEFT stick DOWN</b>' },
  { kind: 'stick', target: 'rx', prompt: 'Push the <b>RIGHT stick</b> to the <b>RIGHT</b>' },
  { kind: 'stick', target: 'ry', prompt: 'Push the <b>RIGHT stick DOWN</b>' },
  { kind: 'button', target: 'cross', prompt: 'Press <span class="btn cross">✕</span>' },
  { kind: 'button', target: 'circle', prompt: 'Press <span class="btn circle">○</span>' },
  { kind: 'button', target: 'square', prompt: 'Press <span class="btn square">□</span>' },
  { kind: 'button', target: 'triangle', prompt: 'Press <span class="btn triangle">△</span>' },
  { kind: 'button', target: 'l1', prompt: 'Press <span class="pill">L1</span>' },
  { kind: 'button', target: 'r1', prompt: 'Press <span class="pill">R1</span>' },
  { kind: 'trigger', target: 'l2', prompt: 'Squeeze <span class="pill">L2</span>' },
  { kind: 'trigger', target: 'r2', prompt: 'Squeeze <span class="pill">R2</span>' },
  { kind: 'button', target: 'share', prompt: 'Press <span class="pill">SHARE</span>' },
  { kind: 'button', target: 'options', prompt: 'Press <span class="pill">OPTIONS</span>' },
];

function radialDeadzone(x, y, out, key) {
  const m = Math.hypot(x, y);
  if (m < STICK_DEADZONE) { out[key + 'x'] = 0; out[key + 'y'] = 0; return; }
  const k = Math.min(1, (m - STICK_DEADZONE) / (1 - STICK_DEADZONE)) / m;
  out[key + 'x'] = x * k;
  out[key + 'y'] = y * k;
}

function storageGet(key) { try { return window.localStorage.getItem(key); } catch { return null; } }
function storageSet(key, value) { try { window.localStorage.setItem(key, value); return true; } catch { return false; } }

export function createInput() {
  const state = {
    lx: 0, ly: 0, rx: 0, ry: 0, l2: 0, r2: 0,
    connected: false, padName: '', usingKeyboard: false,
    source: 'none', lastButton: '', nativeEvents: 0,
    holdTime: 0, anyReleased: false, lastHold: 0,
    stick: { lx: 0, ly: 0, rx: 0, ry: 0 },   // before the deadzone, for the test panel
    diag: null,
    down: {}, pressed: {}, released: {},
  };
  for (const b of BUTTONS) { state.down[b] = false; state.pressed[b] = false; state.released[b] = false; }

  const keys = new Set();
  let padIndex = -1;
  let anyKeySeen = false;
  let pointerMoves = 0;

  window.addEventListener('keydown', (e) => {
    keys.add(e.code);
    anyKeySeen = true;
    // Stop the TV browser from scrolling / navigating focus with the same keys.
    if (!e.metaKey && !e.ctrlKey) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  window.addEventListener('gamepadconnected', (e) => { padIndex = e.gamepad.index; });
  window.addEventListener('gamepaddisconnected', (e) => { if (e.gamepad.index === padIndex) padIndex = -1; });
  // Some TV boxes turn a controller stick into a mouse pointer; count that for the diagnostics.
  window.addEventListener('pointermove', () => { pointerMoves++; }, { passive: true });
  window.addEventListener('wheel', () => { pointerMoves++; }, { passive: true });

  function activePad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    if (padIndex >= 0 && pads[padIndex] && pads[padIndex].connected) return pads[padIndex];
    for (const p of pads) if (p && p.connected) { padIndex = p.index; return p; }
    return null;
  }

  const raw = {};
  const key = (...codes) => codes.some((c) => keys.has(c));
  const bridge = typeof window.AndroidPad === 'object' && window.AndroidPad && typeof window.AndroidPad.state === 'function'
    && typeof window.AndroidPad.device === 'function' ? window.AndroidPad : null;
  const bigger = (a, b) => (Math.abs(b) > Math.abs(a) ? b : a);

  // --- native controller description and mapping ---------------------------------------------
  let device = null, deviceVersion = -1, profile = null, pinned = 0, lastSeenKey = -1;
  const signature = (d) => `edp.pad.${d.vendor || 0}:${d.product || 0}:${d.name || ''}`;

  function refreshDevice(nat) {
    if (nat.deviceVersion === deviceVersion) return;
    deviceVersion = nat.deviceVersion;
    try { device = JSON.parse(String(bridge.device())); } catch { device = null; }
    if (!device || device.id === undefined) { device = null; profile = null; return; }
    let calib = null;
    try { calib = JSON.parse(storageGet(signature(device)) || 'null'); } catch { calib = null; }
    profile = buildProfile(device, calib);
    pinned = 0;
  }

  // A trigger at rest reads the bottom of its range. If both axes picked for the right stick sit
  // pinned there, they are really the triggers: swap in a pair that rests centred.
  function checkPinnedRightStick(axes, dt) {
    if (!profile || profile.calibrated || profile.swapped) return;
    if (stickValue(axes, profile.rx) <= -0.97 && stickValue(axes, profile.ry) <= -0.97) pinned += dt;
    else pinned = 0;
    if (pinned < 1.5) return;
    pinned = 0;
    const centred = (axis) => axes.has(axis) && Math.abs(stickValue(axes, profile.stick(axis))) < 0.25;
    const alt = profile.pairs.find(([a, b]) => a !== profile.rx.axis && centred(a) && centred(b));
    if (!alt) return;
    profile.l2 = profile.trigger(profile.rx.axis);
    profile.r2 = profile.trigger(profile.ry.axis);
    profile.rx = profile.stick(alt[0]);
    profile.ry = profile.stick(alt[1]);
    profile.swapped = true;
  }

  // --- guided set-up ------------------------------------------------------------------------
  const wizard = { active: false, step: 0, total: WIZARD_STEPS.length, phase: 'settle', prompt: '', message: '', t: 0 };
  let wz = null; // working data while the set-up runs

  function startWizard() {
    if (!bridge || !device) return false;
    wz = { rest: null, result: { buttons: {} }, usedKeys: new Set(), usedAxes: new Set(), pending: null };
    Object.assign(wizard, { active: true, step: 0, phase: 'settle', t: 0, message: '', prompt: 'Let go of the controller…' });
    return true;
  }

  function finishWizard() {
    const calib = wz.result;
    storageSet(signature(device), JSON.stringify(calib));
    profile = buildProfile(device, calib);
    wizard.active = false;
    wizard.message = 'Controller set up ✓';
    wizard.prompt = '';
    wz = null;
  }

  function nextStep() {
    wizard.step++;
    wizard.t = 0;
    wz.pending = null;
    if (wizard.step >= WIZARD_STEPS.length) { finishWizard(); return; }
    wizard.phase = 'listen';
    wizard.prompt = WIZARD_STEPS[wizard.step].prompt;
  }

  function wizardTick(nat, dt) {
    const step = WIZARD_STEPS[wizard.step];
    wizard.t += dt;
    const quiet = nat.down.size === 0;
    if (wizard.phase === 'settle') {
      // Wait for the hands to let go, then remember where every axis rests.
      if (!quiet) { wizard.t = 0; return; }
      if (wizard.t < 0.5) return;
      wz.rest = new Map(nat.axes);
      wizard.phase = 'listen';
      wizard.t = 0;
      wizard.prompt = step.prompt;
      return;
    }
    const half = (a) => { const r = profile.range(a); return (r.max - r.min) / 2 || 1; };
    const moved = (a) => Math.abs((nat.axes.get(a) ?? 0) - (wz.rest.get(a) ?? 0)) / half(a);
    const free = (a) => !HATS.has(a) && !wz.usedAxes.has(a);
    const mostMoved = (min) => {
      let best = -1, bestMove = min;
      for (const a of nat.axes.keys()) if (free(a) && moved(a) > bestMove) { bestMove = moved(a); best = a; }
      return best;
    };
    const newKey = () => { for (const k of nat.down) if (!wz.usedKeys.has(k)) return k; return undefined; };

    if (wizard.phase === 'release') {
      const still = [...nat.axes.keys()].every((a) => HATS.has(a) || moved(a) < 0.3);
      if (quiet && still) nextStep();
      return;
    }
    if (wizard.t > STEP_TIMEOUT) { nextStep(); return; } // nothing arrived: keep the automatic mapping for this one
    if (step.kind === 'stick') {
      const a = mostMoved(0.55);
      if (a < 0) return;
      const sign = Math.sign(nat.axes.get(a) - wz.rest.get(a)) || 1;
      wz.result[step.target] = { axis: a, center: wz.rest.get(a), scale: sign / half(a) };
      wz.usedAxes.add(a);
      wizard.phase = 'release';
    } else if (step.kind === 'button') {
      const k = newKey();
      if (k === undefined) return;
      wz.result.buttons[step.target] = [k];
      wz.usedKeys.add(k);
      wizard.phase = 'release';
    } else { // trigger: a key, an axis, or both — collect for a moment after the first sign
      if (!wz.pending) {
        const k = newKey(), a = mostMoved(0.5);
        if (k === undefined && a < 0) return;
        wz.pending = { t: 0, key: k, axis: a, extreme: a >= 0 ? nat.axes.get(a) : 0 };
        return;
      }
      const p = wz.pending;
      p.t += dt;
      if (p.key === undefined) p.key = newKey();
      const a = mostMoved(p.axis >= 0 ? moved(p.axis) : 0.5);
      if (a >= 0) { p.axis = a; p.extreme = nat.axes.get(a); }
      if (p.axis >= 0 && moved(p.axis) > Math.abs(p.extreme - wz.rest.get(p.axis)) / half(p.axis)) p.extreme = nat.axes.get(p.axis);
      if (p.t < 0.35) return;
      if (p.key !== undefined) { wz.result.buttons[step.target] = [p.key]; wz.usedKeys.add(p.key); }
      if (p.axis >= 0) { wz.result[step.target] = { axis: p.axis, rest: wz.rest.get(p.axis), full: p.extreme }; wz.usedAxes.add(p.axis); }
      wz.pending = null;
      wizard.phase = 'release';
    }
  }

  // --- per frame ----------------------------------------------------------------------------
  let lastPoll = performance.now(), holdStart = 0;

  function poll() {
    const now = performance.now();
    const dt = Math.min(0.25, (now - lastPoll) / 1000);
    lastPoll = now;
    for (const b of BUTTONS) raw[b] = false;
    let lx = 0, ly = 0, rx = 0, ry = 0, l2 = 0, r2 = 0;

    const pad = activePad();
    const nat = bridge ? readBridge(bridge) : null;
    if (nat) refreshDevice(nat);
    const nativeLive = !!(nat && (nat.padCount > 0 || device));
    state.connected = !!pad || nativeLive;
    state.padName = nativeLive && device ? device.name : pad ? pad.id : '';
    state.source = nativeLive ? 'android' : pad ? 'gamepad' : anyKeySeen ? 'keyboard' : 'none';

    if (nat) {
      state.nativeEvents = nat.keyEvents + nat.motionEvents;
      if (profile) {
        checkPinnedRightStick(nat.axes, dt);
        for (const b of BUTTONS) {
          const ks = profile.buttons[b];
          if (ks) for (const k of ks) if (nat.down.has(k)) { raw[b] = true; break; }
        }
        lx = stickValue(nat.axes, profile.lx); ly = stickValue(nat.axes, profile.ly);
        rx = stickValue(nat.axes, profile.rx); ry = stickValue(nat.axes, profile.ry);
        l2 = profile.l2 ? triggerValue(nat.axes, profile.l2) : Math.max(nat.axes.get(AX.LTRIGGER) || 0, nat.axes.get(AX.BRAKE) || 0);
        r2 = profile.r2 ? triggerValue(nat.axes, profile.r2) : Math.max(nat.axes.get(AX.RTRIGGER) || 0, nat.axes.get(AX.GAS) || 0);
      }
      // The D-pad arrives either as keys (mapped above) or as a hat.
      const hx = nat.axes.get(AX.HAT_X) || 0, hy = nat.axes.get(AX.HAT_Y) || 0;
      if (hy < -0.5) raw.up = true;
      if (hy > 0.5) raw.down = true;
      if (hx < -0.5) raw.left = true;
      if (hx > 0.5) raw.right = true;
    }
    if (pad) {
      const isRawSony = pad.mapping !== 'standard' && /054c|sony|wireless controller/i.test(pad.id);
      if (isRawSony) {
        const A = RAW_DS4.axes;
        RAW_DS4.buttons.forEach((name, i) => { if (pad.buttons[i] && pad.buttons[i].pressed) raw[name] = true; });
        lx = bigger(lx, pad.axes[A.lx] || 0); ly = bigger(ly, pad.axes[A.ly] || 0);
        rx = bigger(rx, pad.axes[A.rx] || 0); ry = bigger(ry, pad.axes[A.ry] || 0);
        l2 = Math.max(l2, pad.axes[A.l2] !== undefined ? (pad.axes[A.l2] + 1) / 2 : 0);
        r2 = Math.max(r2, pad.axes[A.r2] !== undefined ? (pad.axes[A.r2] + 1) / 2 : 0);
        const hat = pad.axes[A.hat];
        if (hat !== undefined && hat <= 1.01) { // 8-way hat encoded as -1..1 in 2/7 steps
          const dir = Math.round((hat + 1) * 3.5);
          raw.up = raw.up || dir === 7 || dir === 0 || dir === 1;
          raw.right = raw.right || (dir >= 1 && dir <= 3);
          raw.down = raw.down || (dir >= 3 && dir <= 5);
          raw.left = raw.left || (dir >= 5 && dir <= 7);
        }
      } else {
        STANDARD.forEach((name, i) => { if (pad.buttons[i] && pad.buttons[i].pressed) raw[name] = true; });
        lx = bigger(lx, pad.axes[0] || 0); ly = bigger(ly, pad.axes[1] || 0);
        rx = bigger(rx, pad.axes[2] || 0); ry = bigger(ry, pad.axes[3] || 0);
        l2 = Math.max(l2, pad.buttons[6] ? pad.buttons[6].value : 0);
        r2 = Math.max(r2, pad.buttons[7] ? pad.buttons[7].value : 0);
      }
    }

    // Keyboard mirror (WASD = left stick, arrows = right stick). In the Android app controller
    // keys are consumed natively, so key events here come from a real keyboard or the TV remote.
    {
      const kx = (key('KeyD') ? 1 : 0) - (key('KeyA') ? 1 : 0);
      const ky = (key('KeyS') ? 1 : 0) - (key('KeyW') ? 1 : 0);
      const cx = (key('ArrowRight') ? 1 : 0) - (key('ArrowLeft') ? 1 : 0);
      const cy = (key('ArrowDown') ? 1 : 0) - (key('ArrowUp') ? 1 : 0);
      if (kx || ky) { const m = Math.hypot(kx, ky); lx = kx / m; ly = ky / m; }
      if (cx || cy) { const m = Math.hypot(cx, cy); rx = cx / m; ry = cy / m; }
      for (const name in KEYS) if (key(...KEYS[name])) raw[name] = true;
      if (raw.l2 && l2 < 1 && key(...KEYS.l2)) l2 = 1;
      if (raw.r2 && r2 < 1 && key(...KEYS.r2)) r2 = 1;
    }
    state.usingKeyboard = anyKeySeen && !state.connected;

    // Hold / release tracking (title screen: tap to start, hold to set up the controller).
    const wasWizard = wizard.active;
    // Digital inputs only: an analog trigger misread at rest must not count as a held button.
    const anyDown = BUTTONS.some((b) => raw[b]) || (nat && nat.down.size > 0) || keys.size > 0;
    state.anyReleased = false;
    if (anyDown) {
      if (!holdStart) holdStart = now;
      state.holdTime = (now - holdStart) / 1000;
    } else {
      if (holdStart) { state.anyReleased = !wasWizard; state.lastHold = (now - holdStart) / 1000; }
      holdStart = 0;
      state.holdTime = 0;
    }

    // While the set-up runs, the game sees an idle controller.
    if (wizard.active && nat) {
      wizardTick(nat, dt);
      for (const b of BUTTONS) raw[b] = false;
      lx = ly = rx = ry = l2 = r2 = 0;
    }

    state.stick.lx = lx; state.stick.ly = ly; state.stick.rx = rx; state.stick.ry = ry;
    radialDeadzone(lx, ly, state, 'l');
    radialDeadzone(rx, ry, state, 'r');
    state.l2 = l2; state.r2 = r2;
    raw.l2 = raw.l2 || l2 > TRIGGER_THRESHOLD;
    raw.r2 = raw.r2 || r2 > TRIGGER_THRESHOLD;

    for (const b of BUTTONS) {
      const was = state.down[b];
      state.pressed[b] = raw[b] && !was;
      state.released[b] = !raw[b] && was;
      state.down[b] = raw[b];
      if (state.pressed[b]) state.lastButton = b;
    }

    // Diagnostics for the controller test panel.
    if (nat) {
      if (nat.lastKey !== lastSeenKey) lastSeenKey = nat.lastKey;
      const mappedTo = profile && lastSeenKey > 0 ? BUTTONS.filter((b) => profile.buttons[b].includes(lastSeenKey)) : [];
      const roles = {};
      if (profile) for (const r of ['lx', 'ly', 'rx', 'ry', 'l2', 'r2']) if (profile[r]) roles[profile[r].axis] = (roles[profile[r].axis] ? roles[profile[r].axis] + '/' : '') + r.toUpperCase();
      state.diag = {
        bridge: true,
        name: device ? device.name : '',
        ids: device ? `${(device.vendor || 0).toString(16).padStart(4, '0')}:${(device.product || 0).toString(16).padStart(4, '0')}` : '',
        layout: profile ? profile.label + (profile.swapped ? ' · sticks auto-fixed' : '') : 'no controller',
        calibrated: !!(profile && profile.calibrated),
        keyEvents: nat.keyEvents, motionEvents: nat.motionEvents, otherMotion: nat.otherMotion,
        motionSource: nat.motionSource, otherSource: nat.otherSource,
        lastKey: lastSeenKey, lastKeyName: nat.lastKeyName, lastMapped: mappedTo,
        // The axes this controller has, plus any that are in use or moving.
        axes: [...nat.axes].filter(([a, v]) => roles[a] || Math.abs(v) > 0.02 || (device && (device.axes || []).some((r) => r.axis === a)))
          .map(([a, v]) => ({ name: axisName(a), value: v, role: roles[a] || '' })),
        pointerMoves, padCount: nat.padCount,
      };
    } else {
      state.diag = { bridge: false, name: state.padName, layout: pad ? `browser gamepad (${pad.mapping || 'no mapping'})` : state.usingKeyboard ? 'keyboard' : 'no controller', pointerMoves };
    }
    return state;
  }

  /** DualShock rumble. strong = left (heavy) motor, weak = right (buzzy) motor, both 0..1. */
  function rumble(strong, weak, ms) {
    if (bridge && typeof bridge.rumble === 'function') { try { bridge.rumble(strong, weak, ms); } catch { /* best effort */ } }
    const pad = activePad();
    const act = pad && pad.vibrationActuator;
    if (!act || !act.playEffect) return;
    act.playEffect('dual-rumble', {
      startDelay: 0, duration: ms, strongMagnitude: strong, weakMagnitude: weak,
    }).catch(() => {});
  }

  /** True once the player has touched anything (browsers hide pads until a button press). */
  const anyInput = () => state.connected || anyKeySeen || !!bridge;

  return {
    state, poll, rumble, anyInput, wizard, startWizard,
    canSetUp: () => !!(bridge && device),
    HOLD_FOR_SETUP,
  };
}
