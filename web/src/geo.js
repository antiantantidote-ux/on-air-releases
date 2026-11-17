// Low-poly geometry helpers: every model in the game is built from primitives,
// painted with vertex colours and merged so it costs a single draw call.
import * as THREE from './three.js';

const _c = new THREE.Color();

/** Paint a whole geometry one colour (optionally a vertical gradient to fake baked AO). */
export function paint(geometry, hex, bottomShade = 1) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.deleteAttribute('uv');
  g.computeVertexNormals(); // non-indexed => faceted, low-poly shading
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  g.computeBoundingBox();
  const y0 = g.boundingBox.min.y;
  const span = Math.max(1e-5, g.boundingBox.max.y - y0);
  _c.set(hex);
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - y0) / span;
    const s = bottomShade + (1 - bottomShade) * t;
    col[i * 3] = _c.r * s;
    col[i * 3 + 1] = _c.g * s;
    col[i * 3 + 2] = _c.b * s;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Translate / rotate / scale a geometry in place and return it (chainable). */
export function place(geometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    typeof s === 'number' ? new THREE.Vector3(s, s, s) : s
  );
  geometry.applyMatrix4(m);
  return geometry;
}

/** Merge painted, non-indexed geometries (position + normal + color) into one. */
export function merge(geometries) {
  let total = 0;
  for (const g of geometries) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let o = 0;
  for (const g of geometries) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, o);
    nor.set(g.attributes.normal.array, o);
    col.set(g.attributes.color.array, o);
    o += g.attributes.position.count * 3;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

/** Shared material for everything vertex-coloured. One material = fewer state changes. */
export const vertexLit = new THREE.MeshLambertMaterial({ vertexColors: true });

/** Island mood, -1 (ruthless: ashen, drained) .. +1 (benevolent: lush, saturated). */
export const morph = { value: 0 };
vertexLit.onBeforeCompile = (shader) => {
  shader.uniforms.uMorph = morph;
  shader.fragmentShader = 'uniform float uMorph;\n' + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
    {
      float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
      vec3 ash = mix(diffuseColor.rgb, vec3(lum) * vec3(0.78, 0.64, 0.6), 0.8);
      vec3 lush = mix(vec3(lum), diffuseColor.rgb, 1.2) * vec3(1.0, 1.05, 1.0);
      diffuseColor.rgb = uMorph < 0.0 ? mix(diffuseColor.rgb, ash, -uMorph) : mix(diffuseColor.rgb, max(lush, 0.0), uMorph);
    }`);
};
