// DualShock 4 input layer. Three sources are merged every frame:
//  1. window.AndroidPad — the Android TV app reads the controller natively (GamepadBridge.java),
//     because Android WebViews list gamepads but often never deliver their events;
//  2. the W3C Gamepad API — desktop browsers;
//  3. the keyboard — desk debugging, and the TV remote's D-pad / OK button.
// Produces a normalised per-frame snapshot with edge detection, radial deadzones and rumble.

const BUTTONS = [
  'cross', 'circle', 'square', 'triangle', 'l1', 'r1', 'l2', 'r2',
  'share', 'options', 'l3', 'r3', 'up', 'down', 'left', 'right', 'ps', 'touchpad',
];

// W3C "standard" mapping: button index -> name. Android/Chromium remap the DS4 to this.
const STANDARD = BUTTONS;

// Raw DS4 HID layout, used when the browser reports mapping === "" for a Sony pad.
const RAW_DS4 = {
  buttons: ['square', 'cross', 'circle', 'triangle', 'l1', 'r1', 'l2', 'r2',
    'share', 'options', 'l3', 'r3', 'ps', 'touchpad'],
  axes: { lx: 0, ly: 1, rx: 2, ry: 5, l2: 3, r2: 4, hat: 9 },
};

const KEYS = {
  cross: ['Enter', 'KeyJ'], circle: ['Escape', 'Backspace', 'KeyL'], square: ['KeyF', 'KeyU'],
  triangle: ['KeyT', 'KeyI'], l1: ['KeyQ'], r1: ['KeyE'], l2: ['ShiftLeft', 'ShiftRight'],
  r2: ['Space'], options: ['Tab', 'KeyM'], touchpad: [], share: [], l3: [], r3: [], ps: [],
  up: ['Digit2'], left: ['Digit1'], right: ['Digit3'], down: ['Digit4'],
};

const STICK_DEADZONE = 0.14;
const TRIGGER_THRESHOLD = 0.35;

function radialDeadzone(x, y, out, key) {
  const m = Math.hypot(x, y);
  if (m < STICK_DEADZONE) { out[key + 'x'] = 0; out[key + 'y'] = 0; return; }
  const k = Math.min(1, (m - STICK_DEADZONE) / (1 - STICK_DEADZONE)) / m;
  out[key + 'x'] = x * k;
  out[key + 'y'] = y * k;
}

export function createInput() {
  const state = {
    lx: 0, ly: 0, rx: 0, ry: 0, l2: 0, r2: 0,
    connected: false, padName: '', usingKeyboard: false,
    source: 'none', lastButton: '', nativeEvents: 0,
    down: {}, pressed: {}, released: {},
  };
  for (const b of BUTTONS) { state.down[b] = false; state.pressed[b] = false; state.released[b] = false; }

  const keys = new Set();
  let padIndex = -1;
  let anyKeySeen = false;

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

  function activePad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    if (padIndex >= 0 && pads[padIndex] && pads[padIndex].connected) return pads[padIndex];
    for (const p of pads) if (p && p.connected) { padIndex = p.index; return p; }
    return null;
  }

  const raw = {};
  const key = (...codes) => codes.some((c) => keys.has(c));
  const bridge = typeof window.AndroidPad === 'object' && window.AndroidPad && typeof window.AndroidPad.state === 'function' ? window.AndroidPad : null;

  /** Native controller state from the Android app, or null. */
  function nativePad() {
    if (!bridge) return null;
    let s;
    try { s = String(bridge.state()); } catch { return null; }
    const [bits, axes, connected, events, last, name] = s.split('|');
    const a = (axes || '').split(',').map(Number);
    return {
      buttons: bits || '', lx: a[0] || 0, ly: a[1] || 0, rx: a[2] || 0, ry: a[3] || 0, l2: a[4] || 0, r2: a[5] || 0,
      connected: connected === '1', events: Number(events) || 0, last: last || '', name: name || '',
    };
  }
  const bigger = (a, b) => (Math.abs(b) > Math.abs(a) ? b : a);

  function poll() {
    for (const b of BUTTONS) raw[b] = false;
    let lx = 0, ly = 0, rx = 0, ry = 0, l2 = 0, r2 = 0;

    const pad = activePad();
    const native = nativePad();
    state.connected = !!pad || !!(native && native.connected);
    state.padName = native && native.connected ? native.name : pad ? pad.id : '';
    state.source = native && native.connected ? 'android' : pad ? 'gamepad' : anyKeySeen ? 'keyboard' : 'none';
    if (native) {
      state.nativeEvents = native.events;
      if (native.last) state.lastButton = native.last;
      BUTTONS.forEach((name, i) => { if (native.buttons[i] === '1') raw[name] = true; });
      lx = native.lx; ly = native.ly; rx = native.rx; ry = native.ry; l2 = native.l2; r2 = native.r2;
    }
    if (pad) {
      const isRawSony = pad.mapping !== 'standard' && /054c|sony|wireless controller/i.test(pad.id);
      if (isRawSony) {
        const A = RAW_DS4.axes;
        RAW_DS4.buttons.forEach((name, i) => { if (pad.buttons[i] && pad.buttons[i].pressed) raw[name] = true; });
        lx = bigger(lx, pad.axes[A.lx] || 0); ly = bigger(ly, pad.axes[A.ly] || 0);
        rx = bigger(rx, pad.axes[A.rx] || 0); ry = bigger(ry, pad.axes[A.ry] || 0);
        l2 = Math.max(l2, pad.axes[A.l2] !== undefined ? (pad.axes[A.l2] + 1) / 2 : raw.l2 ? 1 : 0);
        r2 = Math.max(r2, pad.axes[A.r2] !== undefined ? (pad.axes[A.r2] + 1) / 2 : raw.r2 ? 1 : 0);
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

    // Keyboard mirror (WASD = left stick, arrows = right stick). Always merged: in the Android
    // app gamepad keys are consumed natively and never reach the page, so any key events here
    // come from a real keyboard or the TV remote.
    {
      const kx = (key('KeyD') ? 1 : 0) - (key('KeyA') ? 1 : 0);
      const ky = (key('KeyS') ? 1 : 0) - (key('KeyW') ? 1 : 0);
      const cx = (key('ArrowRight') ? 1 : 0) - (key('ArrowLeft') ? 1 : 0);
      const cy = (key('ArrowDown') ? 1 : 0) - (key('ArrowUp') ? 1 : 0);
      if (kx || ky) { const m = Math.hypot(kx, ky); lx = kx / m; ly = ky / m; }
      if (cx || cy) { const m = Math.hypot(cx, cy); rx = cx / m; ry = cy / m; }
      for (const name in KEYS) if (KEYS[name].some((c) => keys.has(c)) && !raw[name]) state.lastButton = name;
      for (const name in KEYS) if (key(...KEYS[name])) raw[name] = true;
      if (raw.l2 && l2 < 1 && key(...KEYS.l2)) l2 = 1;
      if (raw.r2 && r2 < 1 && key(...KEYS.r2)) r2 = 1;
    }
    state.usingKeyboard = anyKeySeen && !state.connected;

    radialDeadzone(lx, ly, state, 'l');
    radialDeadzone(rx, ry, state, 'r');
    state.l2 = l2; state.r2 = r2;
    raw.l2 = raw.l2 || l2 > TRIGGER_THRESHOLD;
    raw.r2 = raw.r2 || r2 > TRIGGER_THRESHOLD;

    if (!native) for (const b of BUTTONS) if (raw[b] && !state.down[b]) state.lastButton = b;
    for (const b of BUTTONS) {
      const was = state.down[b];
      state.pressed[b] = raw[b] && !was;
      state.released[b] = !raw[b] && was;
      state.down[b] = raw[b];
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

  return { state, poll, rumble, anyInput };
}
