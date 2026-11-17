// Day/night cycle: sun + moon directional light, hemisphere ambient, gradient sky dome
// and fog. Everything downstream (water, HUD clock) reads from the `env` object.
import * as THREE from './three.js';
import { clamp, smoothstep } from './noise.js';

const C = (hex) => new THREE.Color(hex);
const PAL = {
  dayZenith: C(0x2b8fe0), dayHorizon: C(0xbfe8f5),
  duskHorizon: C(0xff9a57), duskZenith: C(0x5a4a9c),
  nightZenith: C(0x050a1c), nightHorizon: C(0x16264a),
  sunDay: C(0xfff3d6), sunDusk: C(0xff9d5c), moon: C(0x8fb0ff),
  groundDay: C(0x6f7f55), groundNight: C(0x10151f),
};

const DAY_LENGTH_SECONDS = 360; // one island day at 1x speed

export function createSky(scene) {
  const env = {
    hour: 9,                 // 0..24
    day: 1,
    sunDir: new THREE.Vector3(0, 1, 0),   // towards the sun
    lightDir: new THREE.Vector3(0, 1, 0), // towards whichever body is lighting the scene
    lightColor: new THREE.Color(),
    zenith: new THREE.Color(),
    horizon: new THREE.Color(),
    daylight: 1,             // 0 night .. 1 day
    morph: 0,                // island mood from morality.js: -1 smog .. +1 golden
  };

  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
  scene.add(sun, sun.target, hemi);
  scene.fog = new THREE.Fog(0xbfe8f5, 170, 560);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(600, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uZenith: { value: env.zenith },
        uHorizon: { value: env.horizon },
        uSunDir: { value: env.sunDir },
        uSunColor: { value: new THREE.Color() },
        uNight: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * p;
          gl_Position.z = gl_Position.w; // always at the far plane
        }`,
      fragmentShader: /* glsl */ `
        precision mediump float;
        uniform vec3 uZenith, uHorizon, uSunDir, uSunColor;
        uniform float uNight;
        varying vec3 vDir;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          vec3 d = normalize(vDir);
          float t = pow(clamp(d.y * 1.15 + 0.08, 0.0, 1.0), 0.55);
          vec3 col = mix(uHorizon, uZenith, t);
          float s = max(dot(d, uSunDir), 0.0);
          col += uSunColor * (pow(s, 600.0) * 4.0 + pow(s, 12.0) * 0.28);
          float m = max(dot(d, -uSunDir), 0.0);
          col += vec3(0.75, 0.85, 1.0) * pow(m, 900.0) * 3.0 * uNight;
          vec2 g = floor(d.xz / max(d.y, 0.05) * 70.0);
          float star = step(0.9965, hash(g)) * smoothstep(0.05, 0.4, d.y);
          col += vec3(star) * uNight;
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    })
  );
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  scene.add(dome);

  const tmpA = new THREE.Color(), tmpB = new THREE.Color();

  function apply(focus) {
    // The sun rises at 06:00 in the east (+x), peaks at noon, sets at 18:00.
    const a = ((env.hour - 6) / 24) * Math.PI * 2;
    env.sunDir.set(Math.cos(a), Math.sin(a), 0.38).normalize();
    const e = env.sunDir.y;
    const day = smoothstep(-0.12, 0.22, e);
    const twilight = clamp(1 - Math.abs(e) / 0.32, 0, 1);
    env.daylight = day;

    env.zenith.copy(PAL.nightZenith).lerp(PAL.dayZenith, day).lerp(PAL.duskZenith, twilight * 0.45);
    env.horizon.copy(PAL.nightHorizon).lerp(PAL.dayHorizon, day).lerp(PAL.duskHorizon, twilight * 0.8);

    // Alignment: ruthless rule chokes the sky with volcanic smog, benevolence gilds it.
    const ruth = Math.max(0, -env.morph), bene = Math.max(0, env.morph);
    if (ruth > 0) {
      env.zenith.lerp(tmpB.set(0x3a2c2a), ruth * 0.75 * (0.35 + 0.65 * day));
      env.horizon.lerp(tmpB.set(0xa85a34), ruth * 0.7 * (0.3 + 0.7 * day));
    } else if (bene > 0) {
      env.horizon.lerp(tmpB.set(0xffeec2), bene * 0.3 * day);
    }
    scene.fog.near = 170 - 95 * ruth;
    scene.fog.far = 560 - 230 * ruth;

    const sunUp = e > -0.05;
    env.lightDir.copy(env.sunDir);
    if (!sunUp) env.lightDir.multiplyScalar(-1);
    if (env.lightDir.y < 0.12) { env.lightDir.y = 0.12; env.lightDir.normalize(); }
    tmpA.copy(PAL.sunDusk).lerp(PAL.sunDay, smoothstep(0.05, 0.45, e));
    env.lightColor.copy(sunUp ? tmpA : PAL.moon);

    sun.color.copy(env.lightColor);
    sun.intensity = (sunUp ? 0.5 + 2.1 * smoothstep(-0.05, 0.35, e) : 0.42) * (1 - 0.3 * ruth + 0.12 * bene);
    if (sunUp) sun.color.lerp(tmpB.set(ruth > 0 ? 0xff7a4a : 0xffe7a8), ruth > 0 ? ruth * 0.55 : bene * 0.5);
    sun.position.copy(focus).addScaledVector(env.lightDir, 200);
    sun.target.position.copy(focus);

    hemi.color.copy(env.zenith).lerp(tmpB.set(0xffffff), 0.45);
    hemi.groundColor.copy(PAL.groundNight).lerp(PAL.groundDay, day);
    hemi.intensity = 0.38 + 0.82 * day;

    scene.fog.color.copy(env.horizon);
    dome.position.copy(focus);
    dome.material.uniforms.uSunColor.value.copy(tmpA).multiplyScalar(smoothstep(-0.12, 0.05, e));
    dome.material.uniforms.uNight.value = 1 - day;
  }

  return {
    env,
    update(dt, focus) {
      env.hour += (dt / DAY_LENGTH_SECONDS) * 24;
      while (env.hour >= 24) { env.hour -= 24; env.day++; }
      apply(focus);
    },
    /** Miracle hook: wrench the sun to a given hour. */
    setHour(h) {
      if (h < env.hour) env.day++;
      env.hour = h;
    },
    clockText() {
      const h = Math.floor(env.hour), m = Math.floor((env.hour - h) * 60);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    },
  };
}
