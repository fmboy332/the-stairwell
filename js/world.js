// world.js — procedural, endlessly recycled SCP-087-style stairwell (Mochi).
// Canon: 13 steps per flight at ~38deg, semicircular landing ~3 m across, 180deg turn each landing.
import * as THREE from '../vendor/three.module.min.js';

export const RISE = 0.18;               // step rise (m)
export const RUN = 0.23;                // step run (m)  -> atan(0.18/0.23) ~ 38deg
export const STEPS = 13;
export const FLIGHT_DROP = STEPS * RISE; // 2.34 m
export const SEG_H = 2 * FLIGHT_DROP;    // one segment = 2 flights + 2 landings = 4.68 m
export const L = STEPS * RUN;            // flight length 2.99 m
export const W = 1.5;                    // outer half-width (landing radius 1.5 -> 3 m across)
export const S = 0.4;                    // half-width of the open central shaft
const POOL = 9;                          // segments alive at once (recycled)

function concreteTexture(seed = 1, edge = false) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  let s = seed * 9301 + 49297; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  g.fillStyle = '#8f8b84'; g.fillRect(0, 0, 256, 256);
  const img = g.getImageData(0, 0, 256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * 38;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 26; i++) { // water stains / grime
    const x = rnd() * 256, y = rnd() * 256, r = 10 + rnd() * 50;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(30,26,20,${0.12 + rnd() * 0.25})`); gr.addColorStop(1, 'rgba(30,26,20,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.strokeStyle = 'rgba(20,18,15,0.35)'; g.lineWidth = 1;
  for (let i = 0; i < 6; i++) { // cracks
    g.beginPath(); let x = rnd() * 256, y = rnd() * 256; g.moveTo(x, y);
    for (let k = 0; k < 8; k++) { x += (rnd() - 0.5) * 30; y += rnd() * 20; g.lineTo(x, y); }
    g.stroke();
  }
  if (edge) { // worn, darker step edges so treads read when looking down the flight
    g.strokeStyle = 'rgba(15,13,10,0.75)'; g.lineWidth = 10; g.strokeRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(15,13,10,0.3)'; g.lineWidth = 26; g.strokeRect(0, 0, 256, 256);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- analytic collision model (cheap, exact for this layout) ----------
// Floor height of segment k at (x,z), or -Infinity if no floor (shaft).
function segFloor(k, x, z) {
  const y0 = -k * SEG_H;
  if (z <= 0) return y0;                       // landing L0
  if (z >= L) return y0 - FLIGHT_DROP;         // landing L1
  if (x < -S) return y0 - (Math.min(STEPS - 1, Math.floor(z / RUN)) + 1) * RISE;               // flight A (+z, down)
  if (x > S) return y0 - FLIGHT_DROP - (Math.min(STEPS - 1, Math.floor((L - z) / RUN)) + 1) * RISE; // flight B (-z, down)
  return -Infinity;
}
// Highest walkable surface at (x,z) not more than `up` above feet height y.
export function floorAt(x, z, y, up = 0.4) {
  const kc = Math.floor(-y / SEG_H);
  let best = -Infinity;
  for (let k = Math.max(0, kc - 1); k <= kc + 2; k++) {
    const f = segFloor(k, x, z);
    if (f <= y + up && f > best) best = f;
  }
  return best;
}
// True if the point (x,z) at feet height y is inside a wall for a body of radius r.
export function blocked(x, z, y, r = 0.25) {
  // outer walls: rectangle with semicircular ends
  if (z < 0) { if (Math.hypot(x, z) > W - r) return true; }
  else if (z > L) { if (Math.hypot(x, z - L) > W - r) return true; }
  else if (Math.abs(x) > W - r) return true;
  // central shaft + railings: rectangle [-S,S]x[0,L] inflated by r
  const rr = Math.min(r, 0.14); // the railing is waist-high: you can stand right against it and lean over
  if (z > -rr && z < L + rr && Math.abs(x) < S + rr) {
    const cz = Math.min(Math.max(z, 0), L), cx = Math.min(Math.max(x, -S), S);
    if (Math.hypot(x - cx, z - cz) < rr) return true;
  }
  // top of the world: the sealed door landing; no flight leads further up
  if (y > -0.6 && z > 0.05 && x > -S - r) return true;
  return false;
}

// ---------- geometry ----------
export class Stairwell {
  constructor(scene) {
    this.scene = scene;
    const tex = concreteTexture(3, true);
    const floorTex = concreteTexture(5);
    tex.repeat.set(1, 1);
    const wallTex = concreteTexture(7); wallTex.repeat.set(2, 3);
    this.matStep = new THREE.MeshLambertMaterial({ map: tex, color: 0xe0dcd2 });
    this.matWall = new THREE.MeshLambertMaterial({ map: wallTex, color: 0xcfcbc2, side: THREE.DoubleSide });
    this.matFloor = new THREE.MeshLambertMaterial({ map: floorTex, color: 0xe0dcd2 });
    this.matRail = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
    this.template = this._buildSegment();
    this.segments = [];
    for (let i = 0; i < POOL; i++) {
      const g = this.template.clone(true);
      g.userData.k = -999; scene.add(g); this.segments.push(g);
    }
    this._buildTop();
    this.update(0);
  }

  _buildSegment() {
    const grp = new THREE.Group();
    const m4 = new THREE.Matrix4();
    // 26 treads as one InstancedMesh (1 draw call per segment)
    const stepGeo = new THREE.BoxGeometry(W - S, RISE, RUN);
    const steps = new THREE.InstancedMesh(stepGeo, this.matStep, STEPS * 2);
    const cx = (W + S) / 2;
    for (let i = 0; i < STEPS; i++) {
      m4.makeTranslation(-cx, -(i + 1) * RISE - RISE / 2, (i + 0.5) * RUN); steps.setMatrixAt(i, m4);
      m4.makeTranslation(cx, -FLIGHT_DROP - (i + 1) * RISE - RISE / 2, L - (i + 0.5) * RUN); steps.setMatrixAt(STEPS + i, m4);
    }
    grp.add(steps);
    // sloped slabs under each flight (visible from below / across the shaft)
    const hyp = Math.hypot(L, FLIGHT_DROP), ang = Math.atan2(FLIGHT_DROP, L);
    const slabGeo = new THREE.BoxGeometry(W - S, 0.16, hyp);
    const slabA = new THREE.Mesh(slabGeo, this.matStep);
    slabA.position.set(-cx, -FLIGHT_DROP / 2 - 0.3, L / 2); slabA.rotation.x = ang; grp.add(slabA);
    const slabB = new THREE.Mesh(slabGeo, this.matStep);
    slabB.position.set(cx, -FLIGHT_DROP * 1.5 - 0.3, L / 2); slabB.rotation.x = -ang; grp.add(slabB);
    // semicircular landings
    const l0 = new THREE.Mesh(new THREE.CylinderGeometry(W, W, 0.25, 24, 1, false, Math.PI / 2, Math.PI), this.matFloor);
    l0.position.set(0, -0.125, 0); grp.add(l0);
    const l1 = new THREE.Mesh(new THREE.CylinderGeometry(W, W, 0.25, 24, 1, false, -Math.PI / 2, Math.PI), this.matFloor);
    l1.position.set(0, -FLIGHT_DROP - 0.125, L); grp.add(l1);
    // walls: straight sides + curved ends, covering one segment height (tiles seamlessly)
    const wy = -SEG_H / 2 + 2.6;
    const side = new THREE.BoxGeometry(0.1, SEG_H, L);
    const wl = new THREE.Mesh(side, this.matWall); wl.position.set(-W - 0.05, wy, L / 2); grp.add(wl);
    const wr = new THREE.Mesh(side, this.matWall); wr.position.set(W + 0.05, wy, L / 2); grp.add(wr);
    const c0 = new THREE.Mesh(new THREE.CylinderGeometry(W + 0.01, W + 0.01, SEG_H, 24, 1, true, Math.PI / 2, Math.PI), this.matWall);
    c0.position.set(0, wy, 0); grp.add(c0);
    const c1 = new THREE.Mesh(new THREE.CylinderGeometry(W + 0.01, W + 0.01, SEG_H, 24, 1, true, -Math.PI / 2, Math.PI), this.matWall);
    c1.position.set(0, wy, L); grp.add(c1);
    // railings (posts + handrails) as one InstancedMesh + 2 sloped rails
    const postGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.9, 5);
    const posts = new THREE.InstancedMesh(postGeo, this.matRail, 12);
    let n = 0;
    for (let j = 0; j <= 4; j++) {
      const z = (j / 4) * L;
      m4.makeTranslation(-S, -(Math.min(STEPS - 1, Math.floor(z / RUN))) * RISE - RISE + 0.45, Math.min(z, L - 0.02)); posts.setMatrixAt(n++, m4);
      m4.makeTranslation(S, -FLIGHT_DROP - (Math.min(STEPS - 1, Math.floor((L - z) / RUN))) * RISE - RISE + 0.45, Math.min(z, L - 0.02)); posts.setMatrixAt(n++, m4);
    }
    m4.makeTranslation(0, 0.45, 0); posts.setMatrixAt(n++, m4);
    m4.makeTranslation(0, -FLIGHT_DROP + 0.45, L); posts.setMatrixAt(n++, m4);
    posts.count = n; grp.add(posts);
    const railGeo = new THREE.CylinderGeometry(0.025, 0.025, hyp, 6); railGeo.rotateX(Math.PI / 2);
    const ra = new THREE.Mesh(railGeo, this.matRail); ra.position.set(-S, -FLIGHT_DROP / 2 + 0.9 - RISE, L / 2); ra.rotation.x = ang; grp.add(ra);
    const rb = new THREE.Mesh(railGeo, this.matRail); rb.position.set(S, -FLIGHT_DROP * 1.5 + 0.9 - RISE, L / 2); rb.rotation.x = -ang; grp.add(rb);
    const endGeo = new THREE.CylinderGeometry(0.025, 0.025, 2 * S, 6); endGeo.rotateZ(Math.PI / 2);
    const e0 = new THREE.Mesh(endGeo, this.matRail); e0.position.set(0, 0.9, 0); grp.add(e0);
    const e1 = new THREE.Mesh(endGeo, this.matRail); e1.position.set(0, -FLIGHT_DROP + 0.9, L); grp.add(e1);
    return grp;
  }

  _buildTop() {
    // ceiling, sealed block over where the next flight up would be, and the padded entrance door
    const top = new THREE.Group();
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(2 * W + 0.4, 0.3, L + 2 * W + 0.4), this.matWall);
    ceil.position.set(0, 2.75, L / 2); top.add(ceil);
    const block = new THREE.Mesh(new THREE.BoxGeometry(W - S, 2.9, L), this.matWall); // seals where a flight up would be
    block.position.set((W + S) / 2, 1.3, L / 2); top.add(block);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.05, 0.08), new THREE.MeshLambertMaterial({ color: 0x3b3d3f }));
    door.position.set(0, 1.025, -W + 0.06); top.add(door);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), this.matRail);
    knob.position.set(0.35, 1.0, -W + 0.12); top.add(knob);
    this.door = door;
    this.scene.add(top);
  }

  // keep segments around the player's segment index; recycle the rest
  update(playerY) {
    const kc = Math.max(0, Math.floor(-playerY / SEG_H));
    const want = [];
    for (let k = Math.max(0, kc - 2); want.length < POOL; k++) want.push(k);
    const used = new Set();
    for (const g of this.segments) if (want.includes(g.userData.k)) used.add(g.userData.k); else g.userData.k = -999;
    for (const g of this.segments) {
      if (g.userData.k !== -999) continue;
      const k = want.find(w => !used.has(w)); if (k === undefined) break;
      used.add(k); g.userData.k = k; g.position.y = -k * SEG_H;
    }
    return kc;
  }
}

// Landing centres along the descent path. index m: even = L0 of seg m/2, odd = L1 of seg (m-1)/2
export function landingPos(m, out = new THREE.Vector3()) {
  const k = Math.floor(m / 2);
  if (m % 2 === 0) return out.set(0, -k * SEG_H, -0.75);
  return out.set(0, -k * SEG_H - FLIGHT_DROP, L + 0.75);
}
export function landingIndexAt(y) { return Math.floor(-y / FLIGHT_DROP + 0.01); }
