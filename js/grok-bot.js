// Grok Bot mascot: a glossy black ball, highlight upper-left, violet rim on the right,
// two white vertical pills for eyes. Shading is in view space so the logo reads the same
// from the street. Eyes sit on local +Z; the body is turned toward the camera each frame.

import * as THREE from 'three/webgpu';
import { Fn, float, vec3, normalize, normalView, dot, max, pow, mix, smoothstep, clamp } from 'three/tsl';

export const BOT_RADIUS = 1.5;

function grokSurface() {
  const mat = new THREE.MeshBasicNodeMaterial();
  mat.toneMapped = false;
  mat.colorNode = Fn(() => {
    const n = normalize(normalView);
    const light = normalize(vec3(-0.62, 0.62, 0.48));
    const ndl = max(dot(n, light), float(0));
    const body = mix(vec3(0.012, 0.012, 0.016), vec3(0.17, 0.17, 0.18), pow(clamp(ndl.mul(0.55), float(0), float(1)), float(1.2)));
    const blob = smoothstep(float(0.9), float(0.995), ndl);
    const hi = vec3(0.86, 0.87, 0.9).mul(blob);
    const facing = clamp(n.z, float(0), float(1));
    const grazing = smoothstep(float(0.45), float(0.92), float(1).sub(facing));
    const right = smoothstep(float(0.2), float(0.9), n.x);
    const rim = vec3(0.76, 0.66, 0.98).mul(right).mul(grazing).mul(0.95);
    return body.add(hi).add(rim);
  })();
  return mat;
}

export function makeBot() {
  const g = new THREE.Group();
  g.name = 'GrokBot';
  g.userData.drop = true;
  const body = new THREE.Mesh(new THREE.SphereGeometry(BOT_RADIUS, 48, 32), grokSurface());
  body.userData.drop = true;
  const eyeGeo = new THREE.CapsuleGeometry(0.11, 0.36, 4, 12);
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  white.toneMapped = false;
  const eyeY = 0.06;
  for (const x of [0.14, 0.48]) {
    const eye = new THREE.Mesh(eyeGeo, white);
    const surface = Math.sqrt(Math.max(0.04, BOT_RADIUS * BOT_RADIUS - x * x - eyeY * eyeY));
    eye.position.set(x, eyeY, surface + 0.07);
    eye.userData.drop = true;
    eye.renderOrder = 2;
    g.add(eye);
  }
  g.add(body);
  return g;
}
