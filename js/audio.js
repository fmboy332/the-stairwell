// SCP-087 game audio by Mr. Fart (ORA.AI). 100% procedural Web Audio: no sound files, no third-party licences.
// Loaded automatically by js/sound.js. Hooks are listed in audio/SOURCES.md.
export class GameAudio {
  constructor() { this.ctx = null; this.master = null; this.loops = {}; this._sobTimer = null; }

  start() {
    if (this.ctx) return this.resume();
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx.resume();
    this.vol = this.ctx.createGain(); this.vol.gain.value = 0.8;   // user volume
    this.master = this.ctx.createGain(); this.master.gain.value = 1; // silence/duck bus
    this.reverb = this.ctx.createConvolver(); this.reverb.buffer = this._impulse(4.5, 2.8);
    this.wet = this.ctx.createGain(); this.wet.gain.value = 0.55;
    this.reverb.connect(this.wet).connect(this.master);
    this.master.connect(this.vol).connect(this.ctx.destination);
  }
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); }
  setVolume(v) { if (this.vol) this.vol.gain.value = v; }

  // ---------- helpers ----------
  _noise(seconds = 2) {
    const b = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * seconds), this.ctx.sampleRate);
    const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  _impulse(sec, decay) {
    const len = this.ctx.sampleRate * sec, b = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return b;
  }
  _out(node, dry = 1, wet = 1, pan = 0) {
    const p = this.ctx.createStereoPanner(); p.pan.value = pan;
    const g = this.ctx.createGain(); g.gain.value = dry;
    const s = this.ctx.createGain(); s.gain.value = wet;
    node.connect(p); p.connect(g).connect(this.master); p.connect(s).connect(this.reverb);
    return p;
  }
  get _ok() { return !!this.ctx; }

  // ---------- ambience ----------
  startAmbience() {
    if (!this._ok || this.loops.amb) return;
    const t = this.ctx.currentTime, gain = this.ctx.createGain(); gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.25, t + 4);
    const o1 = this.ctx.createOscillator(), o2 = this.ctx.createOscillator();
    o1.frequency.value = 43; o2.frequency.value = 43.7; // slow beating
    const n = this.ctx.createBufferSource(); n.buffer = this._noise(4); n.loop = true;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180;
    const ng = this.ctx.createGain(); ng.gain.value = 0.35;
    n.connect(lp).connect(ng).connect(gain); o1.connect(gain); o2.connect(gain);
    this._out(gain, 1, 0.3); o1.start(); o2.start(); n.start();
    this.loops.amb = { gain, lp, o1, o2, n };
  }
  setDepth(d) { // 0..1
    const a = this.loops.amb; if (!a) return; const t = this.ctx.currentTime;
    a.gain.gain.linearRampToValueAtTime(0.2 + d * 0.5, t + 1);
    a.lp.frequency.linearRampToValueAtTime(180 - d * 110, t + 1);
    a.o2.frequency.linearRampToValueAtTime(43.7 + d * 1.5, t + 1);
    this.wet.gain.linearRampToValueAtTime(0.55 + d * 0.35, t + 1);
  }

  // ---------- player ----------
  footstep(tired = 0) {
    if (!this._ok) return; tired = +tired;
    const t = this.ctx.currentTime, n = this.ctx.createBufferSource(); n.buffer = this._noise(0.3);
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = 900 + Math.random() * 500 - tired * 400; bp.Q.value = 1.2;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 + tired * 0.3, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    const thud = this.ctx.createOscillator(); thud.frequency.setValueAtTime(110, t);
    thud.frequency.exponentialRampToValueAtTime(45, t + 0.1);
    const tg = this.ctx.createGain(); tg.gain.setValueAtTime(0.4, t); tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    n.connect(bp).connect(g); thud.connect(tg);
    const pan = Math.random() * 0.2 - 0.1; this._out(g, 1, 0.9, pan); this._out(tg, 1, 0.6, pan);
    n.start(t); n.stop(t + 0.3); thud.start(t); thud.stop(t + 0.15);
  }
  // A step that copies yours one beat late, slightly quieter and further away.
  echoStep(delay = 0.55) {
    setTimeout(() => { if (!this._ok) return; this.footstep(0.2); }, delay * 1000);
  }
  breathing(intensity = 0.3) {
    if (!this._ok) return;
    const t = this.ctx.currentTime, n = this.ctx.createBufferSource(); n.buffer = this._noise(2);
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.7;
    const g = this.ctx.createGain(), len = Math.max(0.6, 1.8 - intensity);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.08 + intensity * 0.12, t + len * 0.35);
    g.gain.linearRampToValueAtTime(0.0001, t + len * 0.5);
    g.gain.linearRampToValueAtTime(0.06 + intensity * 0.1, t + len * 0.75); g.gain.linearRampToValueAtTime(0.0001, t + len);
    n.connect(bp).connect(g); this._out(g, 1, 0.1); n.start(t); n.stop(t + len + 0.1);
  }
  heartbeat(bpm = 110, beats = 2) {
    if (!this._ok) return; const gap = 60 / bpm;
    for (let i = 0; i < beats; i++) [0, 0.18].forEach((off, k) => {
      const t = this.ctx.currentTime + i * gap + off, o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.frequency.setValueAtTime(60, t); o.frequency.exponentialRampToValueAtTime(35, t + 0.12);
      g.gain.setValueAtTime(k ? 0.35 : 0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      o.connect(g); this._out(g, 1, 0); o.start(t); o.stop(t + 0.2);
    });
  }

  // ---------- flashlight ----------
  flashlightClick() {
    if (!this._ok) return;
    const t = this.ctx.currentTime, n = this.ctx.createBufferSource(); n.buffer = this._noise(0.05);
    const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    n.connect(hp).connect(g); this._out(g, 1, 0.3); n.start(t);
  }
  flickerBuzz(seconds = 1.5) {
    if (!this._ok) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 120;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const g = this.ctx.createGain(); g.gain.value = 0;
    for (let s = 0; s < seconds; s += 0.04) g.gain.setValueAtTime(Math.random() < 0.5 ? 0.08 : 0, t + s);
    g.gain.setValueAtTime(0, t + seconds);
    o.connect(lp).connect(g); this._out(g, 1, 0.2); o.start(t); o.stop(t + seconds + 0.05);
  }

  // ---------- the stairwell ----------
  // Crying from ~200 m below. CANON: it never gets closer. Call once to start a loop; fade 0..0.5 only makes it quieter.
  sob(fade = 0) {
    if (!this._ok) return; this.stopSob();
    this._sobFade = Math.max(0, Math.min(0.5, fade));
    const loop = () => { this._sobBurst(); this._sobTimer = setTimeout(loop, 3500 + Math.random() * 4500); };
    loop();
  }
  stopSob() { if (this._sobTimer) { clearTimeout(this._sobTimer); this._sobTimer = null; } }
  _sobBurst() {
    const t = this.ctx.currentTime, distance = 0.75 + (this._sobFade || 0) * 0.5, vol = 0.25 * (1 - distance * 0.8);
    for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
      const s = t + i * (0.35 + Math.random() * 0.25), o = this.ctx.createOscillator(); o.type = 'triangle';
      const f = 480 + Math.random() * 80; o.frequency.setValueAtTime(f, s); o.frequency.linearRampToValueAtTime(f * 0.75, s + 0.3);
      const vib = this.ctx.createOscillator(), vg = this.ctx.createGain(); vib.frequency.value = 7; vg.gain.value = 18;
      vib.connect(vg).connect(o.frequency);
      const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 2;
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000 - distance * 2400;
      const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, s);
      g.gain.linearRampToValueAtTime(vol, s + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.32);
      o.connect(bp).connect(lp).connect(g); this._out(g, 0.6 - distance * 0.4, 1);
      o.start(s); vib.start(s); o.stop(s + 0.35); vib.stop(s + 0.35);
    }
  }
  silence(seconds = 2) {
    if (!this._ok) return; const t = this.ctx.currentTime, g = this.master.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0.0001, t + 0.3);
    g.setValueAtTime(0.0001, t + seconds); g.linearRampToValueAtTime(1, t + seconds + 0.05);
  }
  faceStinger() {
    if (!this._ok) return;
    const t = this.ctx.currentTime, g = this.master.gain; g.cancelScheduledValues(t); g.setValueAtTime(1, t); // break any silence
    const sg0 = this.ctx.createGain();
    sg0.gain.setValueAtTime(0.0001, t); sg0.gain.exponentialRampToValueAtTime(0.5, t + 0.02); sg0.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    [233, 247, 311, 466, 523].forEach(f => { const o = this.ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 1.06, t + 2); o.connect(sg0); o.start(t); o.stop(t + 2.3); });
    const sub = this.ctx.createOscillator(), sg = this.ctx.createGain(); sub.frequency.setValueAtTime(70, t);
    sub.frequency.exponentialRampToValueAtTime(25, t + 1.5); sg.gain.setValueAtTime(0.9, t); sg.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    sub.connect(sg); this._out(sg0, 0.8, 1); this._out(sg, 1, 0.2); sub.start(t); sub.stop(t + 1.7);
  }
  distantScrape() {
    if (!this._ok) return;
    const t = this.ctx.currentTime, n = this.ctx.createBufferSource(); n.buffer = this._noise(2);
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 6;
    bp.frequency.setValueAtTime(400, t); bp.frequency.linearRampToValueAtTime(250, t + 1.4);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.15, t + 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + 1.5);
    n.connect(bp).connect(g); this._out(g, 0.2, 1, Math.random() * 1.6 - 0.8); n.start(t); n.stop(t + 1.6);
  }
  radioStatic(seconds = 0.8) {
    if (!this._ok) return;
    const t = this.ctx.currentTime, n = this.ctx.createBufferSource(); n.buffer = this._noise(seconds + 0.1);
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 0.8;
    const g = this.ctx.createGain(); g.gain.value = 0;
    for (let s = 0; s < seconds; s += 0.03) g.gain.setValueAtTime(0.05 + Math.random() * 0.12, t + s);
    g.gain.setValueAtTime(0, t + seconds);
    n.connect(bp).connect(g); this._out(g, 1, 0); n.start(t); n.stop(t + seconds + 0.1);
  }
  // Muffled knocking on the padded door, 1 to 2 s apart (from the article).
  knock(count = 6) {
    if (!this._ok) return; let at = this.ctx.currentTime;
    for (let i = 0; i < count; i++) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(), lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 300;
      o.frequency.setValueAtTime(140, at); o.frequency.exponentialRampToValueAtTime(60, at + 0.08);
      g.gain.setValueAtTime(0.6, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
      o.connect(lp).connect(g); this._out(g, 1, 0.4); o.start(at); o.stop(at + 0.15);
      at += 1 + Math.random();
    }
  }
}
export default GameAudio;
