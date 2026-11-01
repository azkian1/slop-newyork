// Grok Bot mascot: a glossy white ball, grey toward the lower-left, highlight up high,
// two black tilted pills toward the upper-right. Eyes sit on local +Z; the body turns toward the camera.

import * as THREE from 'three/webgpu';
import { Fn, float, vec3, normalize, normalView, dot, max, pow, mix, smoothstep, clamp } from 'three/tsl';

export const BOT_RADIUS = 1.5;

function grokSurface() {
  const mat = new THREE.MeshBasicNodeMaterial();
  mat.toneMapped = false;
  mat.colorNode = Fn(() => {
    const n = normalize(normalView);
    const light = normalize(vec3(0.05, 0.72, 0.69));
    const ndl = max(dot(n, light), float(0));
    const lowerLeft = max(dot(n, normalize(vec3(-0.55, -0.7, 0.45))), float(0));
    const body = mix(vec3(0.78, 0.79, 0.81), vec3(0.97, 0.97, 0.98), pow(clamp(ndl, float(0), float(1)), float(0.85)));
    const shade = vec3(0.62, 0.63, 0.66).mul(smoothstep(float(0.15), float(0.85), lowerLeft)).mul(float(1).sub(ndl));
    const blob = smoothstep(float(0.78), float(0.98), ndl);
    const hi = vec3(1, 1, 1).mul(blob).mul(0.85);
    const facing = clamp(n.z, float(0), float(1));
    const rim = vec3(1, 1, 1).mul(smoothstep(float(0.62), float(0.95), float(1).sub(facing))).mul(0.28);
    return body.sub(shade).add(hi).add(rim);
  })();
  return mat;
}

export function makeBot() {
  const g = new THREE.Group();
  g.name = 'GrokBot';
  g.userData.drop = true;
  const body = new THREE.Mesh(new THREE.SphereGeometry(BOT_RADIUS, 48, 32), grokSurface());
  body.userData.drop = true;
  const eyeGeo = new THREE.CapsuleGeometry(0.13, 0.42, 4, 12);
  const ink = new THREE.MeshBasicMaterial({ color: 0x141414 });
  ink.toneMapped = false;
  const eyeY = 0.38;
  for (const x of [0.22, 0.62]) {
    const eye = new THREE.Mesh(eyeGeo, ink);
    const surface = Math.sqrt(Math.max(0.04, BOT_RADIUS * BOT_RADIUS - x * x - eyeY * eyeY));
    eye.position.set(x, eyeY, surface + 0.06);
    eye.rotation.z = -0.22;
    eye.userData.drop = true;
    eye.renderOrder = 2;
    g.add(eye);
  }
  g.add(body);
  return g;
}
