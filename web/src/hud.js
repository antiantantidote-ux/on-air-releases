// 10-foot HUD: top bar, contextual button hints, advisor popups, inspect card and
// the Almanac del Presidente. Pure DOM over the WebGL canvas; no element is smaller
// than 1rem, and 1rem is pinned to 2.6vh (28px on a 1080p panel).

const $ = (id) => document.getElementById(id);

const ADVISORS = {
  penultimo: { name: 'Generalissimo Penúltimo', face: '🎖️', cls: 'state' },
  xochitl: { name: 'High Priestess Xochitl', face: '🌺', cls: 'spirit' },
};

const GLYPH = {
  cross: '<span class="btn cross">✕</span>', circle: '<span class="btn circle">○</span>',
  square: '<span class="btn square">□</span>', triangle: '<span class="btn triangle">△</span>',
  l1: '<span class="pill">L1</span>', r1: '<span class="pill">R1</span>',
  l2: '<span class="pill">L2</span>', r2: '<span class="pill">R2</span>',
  ls: '<span class="pill stick">L</span>', rs: '<span class="pill stick">R</span>',
  options: '<span class="pill">OPTIONS</span>', dpad: '<span class="pill">✚</span>',
};

export function createHud() {
  const hud = {};
  const seen = new Set();
  const queue = [], history = [];
  let advisorTimer = 0, historyCursor = -1, lastHints = '', toastTimer = 0;

  hud.setClock = (day, clock, daylight) => {
    $('clock').textContent = `${daylight > 0.5 ? '☀️' : '🌙'} Day ${day} · ${clock}`;
  };

  hud.setSpeed = (speed) => {
    $('speed').textContent = speed === 0 ? '⏸ PAUSED' : speed === 2 ? '⏩ 2×' : '▶ 1×';
    $('speed').classList.toggle('paused', speed === 0);
  };

  /** hints: [[glyphKey, label], ...] */
  hud.setHints = (hints) => {
    const html = hints.map(([g, label]) => `<span class="hint">${GLYPH[g]} ${label}</span>`).join('');
    if (html !== lastHints) { $('hints').innerHTML = html; lastHints = html; }
  };

  hud.toast = (text) => {
    $('toast').textContent = text;
    $('toast').hidden = false;
    toastTimer = 2.2;
  };

  /** Queue an advisor line. `key` makes it fire only once per session. */
  hud.advise = (who, text, key) => {
    if (key) { if (seen.has(key)) return; seen.add(key); }
    queue.push({ who, text });
  };

  function showAdvisor(msg, label) {
    const a = ADVISORS[msg.who];
    $('advisor').className = `advisor ${a.cls}`;
    $('advisor-face').textContent = a.face;
    $('advisor-name').textContent = label ? `${a.name} · ${label}` : a.name;
    $('advisor-text').textContent = msg.text;
    $('advisor').hidden = false;
    advisorTimer = 3.5 + msg.text.length * 0.045;
  }

  /** D-pad Down: flip back through recent counsel, newest first. */
  hud.cycleAlerts = () => {
    if (!history.length) { hud.toast('No urgent matters, Presidente.'); return; }
    historyCursor = (historyCursor + 1) % history.length;
    showAdvisor(history[history.length - 1 - historyCursor], `${historyCursor + 1}/${history.length}`);
  };

  hud.inspect = (card) => {
    if (!card) { $('inspect').hidden = true; return; }
    $('inspect-icon').textContent = card.icon;
    $('inspect-title').textContent = card.title;
    $('inspect-sub').textContent = card.sub;
    $('inspect-bars').innerHTML = (card.bars || []).map(([label, value, color]) =>
      `<div class="bar-row"><span>${label}</span><div class="bar"><i style="width:${Math.round(value * 100)}%;background:${color}"></i></div></div>`
    ).join('');
    $('inspect').hidden = false;
  };
  hud.inspectOpen = () => !$('inspect').hidden;

  hud.showTitle = (show, status) => {
    $('title').hidden = !show;
    if (status) $('title-status').innerHTML = status;
  };

  hud.almanac = (data) => {
    if (!data) { $('almanac').hidden = true; return; }
    const stat = ([label, value]) => `<div class="stat"><span>${label}</span><b>${value}</b></div>`;
    const bar = ([label, value, max, color, text]) =>
      `<div class="bar-row wide"><span>${label}</span><div class="bar"><i style="width:${Math.min(100, Math.round((value / max) * 100))}%;background:${color}"></i></div><b>${text}</b></div>`;
    $('almanac-island').innerHTML = data.island.map(stat).join('');
    $('almanac-hand').innerHTML = data.hand.map(stat).join('');
    $('almanac-engine').innerHTML = data.engine.map(bar).join('');
    $('almanac').hidden = false;
  };
  hud.almanacOpen = () => !$('almanac').hidden;

  hud.update = (dt) => {
    if (toastTimer > 0 && (toastTimer -= dt) <= 0) $('toast').hidden = true;
    if (advisorTimer > 0) {
      advisorTimer -= dt;
      if (advisorTimer <= 0) { $('advisor').hidden = true; historyCursor = -1; }
    } else if (queue.length) {
      const msg = queue.shift();
      history.push(msg);
      if (history.length > 8) history.shift();
      showAdvisor(msg);
    }
  };

  return hud;
}
