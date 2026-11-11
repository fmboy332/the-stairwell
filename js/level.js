// level.js — Mochi's 3D level: renderer, player, flashlight, scare director, endings.
// Entry: startLevel({ canvas, settings, onEnd }) — called from Poby's startGame() in main.js.
// Hooks: game.on('scare', id => …), game.on('ending', type => …)  (type: 'escape' | 'signal_lost')
import * as THREE from '../vendor/three.module.min.js';
import { Stairwell, floorAt, blocked, landingPos, landingIndexAt, SEG_H, S, L } from './world.js';
import { Face } from './face.js';
import { Sound } from './sound.js';
import { Hud } from './hud.js';
import { ScareDirector, SCARES } from './scares.js';

const EYE = 1.6, RADIUS = 0.25, WALK = 1.55, SPRINT = 2.9;
const FLASH = 22; // candela-ish; weak on purpose
const BATTERY_SECONDS = 14 * 60, BATTERY_FLOOR = 0.12;
let game = null;

export function startLevel(opts = {}) {
  if (!game) game = new Game(opts); else game.opts = { ...game.opts, ...opts };
  game.start();
  return game;
}
export function playPostCreditsLog(onClose) { if (game) game.hud.postCredits(game.audio, onClose); }
export { SCARES };

class Game {
  constructor(opts) {
    this.opts = opts;
    const qs = new URLSearchParams(location.search);
    this.debug = opts.debug ?? qs.has('debug');
    this.canvas = opts.canvas || document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.1;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(0x000000, 0.17);          // ~1.5 flights of visibility
    this.scene.add(new THREE.AmbientLight(0xb0b8c0, 0.035));     // near-black
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 60);
    this.scene.add(this.camera);
    this.flash = new THREE.SpotLight(0xffe8c8, FLASH, 10, 0.44, 0.6, 1.5);
    this.flash.position.set(0.15, -0.12, 0); this.flash.target.position.set(0.05, -0.45, -3);
    this.camera.add(this.flash); this.camera.add(this.flash.target);
    this.world = new Stairwell(this.scene);
    this.face = new Face(this.scene);
    this.audio = new Sound();
    this.hud = new Hud({ debug: this.debug });
    this.hud.onResume = () => this.lock();
    this.listeners = {};
    this.keys = {};
    this._bind();
    this._resize(); addEventListener('resize', () => this._resize());
    this.clock = new THREE.Clock();
    this.fps = 0;
    this.api = {
      flicker: ms => { this.flickerUntil = this.t + ms / 1000; this.audio.flickerBuzz(ms / 1000); },
      flashOff: ms => { this.audio.click(); this.offUntil = this.t + ms / 1000; this.after(ms / 1000, () => this.audio.click()); },
      setFlashFailing: on => { this.failing = on; },
      flashOn: () => this.flash.intensity > 0.5,
      echo: sec => { this.echoUntil = this.t + sec; },
      lookingDown: () => this.pitch < -0.6 && Math.abs(this.pos.x) < S + 0.55 && this.pos.z > 0.2 && this.pos.z < L - 0.2,
      landingAhead: n => landingPos(landingIndexAt(this.pos.y) + n),
      aheadOnStairs: (dist, ang = 0) => this.pointInView(dist, ang),
      jumpscare: type => this.jumpscare(type),
      end: type => this.end(type),
      after: (sec, fn) => this.after(sec, fn),
      emit: (n, a) => this.emit(n, a),
      get state() { return game.state; },
    };
    window.__stairwell = this; // test / debug handle
  }

  on(name, fn) { (this.listeners[name] ||= []).push(fn); }
  emit(name, arg) { (this.listeners[name] || []).forEach(f => f(arg)); }
  after(sec, fn) { this.timers.push({ at: this.t + sec, fn }); }

  start() {
    this.reset();
    this.canvas.style.display = 'block'; this.hud.root.style.display = '';
    this.audio.resume(); this.audio.startAmbience();
    this.audio.setVolume(this.opts.settings?.volume ?? 0.8);
    this.running = true;
    this.hud.intro(() => this.lock()); // pointer lock after the card (a locked pointer would swallow the click)
    if (!this._loop) { this._loop = () => { requestAnimationFrame(this._loop); this.frame(); }; this._loop(); }
  }
  reset() {
    this.pos = new THREE.Vector3(-0.8, 0, -0.6); this.vy = 0; this.eyeY = EYE;
    this.yaw = Math.PI - 0.08; this.pitch = -0.35; this.bob = 0; this.stamina = 1; this.exhausted = false;
    this.battery = 1; this.t = 0; this.timers = []; this.state = {};
    this.flickerUntil = 0; this.offUntil = 0; this.echoUntil = 0; this.failing = false; this.failGlint = 0;
    this.ended = false; this.paused = false; this.maxDepth = 0;
    this.director = new ScareDirector(SCARES);
    this.face.hide(); this.hud.reset(); this.audio.stopCry(); this.audio.unsilence(0.5);
  }
  lock() { if (!this.ended) this.canvas.requestPointerLock?.()?.catch?.(() => {}); }

  _bind() {
    addEventListener('keydown', e => {
      this.keys[e.code] = true;
      if (this.debug && e.code === 'PageDown') this.teleport(-this.pos.y + SEG_H);
      if (this.debug && e.code === 'PageUp') this.teleport(Math.max(0, -this.pos.y - SEG_H));
    });
    addEventListener('keyup', e => { this.keys[e.code] = false; });
    addEventListener('mousemove', e => {
      if (document.pointerLockElement !== this.canvas || this.paused) return;
      if (Math.abs(e.movementX) > 250 || Math.abs(e.movementY) > 250) return; // ignore the jump some browsers send right after locking
      const s = 0.0022 * (this.opts.settings?.sensitivity ?? 1);
      this.yaw -= e.movementX * s; this.pitch = Math.max(-1.45, Math.min(1.35, this.pitch - e.movementY * s));
    });
    this.canvas.addEventListener('click', () => this.lock());
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.canvas;
      if (locked) this.hadLock = true;
      this.paused = !locked && this.hadLock && !this.ended && this.running;
      this.hud.pause(this.paused);
    });
  }
  _resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  // ---- debug / test helpers ----
  teleport(depth) {
    const k = Math.round(depth / SEG_H);
    this.pos.set(0, -k * SEG_H, -0.6); this.eyeY = this.pos.y + EYE; this.vy = 0; this.yaw = Math.PI;
  }
  fire(id) { this.director.fire(id, this.ctx()); }

  pointInView(dist, ang) {
    const dir = new THREE.Vector3(-Math.sin(this.yaw + ang), 0, -Math.cos(this.yaw + ang));
    const p = new THREE.Vector3();
    for (let d = dist; d > 0.6; d -= 0.2) {
      p.copy(this.pos).addScaledVector(dir, d);
      if (!blocked(p.x, p.z, this.pos.y, 0.15)) break;
    }
    const f = floorAt(p.x, p.z, this.pos.y + 0.2, 0.2);
    p.y = Number.isFinite(f) ? f : this.pos.y - 0.4 - dist * 0.6;
    return p;
  }

  ctx() {
    return { depth: Math.max(0, -this.pos.y), t: this.t, dt: this._dt || 0.016, audio: this.audio, face: this.face, hud: this.hud,
      camera: this.camera, player: { position: this.pos }, game: this.api };
  }

  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.fps = this.fps * 0.95 + (1 / Math.max(dt, 1e-4)) * 0.05;
    if (this.running && !this.paused && !this.ended) this.update(dt);
    if (this.canvas.style.display !== 'none') this.renderer.render(this.scene, this.camera);
  }

  update(dt) {
    this._dt = dt; this.t += dt;
    this.timers = this.timers.filter(tm => (tm.at <= this.t ? (tm.fn(), false) : true));
    this.audio.setVolume(this.opts.settings?.volume ?? 0.8);
    // --- movement ---
    const k = this.keys, fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0), strafe = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    const moving = fwd || strafe;
    const wantSprint = (k.ShiftLeft || k.ShiftRight) && moving && !this.exhausted;
    this.stamina = Math.max(0, Math.min(1, this.stamina + (wantSprint ? -0.2 : 0.12) * dt));
    if (this.stamina === 0) this.exhausted = true; if (this.exhausted && this.stamina > 0.3) this.exhausted = false;
    const speed = wantSprint ? SPRINT : WALK;
    if (moving) {
      const len = Math.hypot(fwd, strafe), sx = Math.sin(this.yaw), cz = Math.cos(this.yaw);
      const dx = (-sx * fwd + cz * strafe) / len * speed * dt, dz = (-cz * fwd - sx * strafe) / len * speed * dt;
      this._tryMove(this.pos.x + dx, this.pos.z); this._tryMove(this.pos.x, this.pos.z + dz);
      const prev = this.bob; this.bob += dt * speed * 5.2;
      if (Math.floor(prev / Math.PI) !== Math.floor(this.bob / Math.PI)) this._footstep(wantSprint);
    }
    // --- vertical: step-height snapping + gravity ---
    const f = floorAt(this.pos.x, this.pos.z, this.pos.y);
    if (f > this.pos.y) { this.pos.y = f; this.vy = 0; }
    else if (f < this.pos.y) { this.vy -= 9.8 * dt; this.pos.y = Math.max(f, this.pos.y + this.vy * dt); if (this.pos.y === f) this.vy = 0; }
    this.eyeY += (this.pos.y + EYE - this.eyeY) * Math.min(1, dt * 14);
    const bobAmt = moving ? (wantSprint ? 0.05 : 0.03) : 0;
    // lean over the railing when looking down into the shaft
    const onFlight = this.pos.z > 0.1 && this.pos.z < L - 0.1 && Math.abs(this.pos.x) < S + 0.35;
    const leanT = onFlight ? Math.min(1, Math.max(0, (-this.pitch - 0.8) / 0.5)) : 0;
    this.lean = (this.lean || 0) + (leanT * 0.22 - (this.lean || 0)) * Math.min(1, dt * 6);
    this.camera.position.set(this.pos.x - Math.sign(this.pos.x) * this.lean + Math.cos(this.bob * 0.5) * bobAmt * 0.5, this.eyeY + Math.abs(Math.sin(this.bob)) * bobAmt, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, Math.sin(this.bob * 0.5) * bobAmt * 0.15, 'YXZ');
    // --- flashlight ---
    this.battery = Math.max(BATTERY_FLOOR, this.battery - dt / BATTERY_SECONDS);
    let I = FLASH * (0.35 + 0.65 * this.battery) * (1 + 0.04 * Math.sin(this.t * 13) * Math.sin(this.t * 7.3));
    if (this.battery < 0.3 && Math.random() < 0.02) I *= 0.2;
    if (this.t < this.flickerUntil) I *= Math.random() < 0.45 ? 0.05 : 0.7 + Math.random() * 0.3;
    if (this.t < this.offUntil) I = 0;
    if (this.failing) { // climax: the light is dying; it only catches for moments
      if (this.t > this.failGlint) this.failGlint = this.t + 1.2 + Math.random() * 1.8;
      I = (this.failGlint - this.t < 0.35) ? I * (0.4 + Math.random() * 0.5) : 0;
    }
    this.flash.intensity = I;
    // --- world, face, scares ---
    const depth = Math.max(0, -this.pos.y); this.maxDepth = Math.max(this.maxDepth, depth);
    this.world.update(this.pos.y);
    this.audio.setDepth(depth / 200);
    if (this.exhausted || this.state.climax) this.audio.breathing(this.state.climax ? 1 : 0.6);
    this.director.tick(this.ctx());
    this.face.update(this.camera);
    const shown = this.hud.depthWrong ? this._wrongDepth(depth) : depth;
    this.hud.update({ shownDepth: shown, battery: this.battery, stamina: this.stamina,
      dbg: this.debug ? `true depth ${depth.toFixed(1)} m\nseg ${Math.floor(depth / SEG_H)}  fps ${this.fps.toFixed(0)}\nPgDn/PgUp = teleport` : '' });
  }
  _wrongDepth(d) {
    if (Math.random() < 0.004) return ['ERR', '-- m', '∞ m', '0 m'][Math.floor(Math.random() * 4)];
    return d + Math.pow(Math.max(0, d - 80), 1.8) * 0.9 + Math.random() * 3;
  }
  _tryMove(nx, nz) {
    if (blocked(nx, nz, this.pos.y, RADIUS)) return;
    if (!Number.isFinite(floorAt(nx, nz, this.pos.y))) return;
    this.pos.x = nx; this.pos.z = nz;
  }
  _footstep(sprint) {
    this.audio.step(sprint ? 1.3 : 1);
    if (this.t < this.echoUntil && this.audio.echoHandledBySound()) this.audio.step(1, { echo: true });
    else if (this.t < this.echoUntil) { const beat = Math.PI / ((sprint ? SPRINT : WALK) * 5.2); setTimeout(() => this.audio.step(1, { echo: true }), beat * 1000); }
  }

  jumpscare(type) {
    if (this.ended || this._jumping) return; this._jumping = true;
    this.hud.jumpscare(1100); this.audio.sting(1.2); this.face.hide();
    setTimeout(() => { this._jumping = false; this.audio.staticBurst(1.2, 0.35); this.end(type); }, 1100);
  }
  end(type) {
    if (this.ended) return; this.ended = true; this.running = false;
    this.hud.pause(false); document.exitPointerLock?.(); this.audio.stopCry(); this.audio.unsilence(0.3);
    this.hud.objective(''); this.hud.radio('');
    this.emit('ending', type);
    this.hud.ending(type, {
      onRetry: () => this.start(),
      onContinue: () => { this.canvas.style.display = 'none'; this.hud.root.style.display = 'none'; this.opts.onEnd ? this.opts.onEnd(type) : this.hud.postCredits(this.audio, () => location.reload()); },
    });
  }
}
