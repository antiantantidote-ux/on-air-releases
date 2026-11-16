// Caribbean water: one draw call. Gerstner-ish vertex waves, depth tint and animated
// shore foam driven by the island height texture (no depth pre-pass, no render
// targets — cheap enough for Mali/Adreno TV chipsets).
import * as THREE from './three.js';
import { WORLD } from './terrain.js';

export function createWater(terrain, env, fog) {
  const geometry = new THREE.PlaneGeometry(1400, 1400, 140, 140);
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uHeightMap: { value: terrain.heightTexture },
      uWorldSize: { value: WORLD.size },
      uShallow: { value: new THREE.Color(0x3fe0d0) },
      uDeep: { value: new THREE.Color(0x0b4f8a) },
      uSky: { value: env.horizon },
      uZenith: { value: env.zenith },
      uLightDir: { value: env.lightDir },
      uLightColor: { value: env.lightColor },
      uDaylight: { value: 1 },
      uFogColor: { value: fog.color },
      uFogNear: { value: fog.near },
      uFogFar: { value: fog.far },
    },
    vertexShader: /* glsl */ `
      uniform float uTime, uWorldSize;
      uniform sampler2D uHeightMap;
      varying vec3 vWorld;
      varying float vDepth;
      varying float vFogDepth;

      float seabed(vec2 xz) {
        return textureLod(uHeightMap, xz / uWorldSize + 0.5, 0.0).r;
      }
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        float depth = -seabed(w.xz);
        float calm = smoothstep(0.0, 6.0, depth); // waves die down on the beach
        float t = uTime;
        w.y += calm * (
          sin(w.x * 0.11 + t * 1.1) * 0.28 +
          sin(w.z * 0.15 - t * 0.9 + w.x * 0.05) * 0.22 +
          sin((w.x + w.z) * 0.31 + t * 1.7) * 0.07);
        vWorld = w.xyz;
        vDepth = depth;
        vec4 mv = viewMatrix * w;
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime, uDaylight, uFogNear, uFogFar;
      uniform vec3 uShallow, uDeep, uSky, uZenith, uLightDir, uLightColor, uFogColor;
      varying vec3 vWorld;
      varying float vDepth;
      varying float vFogDepth;

      void main() {
        float t = uTime;
        vec2 p = vWorld.xz;
        // analytic normal: derivative of the vertex waves + finer ripples
        float dx = cos(p.x * 0.11 + t * 1.1) * 0.031 + cos(p.y * 0.15 - t * 0.9 + p.x * 0.05) * 0.011
                 + cos((p.x + p.y) * 0.31 + t * 1.7) * 0.022
                 + cos(p.x * 0.9 + p.y * 0.4 + t * 2.3) * 0.05 + cos(p.x * 1.7 - p.y * 1.1 - t * 2.9) * 0.03;
        float dz = cos(p.y * 0.15 - t * 0.9 + p.x * 0.05) * 0.033
                 + cos((p.x + p.y) * 0.31 + t * 1.7) * 0.022
                 + cos(p.y * 1.1 - p.x * 0.5 + t * 2.1) * 0.05 + cos(p.x * 1.7 - p.y * 1.1 - t * 2.9) * -0.02;
        vec3 n = normalize(vec3(-dx, 1.0, -dz));
        vec3 v = normalize(cameraPosition - vWorld);

        float depthT = smoothstep(0.0, 8.0, vDepth);
        vec3 col = mix(uShallow, uDeep, depthT) * (0.25 + 0.75 * uDaylight);
        col *= 0.75 + 0.25 * max(dot(n, uLightDir), 0.0);

        float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        col = mix(col, mix(uSky, uZenith, 0.35), fres * 0.65);

        vec3 h = normalize(uLightDir + v);
        col += uLightColor * pow(max(dot(n, h), 0.0), 180.0) * (0.15 + 1.15 * uDaylight);

        // two foam bands lapping at the shoreline
        float lap = sin(vDepth * 3.2 - t * 1.6 + sin(p.x * 0.3) + cos(p.y * 0.27)) * 0.5 + 0.5;
        float foam = (1.0 - smoothstep(0.0, 0.55, vDepth)) + (1.0 - smoothstep(0.0, 1.9, vDepth)) * step(0.72, lap) * 0.8;
        col = mix(col, vec3(1.0) * (0.35 + 0.65 * uDaylight), clamp(foam, 0.0, 1.0) * 0.85);

        float fogF = smoothstep(uFogNear, uFogFar, vFogDepth);
        col = mix(col, uFogColor, fogF);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'water';
  mesh.frustumCulled = false;

  return {
    mesh,
    update(time, env, focus) {
      material.uniforms.uTime.value = time;
      material.uniforms.uDaylight.value = env.daylight;
      // keep the dense part of the grid under the camera, snapped so waves don't swim
      mesh.position.set(Math.round(focus.x / 10) * 10, WORLD.seaLevel, Math.round(focus.z / 10) * 10);
    },
  };
}
