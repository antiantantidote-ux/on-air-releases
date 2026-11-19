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
  let lastTitle = '';
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

  // --- controller test panel ------------------------------------------------------------------
  const PT_BUTTONS = [['cross', '✕'], ['circle', '○'], ['square', '□'], ['triangle', '△'], ['l1', 'L1'], ['r1', 'R1'],
    ['l2', 'L2'], ['r2', 'R2'], ['share', 'SHARE'], ['options', 'OPT'], ['l3', 'L3'], ['r3', 'R3'],
    ['up', '↑'], ['down', '↓'], ['left', '←'], ['right', '→'], ['ps', 'PS']];
  const PT_NAMES = Object.fromEntries(PT_BUTTONS);
  let ptBuilt = false, ptPrompt = null;
  const fmt = (v) => (v >= 0 ? ' ' : '') + v.toFixed(2);

  hud.padTest = (show, pad, wizard, onTitle) => {
    const el = $('padtest');
    if (!show) { el.hidden = true; return; }
    el.classList.toggle('on-title', !!onTitle);
    if (!ptBuilt) {
      $('pt-buttons').innerHTML = PT_BUTTONS.map(([b, t]) => `<span data-b="${b}">${t}</span>`).join('');
      ptBuilt = true;
    }
    el.hidden = false;
    const s = pad.stick;
    $('pt-ls').style.transform = `translate(${(s.lx * 1.5).toFixed(2)}rem, ${(s.ly * 1.5).toFixed(2)}rem)`;
    $('pt-rs').style.transform = `translate(${(s.rx * 1.5).toFixed(2)}rem, ${(s.ry * 1.5).toFixed(2)}rem)`;
    $('pt-l2').style.width = `${Math.round(pad.l2 * 100)}%`;
    $('pt-r2').style.width = `${Math.round(pad.r2 * 100)}%`;
    for (const span of $('pt-buttons').children) span.classList.toggle('on', !!pad.down[span.dataset.b]);
    const prompt = wizard.active ? `<b class="step">${Math.min(wizard.step + 1, wizard.total)}/${wizard.total}</b> ${wizard.prompt}` : '';
    if (prompt !== ptPrompt) { $('pt-prompt').innerHTML = prompt; $('pt-prompt').hidden = !prompt; ptPrompt = prompt; }
    const d = pad.diag || {};
    let info, rawLine;
    if (d.bridge) {
      const mapped = d.lastMapped && d.lastMapped.length ? d.lastMapped.map((b) => PT_NAMES[b] || b).join(' ') : 'nothing';
      info = `${d.name || 'No controller found'}${d.ids ? ` · ${d.ids}` : ''} · ${d.layout}\n`
        + `Button events ${d.keyEvents} · stick events ${d.motionEvents}`
        + (d.otherMotion ? ` · pointer events ${d.otherMotion}` : '')
        + (d.pointerMoves ? ` · page pointer ${d.pointerMoves}` : '')
        + (d.lastKey > 0 ? ` · last button ${d.lastKey} ${d.lastKeyName} → ${mapped}` : '');
      rawLine = d.axes.map((a) => `${a.name}${a.role ? '=' + a.role : ''}${fmt(a.value)}`).join('  ');
    } else {
      info = `${d.name ? d.name + ' · ' : ''}${d.layout || 'no controller'}`;
      rawLine = '';
    }
    $('pt-info').textContent = info;
    $('pt-raw').textContent = rawLine;
    $('pt-raw').hidden = !rawLine;
  };

  hud.showTitle = (show, status) => {
    $('title').hidden = !show;
    if (status && status !== lastTitle) { $('title-status').innerHTML = status; lastTitle = status; }
  };

  /** cards: [{ title, stats: [[label, value]], bars: [[label, value, max, color, text]], chart: { values, color, caption } }] */
  hud.almanac = (cards) => {
    if (!cards) { $('almanac').hidden = true; return; }
    const stat = ([label, value]) => `<div class="stat"><span>${label}</span><b>${value}</b></div>`;
    const bar = ([label, value, max, color, text]) =>
      `<div class="bar-row wide"><span>${label}</span><div class="bar"><i style="width:${Math.max(0, Math.min(100, Math.round((value / max) * 100)))}%;background:${color}"></i></div><b>${text}</b></div>`;
    const chart = (c) => {
      const v = c.values.length > 1 ? c.values : [0, 0];
      const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
      const pts = v.map((y, i) => `${((i / (v.length - 1)) * 300).toFixed(1)},${(92 - ((y - lo) / span) * 84).toFixed(1)}`).join(' ');
      return `<svg class="chart" viewBox="0 0 300 100" preserveAspectRatio="none"><polyline points="0,100 ${pts} 300,100" fill="${c.color}33" stroke="none"/><polyline points="${pts}" fill="none" stroke="${c.color}" stroke-width="3" vector-effect="non-scaling-stroke"/></svg><div class="chart-caption">${c.caption}</div>`;
    };
    $('almanac-cards').innerHTML = cards.map((c) =>
      `<div class="card${c.wide ? ' wide' : ''}${c.long ? ' long' : ''}"><h2>${c.title}</h2>${c.chart ? chart(c.chart) : ''}${c.html || ''}${(c.bars || []).map(bar).join('')}${(c.stats || []).map(stat).join('')}</div>`).join('');
    $('almanac').hidden = false;
  };

  /** The "choose your Mascota" screen. options: [{ icon, title, name, blurb }] */
  hud.choose = (options, index) => {
    if (!options) { $('choose').hidden = true; return; }
    $('choose-cards').innerHTML = options.map((o, i) =>
      `<div class="pick${i === index ? ' selected' : ''}"><div class="pick-icon">${o.icon}</div><div class="name">${o.title}</div><div class="pick-name">“${o.name}”</div><div class="text">${o.blurb}</div></div>`).join('');
    $('choose').hidden = false;
  };

  hud.ending = (over) => {
    if (!over) { $('ending').hidden = true; return; }
    $('ending').className = over.won ? 'won' : 'lost';
    $('ending-kicker').textContent = over.won ? 'Victory' : 'Your reign is over';
    $('ending-title').textContent = over.title;
    $('ending-text').textContent = over.text;
    $('ending-hint').innerHTML = `<span class="btn cross">✕</span> ${over.won ? 'Keep ruling' : 'Begin a new reign'}`;
    $('ending').hidden = false;
  };
  hud.endingOpen = () => !$('ending').hidden;

  hud.setResources = (r) => {
    $('pesos').textContent = `💰 ${r.pesos < 0 ? '−' : ''}$${Math.abs(Math.round(r.pesos)).toLocaleString('en-US')}`;
    $('pesos').classList.toggle('paused', r.pesos < 0);
    $('mana').textContent = `✨ ${Math.floor(r.mana)}/${r.manaCap}`;
    $('pop').textContent = `👥 ${r.pop}`;
    $('mood').textContent = `${r.mood > 0.62 ? '😊' : r.mood > 0.42 ? '😐' : '😠'} ${Math.round(r.mood * 100)}%`;
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
