// Radial wheel framework for the 10-foot UI. Hold a bumper to open, aim with the
// right stick, confirm with Cross, Circle backs out of sub-wheels. Wheels are plain
// data: { title, items: [{ icon, label, desc, cost?, action? , children? }] }.

const NS = 'http://www.w3.org/2000/svg';
const R_IN = 200, R_OUT = 480, R_ICON = 355;

function el(name, attrs, parent) {
  const node = document.createElementNS(NS, name);
  for (const k in attrs) node.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(node);
  return node;
}

function wedgePath(a0, a1) {
  const p = (r, a) => `${(Math.sin(a) * r).toFixed(1)} ${(-Math.cos(a) * r).toFixed(1)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${p(R_IN, a0)} L ${p(R_OUT, a0)} A ${R_OUT} ${R_OUT} 0 ${large} 1 ${p(R_OUT, a1)} ` +
    `L ${p(R_IN, a1)} A ${R_IN} ${R_IN} 0 ${large} 0 ${p(R_IN, a0)} Z`;
}

function wrap(text, maxChars) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    if ((line + ' ' + word).trim().length > maxChars && line) { lines.push(line); line = word; }
    else line = (line + ' ' + word).trim();
  }
  if (line) lines.push(line);
  return lines;
}

export function createRadial(container) {
  const svg = el('svg', { viewBox: '-500 -500 1000 1000', class: 'radial-svg' }, container);
  const wedgeLayer = el('g', {}, svg);
  el('circle', { r: R_IN - 12, class: 'radial-hub' }, svg);
  const hubTitle = el('text', { y: -70, class: 'radial-hub-title' }, svg);
  const hubDesc = el('text', { y: -18, class: 'radial-hub-desc' }, svg);
  const hubCost = el('text', { y: 128, class: 'radial-hub-cost' }, svg);
  const caption = document.createElement('div');
  caption.className = 'radial-caption';
  container.appendChild(caption);

  const radial = { isOpen: false, owner: null };
  let stack = [], selected = -1, wedges = [];

  const current = () => stack[stack.length - 1];

  function render() {
    const menu = current();
    const n = menu.items.length, step = (Math.PI * 2) / n, gap = 0.035;
    wedgeLayer.textContent = '';
    wedges = menu.items.map((item, i) => {
      const mid = i * step;
      const g = el('g', { class: 'radial-wedge' }, wedgeLayer);
      el('path', { d: wedgePath(mid - step / 2 + gap, mid + step / 2 - gap) }, g);
      const x = Math.sin(mid) * R_ICON, y = -Math.cos(mid) * R_ICON;
      el('text', { x, y: y - 8, class: 'radial-icon' }, g).textContent = item.icon;
      const label = el('text', { x, y: y + 44, class: 'radial-label' }, g);
      item.label.split('\n').forEach((line, k) => {
        el('tspan', { x, dy: k === 0 ? 0 : 34 }, label).textContent = line;
      });
      if (item.children) el('text', { x, y: y + 44 + 34 * item.label.split('\n').length, class: 'radial-more' }, g).textContent = '• • •';
      return g;
    });
    caption.innerHTML = stack.length > 1
      ? `<span class="btn cross">✕</span> Choose <span class="btn circle">○</span> Back`
      : `<span class="pill">R</span> Aim <span class="btn cross">✕</span> Choose <span class="btn circle">○</span> Close`;
    select(-1);
  }

  function select(i) {
    selected = i;
    wedges.forEach((w, k) => w.classList.toggle('selected', k === i));
    const menu = current();
    const item = i >= 0 ? menu.items[i] : null;
    hubTitle.textContent = item ? item.label.replace('\n', ' ') : menu.title;
    hubDesc.textContent = '';
    wrap(item ? item.desc : menu.hint || 'Aim with the right stick', 21).slice(0, 4).forEach((line, k) => {
      el('tspan', { x: 0, dy: k === 0 ? 0 : 33 }, hubDesc).textContent = line;
    });
    hubCost.textContent = item && item.cost ? item.cost : '';
  }

  radial.open = (menu, owner) => {
    stack = [menu];
    radial.isOpen = true;
    radial.owner = owner;
    container.hidden = false;
    render();
  };

  radial.close = () => {
    radial.isOpen = false;
    radial.owner = null;
    container.hidden = true;
  };

  /** Feed one frame of input. Returns true if an action fired (wheel closes itself). */
  radial.update = (pad) => {
    if (!radial.isOpen) return false;
    const menu = current();
    const mag = Math.hypot(pad.rx, pad.ry);
    if (mag > 0.55) {
      const n = menu.items.length;
      let a = Math.atan2(pad.rx, -pad.ry); // 0 = up, clockwise
      if (a < 0) a += Math.PI * 2;
      const i = Math.round(a / ((Math.PI * 2) / n)) % n;
      if (i !== selected) select(i);
    }
    if (pad.pressed.cross && selected >= 0) {
      const item = menu.items[selected];
      if (item.children) { stack.push({ title: item.label.replace('\n', ' '), hint: item.desc, items: item.children }); render(); return false; }
      radial.close();
      if (item.action) item.action();
      return true;
    }
    if (pad.pressed.circle) {
      if (stack.length > 1) { stack.pop(); render(); } else radial.close();
    }
    return false;
  };

  return radial;
}
