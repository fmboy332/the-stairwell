// face.js — SCP-087-1 stand-in: an ORIGINAL procedural face (no pupils, no nose, no mouth).
// Not derived from the wiki photo; drawn entirely in code.
import * as THREE from '../vendor/three.module.min.js';

export function drawFace(g, w, h, t = 0) {
  g.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h * 0.5, rx = w * 0.3, ry = h * 0.42;
  // soft pale oval fading into darkness
  const body = g.createRadialGradient(cx, cy - ry * 0.1, rx * 0.2, cx, cy, ry * 1.05);
  body.addColorStop(0, 'rgba(232,226,214,1)');
  body.addColorStop(0.55, 'rgba(198,190,176,0.97)');
  body.addColorStop(0.85, 'rgba(120,112,100,0.6)');
  body.addColorStop(1, 'rgba(0,0,0,0)');
  g.save(); g.translate(cx, cy); g.scale(1, ry / rx); g.translate(-cx, -cy);
  g.fillStyle = body; g.beginPath(); g.arc(cx, cy, rx * 1.05, 0, Math.PI * 2); g.fill(); g.restore();
  // subtle brow / cheek shading
  const shade = (x, y, r, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(60,52,44,${a})`); gr.addColorStop(1, 'rgba(60,52,44,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); };
  shade(cx, cy + ry * 0.35, rx * 0.7, 0.18);
  shade(cx - rx * 0.55, cy + ry * 0.1, rx * 0.35, 0.2);
  shade(cx + rx * 0.55, cy + ry * 0.1, rx * 0.35, 0.2);
  // eye sockets: deep, empty, no pupils
  const eye = (x) => {
    const gr = g.createRadialGradient(x, cy - ry * 0.12, 0, x, cy - ry * 0.12, rx * 0.34);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.95)');
    gr.addColorStop(0.8, 'rgba(25,18,14,0.5)'); gr.addColorStop(1, 'rgba(25,18,14,0)');
    g.save(); g.translate(x, cy - ry * 0.12); g.scale(1, 1.25 + 0.03 * Math.sin(t)); g.translate(-x, -(cy - ry * 0.12));
    g.fillStyle = gr; g.beginPath(); g.arc(x, cy - ry * 0.12, rx * 0.34, 0, Math.PI * 2); g.fill(); g.restore();
  };
  eye(cx - rx * 0.4); eye(cx + rx * 0.4);
  // skin grain
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] < 8) continue;
    const n = (Math.random() - 0.5) * 22; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

let _cached = null;
export function faceCanvas() { // drawn once, reused (jumpscare uses CSS transforms only)
  if (_cached) return _cached;
  _cached = document.createElement('canvas'); _cached.width = 512; _cached.height = 640;
  drawFace(_cached.getContext('2d'), 512, 640); return _cached;
}

export class Face {
  constructor(scene) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 320;
    drawFace(c.getContext('2d'), c.width, c.height);
    this.tex = new THREE.CanvasTexture(c); this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mat = new THREE.MeshLambertMaterial({ map: this.tex, transparent: true, depthWrite: false,
      emissive: 0xffffff, emissiveMap: this.tex, emissiveIntensity: 0.06, side: THREE.DoubleSide, fog: true });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.78), this.mat);
    this.mesh.visible = false; this.mesh.renderOrder = 5;
    scene.add(this.mesh);
    this.hideAt = 0;
  }
  get visible() { return this.mesh.visible; }
  get position() { return this.mesh.position; }
  show(pos, glow = 0.06, hideAfterMs = 0, { noFog = false } = {}) {
    if (this.mat.fog === noFog) { this.mat.fog = !noFog; this.mat.needsUpdate = true; } // deep in the shaft it ignores the fog
    this.mesh.position.copy(pos); this.mat.emissiveIntensity = glow; this.mesh.visible = true;
    this.hideAt = hideAfterMs ? performance.now() + hideAfterMs : 0;
  }
  hide() { this.mesh.visible = false; this.hideAt = 0; }
  update(camera) {
    if (!this.mesh.visible) return;
    this.mesh.lookAt(camera.position);
    if (this.hideAt && performance.now() > this.hideAt) this.hide();
  }
  // how directly the camera is looking at the face (1 = dead centre)
  lookDot(camera) {
    const dir = new THREE.Vector3().subVectors(this.mesh.position, camera.position).normalize();
    const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
    return fwd.dot(dir);
  }
}
