// World-space status icons and progress bars: every floating emoji and bar in the
// game is one instanced, camera-facing quad in a single draw call, sampling an emoji
// atlas that is rasterised once at boot.
import * as THREE from './three.js';

const EMOJI = ['👷', '⛔', '📦', '🏗️', '🍌', '🤒', '🏚️', '🙏', '✊', '💤', '✨', '💰', '🚢', '❓', '🧱', '⚡',
  '❤️', '💢', '💧', '🎵', '📣', '😈', '💥', '😱', '⚽', '🐾', '🚩'];
const GRID = 6, CELL = 96, CAPACITY = 192;

export function createIcons(scene) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = GRID * CELL;
  const ctx = canvas.getContext('2d');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${CELL * 0.62}px "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  EMOJI.forEach((e, i) => {
    const cx = (i % GRID) * CELL + CELL / 2, cy = Math.floor(i / GRID) * CELL + CELL / 2;
    ctx.fillStyle = 'rgba(18,24,38,0.88)';
    ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.46, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = '#ffd34d'; ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillText(e, cx, cy + CELL * 0.04);
  });
  const atlas = new THREE.CanvasTexture(canvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.flipY = false;

  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const iPos = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const iData = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('iPos', iPos);
  geometry.setAttribute('iData', iData); // size, atlas cell (or -1 = bar), bar fill
  geometry.instanceCount = 0;

  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { uAtlas: { value: atlas }, uGrid: { value: GRID } },
    vertexShader: /* glsl */ `
      attribute vec3 iPos; attribute vec3 iData;
      uniform float uGrid;
      varying vec2 vUv; varying vec2 vQuad; varying float vCell; varying float vFill;
      void main() {
        vCell = iData.y; vFill = iData.z; vQuad = uv;
        float cx = mod(iData.y, uGrid), cy = floor(iData.y / uGrid);
        vUv = (vec2(cx, cy) + uv) / uGrid;
        vec4 mv = viewMatrix * vec4(iPos, 1.0);
        vec2 scale = vec2(iData.x, iData.y < 0.0 ? iData.x * 0.16 : iData.x);
        mv.xy += position.xy * scale;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      precision mediump float;
      uniform sampler2D uAtlas;
      varying vec2 vUv; varying vec2 vQuad; varying float vCell; varying float vFill;
      void main() {
        vec4 c;
        if (vCell < 0.0) {
          bool border = vQuad.x < 0.03 || vQuad.x > 0.97 || vQuad.y < 0.16 || vQuad.y > 0.84;
          vec3 fill = mix(vec3(1.0, 0.72, 0.1), vec3(0.3, 0.95, 0.35), step(0.999, vFill));
          c = vec4(border ? vec3(0.02, 0.03, 0.06) : (vQuad.x < vFill ? fill : vec3(0.16, 0.19, 0.27)), 0.95);
        } else {
          c = texture2D(uAtlas, vUv);
          if (c.a < 0.05) discard;
        }
        gl_FragColor = c;
        #include <colorspace_fragment>
      }`,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'icons';
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  scene.add(mesh);

  let n = 0;
  function push(x, y, z, size, cell, fill) {
    if (n >= CAPACITY) return;
    iPos.setXYZ(n, x, y, z);
    iData.setXYZ(n, size, cell, fill);
    n++;
  }

  return {
    begin() { n = 0; },
    add(x, y, z, size, emoji) { const i = EMOJI.indexOf(emoji); if (i >= 0) push(x, y, z, size, i, 0); },
    bar(x, y, z, width, fill) { push(x, y, z, width, -1, Math.max(0, Math.min(1, fill))); },
    end() {
      geometry.instanceCount = n;
      mesh.visible = n > 0;
      iPos.needsUpdate = true; iData.needsUpdate = true;
    },
  };
}
