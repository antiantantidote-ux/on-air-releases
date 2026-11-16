// Orbit camera rig. The hand roams freely inside a deadzone around the focus point;
// push past it and the camera glides after you. Right stick orbits (X) and pitches (Y).
import * as THREE from './three.js';
import { clamp, lerp } from './noise.js';

const DEADZONE = 9;          // world units the hand may stray before the camera follows
const YAW_SPEED = 2.0;       // rad/s at full deflection
const PITCH_SPEED = 1.1;
const PITCH_MIN = 0.32, PITCH_MAX = 1.3;

export function createCameraRig(terrain) {
  const camera = new THREE.PerspectiveCamera(46, 16 / 9, 1, 1400);
  const rig = {
    camera,
    focus: new THREE.Vector3(),
    yaw: 0.6,
    pitch: 0.78,
    /** Unit vectors on the ground plane, for camera-relative hand movement. */
    forward: new THREE.Vector2(0, -1),
    right: new THREE.Vector2(1, 0),
  };
  const lookAt = new THREE.Vector3();
  let shake = 0;

  rig.resize = (w, h) => { camera.aspect = w / h; camera.updateProjectionMatrix(); };
  rig.addShake = (amount) => { shake = Math.min(1.5, shake + amount); };

  /** Triangle button: cut straight to a point of interest. */
  rig.snapTo = (x, z) => {
    rig.focus.set(x, terrain.surfaceAt(x, z), z);
  };

  rig.update = (dt, stick, handPos, orbitEnabled) => {
    if (orbitEnabled) {
      rig.yaw -= stick.rx * YAW_SPEED * dt;
      rig.pitch = clamp(rig.pitch - stick.ry * PITCH_SPEED * dt, PITCH_MIN, PITCH_MAX);
    }
    rig.forward.set(-Math.sin(rig.yaw), -Math.cos(rig.yaw));
    rig.right.set(Math.cos(rig.yaw), -Math.sin(rig.yaw));

    // Deadzone follow.
    const dx = handPos.x - rig.focus.x, dz = handPos.z - rig.focus.z;
    const d = Math.hypot(dx, dz);
    if (d > DEADZONE) {
      const pull = (1 - DEADZONE / d) * (1 - Math.exp(-7 * dt));
      rig.focus.x += dx * pull;
      rig.focus.z += dz * pull;
    }
    rig.focus.y = lerp(rig.focus.y, terrain.surfaceAt(rig.focus.x, rig.focus.z), 1 - Math.exp(-3 * dt));

    // Looking steeply down pulls the camera in; shallow angles pull back for vistas.
    const t = (rig.pitch - PITCH_MIN) / (PITCH_MAX - PITCH_MIN);
    const dist = lerp(78, 58, t);
    const cp = Math.cos(rig.pitch);
    camera.position.set(
      rig.focus.x + Math.sin(rig.yaw) * cp * dist,
      rig.focus.y + Math.sin(rig.pitch) * dist,
      rig.focus.z + Math.cos(rig.yaw) * cp * dist
    );
    // Never let a hillside swallow the camera.
    const floor = terrain.surfaceAt(camera.position.x, camera.position.z) + 4;
    if (camera.position.y < floor) camera.position.y = floor;

    if (shake > 0.001) {
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake;
      shake *= Math.exp(-9 * dt);
    }
    lookAt.copy(rig.focus);
    lookAt.y += 3;
    camera.lookAt(lookAt);
  };

  return rig;
}
