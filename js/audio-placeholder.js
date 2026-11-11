// audio.js — ALL placeholder sound is synthesized with WebAudio (no audio files, no copyright).
// Mr. Fart: to replace a sound with a real CC0/CC BY file, put it in audio/ and add it to SOUND_FILES,
// e.g. SOUND_FILES.sting = 'audio/sting.ogg' (and log it in audio/SOURCES.md). Loaded files win over synths.
export const SOUND_FILES = {
  // cry: 'audio/cry.ogg', step: 'audio/step.ogg', door: 'audio/door.ogg', sting: 'audio/sting.ogg',
  // knock: 'audio/knock.ogg', static: 'audio/static.ogg', click: 'audio/click.ogg', drone: 'audio/drone.ogg'
};

export class GameAudio {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const c = this.ctx;
    this.master = c.createGain(); this.master.connect(c.destination);
    this.duck = c.createGain(); this.duck.connect(this.master);       // everything ambient goes via duck
    this.fx = c.createGain(); this.fx.connect(this.master);           // stings bypass the duck
    this.reverb = c.createConvolver(); this.reverb.buffer = this._impulse(3.2, 2.4);
    this.reverbOut = c.createGain(); this.reverbOut.gain.value = 0.7;
    this.reverb.connect(this.reverbOut); this.reverbOut.connect(this.duck);
    this.noiseBuf = this._noise(2);
    this.buffers = {};
    for (const [k, url] of Object.entries(SOUND_FILES)) {
      fetch(url).then(r => r.arrayBuffer()).then(b => c.decodeAudioData(b)).then(buf => this.buffers[k] = buf).catch(() => {});
    }
    this.cryOn = false;
  }
  resume() { if (this.ctx.state !== 'running') this.ctx.resume(); }
  setVolume(v) { this.master.gain.value = v; }
  get t() { return this.ctx.currentTime; }

  _noise(sec) {
    const c = this.ctx, b = c.createBuffer(1, c.sampleRate * sec, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b;
  }
  _impulse(sec, decay) {
    const c = this.ctx, len = c.sampleRate * sec, b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return b;
  }
  _file(name, dest, gain = 1) {
    const buf = this.buffers[name]; if (!buf) return false;
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain(); g.gain.value = gain;
    s.buffer = buf; s.connect(g); g.connect(dest); s.start(); return true;
  }
  _noiseBurst({ dest, t = this.t, dur = 0.1, freq = 800, q = 1, type = 'bandpass', gain = 0.5, attack = 0.002, wet = 0 }) {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.duck); if (wet) { const w = c.createGain(); w.gain.value = wet; g.connect(w); w.connect(this.reverb); }
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  _tone({ dest, t = this.t, dur = 0.2, f0 = 100, f1 = f0, type = 'sine', gain = 0.4, wet = 0 }) {
    const c = this.ctx, o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.duck); if (wet) { const w = c.createGain(); w.gain.value = wet; g.connect(w); w.connect(this.reverb); }
    o.start(t); o.stop(t + dur + 0.05);
  }

  // low concrete-room drone
  startAmbience() {
    if (this.droneOn) return; this.droneOn = true;
    if (this._file('drone', this.duck, 0.4)) return;
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 140;
    const g = c.createGain(); g.gain.value = 0.18; s.connect(f); f.connect(g); g.connect(this.duck); s.start();
    const o = c.createOscillator(); o.frequency.value = 43; const og = c.createGain(); og.gain.value = 0.025; o.connect(og); og.connect(this.duck); o.start();
  }

  // Distant child crying. CANON: it never gets closer — constant apparent distance; `fade` only lowers it.
  startCry() {
    if (this.cryOn) return; this.cryOn = true;
    const c = this.ctx;
    this.cryBus = c.createGain(); this.cryBus.gain.value = 0.0;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; // far away, through concrete
    this.cryBus.connect(lp); lp.connect(this.reverb);                                    // mostly wet = distant
    const dry = c.createGain(); dry.gain.value = 0.12; lp.connect(dry); dry.connect(this.duck);
    this.cryBus.gain.linearRampToValueAtTime(0.5, this.t + 6);
    const sob = () => {
      if (!this.cryOn) return;
      if (this.buffers.cry) { this._file('cry', this.cryBus, 1); setTimeout(sob, this.buffers.cry.duration * 1000); return; }
      // one sobbing phrase: a few short "uh" catches + a long wail, formant-filtered sawtooth
      let t = this.t + 0.05; const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i <= n; i++) {
        const long = i === n, dur = long ? 1.1 + Math.random() * 0.8 : 0.16 + Math.random() * 0.1;
        const o = c.createOscillator(); o.type = 'sawtooth';
        const base = 380 + Math.random() * 60;
        o.frequency.setValueAtTime(base, t);
        if (long) { o.frequency.linearRampToValueAtTime(base * 1.35, t + dur * 0.3); o.frequency.linearRampToValueAtTime(base * 0.8, t + dur); }
        const vib = c.createOscillator(); vib.frequency.value = 6.5; const vg = c.createGain(); vg.gain.value = 14; vib.connect(vg); vg.connect(o.frequency);
        const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 900; f1.Q.value = 6;
        const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 2300; f2.Q.value = 8;
        const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.04); g.gain.setValueAtTime(0.5, t + dur * 0.7); g.gain.linearRampToValueAtTime(0, t + dur);
        o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(this.cryBus);
        o.start(t); vib.start(t); o.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
        this._noiseBurst({ dest: this.cryBus, t: t + dur, dur: 0.25, freq: 1800, q: 0.7, gain: 0.12, attack: 0.05 }); // breath in
        t += dur + 0.12 + Math.random() * 0.15;
      }
      setTimeout(sob, (t - this.t + 1.5 + Math.random() * 3.5) * 1000);
    };
    sob();
  }
  setCryFade(f) { if (this.cryBus) this.cryBus.gain.setTargetAtTime(0.5 * f, this.t, 2); } // f in [0,1], never > 1
  stopCry() { this.cryOn = false; if (this.cryBus) this.cryBus.gain.setTargetAtTime(0, this.t, 0.3); }

  step(intensity = 1, { echo = false } = {}) {
    if (this._file('step', this.duck, echo ? 0.25 : 0.6 * intensity)) return;
    const t = this.t;
    if (!echo) {
      this._tone({ t, dur: 0.12, f0: 95, f1: 55, gain: 0.35 * intensity, wet: 0.25 });
      this._noiseBurst({ t, dur: 0.07, freq: 1700, q: 0.8, gain: 0.18 * intensity, wet: 0.3 });
    } else { // the echo: from below, duller, slightly different shoe
      this._tone({ t, dur: 0.14, f0: 82, f1: 48, gain: 0.16, wet: 1.4 });
      this._noiseBurst({ t, dur: 0.08, freq: 1100, q: 0.9, gain: 0.07, wet: 1.4 });
    }
  }
  click() { if (this._file('click', this.fx, 0.5)) return; this._noiseBurst({ dest: this.fx, dur: 0.03, freq: 3000, q: 2, gain: 0.25 }); }
  door() { // heavy steel door far above
    if (this._file('door', this.duck, 0.8)) return;
    const t = this.t;
    this._noiseBurst({ t, dur: 0.6, freq: 300, q: 0.5, type: 'lowpass', gain: 0.25, wet: 2.5 });
    this._tone({ t, dur: 0.9, f0: 70, f1: 38, gain: 0.5, wet: 2 });
    this._tone({ t: t + 0.03, dur: 1.4, f0: 210, f1: 190, type: 'triangle', gain: 0.05, wet: 2 });
  }
  staticBurst(dur = 1.2, gain = 0.25) {
    if (this._file('static', this.fx, gain)) return;
    const t = this.t;
    this._noiseBurst({ dest: this.fx, t, dur, freq: 2500, q: 0.4, gain, attack: 0.01 });
    for (let i = 0; i < 6; i++) this._noiseBurst({ dest: this.fx, t: t + Math.random() * dur, dur: 0.02, freq: 4000, q: 1, gain: gain * 1.5 });
  }
  radioBeep() { this._tone({ dest: this.fx, dur: 0.12, f0: 1200, gain: 0.08, type: 'square' }); }
  knock() { // knocking on a padded door: dull, close
    if (this._file('knock', this.fx, 0.8)) return;
    const t = this.t;
    this._tone({ dest: this.fx, t, dur: 0.18, f0: 140, f1: 90, gain: 0.6 });
    this._noiseBurst({ dest: this.fx, t, dur: 0.05, freq: 600, q: 1, gain: 0.25 });
  }
  // dramatic silence: everything ambient fades out (crying included) — the sting comes after
  silence(sec = 3) { const g = this.duck.gain; g.cancelScheduledValues(this.t); g.setTargetAtTime(0.0, this.t, 0.25); this._silenceUntil = this.t + sec; }
  unsilence(rate = 1.5) { this.duck.gain.cancelScheduledValues(this.t); this.duck.gain.setTargetAtTime(1, this.t, rate); }
  sting(gain = 0.9) {
    if (this._file('sting', this.fx, gain)) return;
    const t = this.t;
    for (const f of [92, 97.5, 138, 184, 195, 277, 311]) this._tone({ dest: this.fx, t, dur: 1.6, f0: f * 1.02, f1: f * 0.96, type: 'sawtooth', gain: gain * 0.12 });
    this._noiseBurst({ dest: this.fx, t, dur: 1.2, freq: 1500, q: 0.3, gain: gain * 0.5, attack: 0.005 });
    this._tone({ dest: this.fx, t, dur: 0.7, f0: 60, f1: 30, gain: gain * 0.7 });
  }
  heartbeat() { const t = this.t; this._tone({ dest: this.fx, t, dur: 0.15, f0: 55, f1: 40, gain: 0.35 }); this._tone({ dest: this.fx, t: t + 0.25, dur: 0.15, f0: 50, f1: 38, gain: 0.25 }); }
}
