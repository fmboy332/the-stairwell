// sound.js — adapter between the level/SCARES and the sound module.
// Uses Mr. Fart's real Web Audio module (js/audio.js, hooks in audio/SOURCES.md) when it is present;
// falls back to Mochi's synthesized placeholders (js/audio-placeholder.js) so the game never breaks.
import { GameAudio as Placeholder } from './audio-placeholder.js';

let mod = null;
try { mod = await import('./audio.js'); } catch (e) { mod = null; }

function findApi(m) {
  if (!m) return null;
  const has = o => o && typeof o.footstep === 'function';
  for (const c of [m, m.default, m.audio, m.sound, m.sfx, m.Audio]) if (has(c)) return c;
  for (const C of [m.default, m.GameAudio, m.AudioEngine, m.Sound]) {
    if (typeof C === 'function' && C.prototype && typeof C.prototype.footstep === 'function') { try { return new C(); } catch (e) {} }
  }
  return null;
}

export class Sound {
  constructor() {
    this.real = findApi(mod);
    this.ph = this.real ? null : new Placeholder();
    this.kind = this.real ? 'mr-fart' : 'placeholder';
    this._started = false; this._cry = false; this._lastBreath = 0;
  }
  _r(name, ...a) { const f = this.real && this.real[name]; if (typeof f === 'function') { try { return f.apply(this.real, a); } catch (e) { console.warn('[sound]', name, e); } } }
  // must run inside a user click (Begin descent / intro card / Retry)
  resume() { if (this.real) { if (!this._started) { this._r('start'); this._started = true; } else this._r('resume'); } else this.ph.resume(); }
  setVolume(v) { this.real ? this._r('setVolume', v) : this.ph.setVolume(v); }
  startAmbience() { if (this.real) { if (!this._amb) { this._amb = true; this._r('startAmbience'); } } else this.ph.startAmbience(); }
  setDepth(d01) { const v = Math.max(0, Math.min(1, d01)); if (Math.abs(v - (this._d ?? -1)) < 0.005) return; this._d = v; this._r('setDepth', v); }
  // crying from ~200 m below — CANON: never closer. fade 0..0.5 only ever makes it quieter.
  startCry(fade = 0) { if (this.real) { if (!this._cry) { this._cry = true; this._r('sob', fade); } } else this.ph.startCry(); }
  setCryFade(f01) { if (!this.real) this.ph.setCryFade(f01); /* real module: sob() fade is set at start */ }
  stopCry() { if (this.real) { this._cry = false; this._r('stopSob'); } else this.ph.stopCry(); }
  step(intensity = 1, { echo = false } = {}) { if (this.real) this._r(echo ? 'echoStep' : 'footstep', intensity > 1.1); else this.ph.step(intensity, { echo }); }
  echoHandledBySound() { return !!this.real; } // real echoStep() already lands one beat late
  click() { this.real ? this._r('flashlightClick') : this.ph.click(); }
  flickerBuzz(sec) { if (this.real) this._r('flickerBuzz', sec); }
  breathing(i) { if (this.real) { const t = performance.now(); if (t - this._lastBreath > 2500) { this._lastBreath = t; this._r('breathing', i); } } }
  heartbeat(bpm = 110) { this.real ? this._r('heartbeat', bpm) : this.ph.heartbeat(); }
  scrape() { this.real ? this._r('distantScrape') : this.ph.door(); }
  door() { this.real ? this._r('distantScrape') : this.ph.door(); }
  staticBurst(sec = 1.2, gain) { this.real ? this._r('radioStatic', sec) : this.ph.staticBurst(sec, gain); }
  radioBeep() { if (!this.real) this.ph.radioBeep(); }
  silence(sec = 3) { this.real ? this._r('silence', sec) : this.ph.silence(sec); }
  unsilence(rate) { if (!this.real) this.ph.unsilence(rate); }
  sting(gain) { this.real ? this._r('faceStinger') : this.ph.sting(gain); }
  knock() { this.real ? this._r('knock', 1) : this.ph.knock(); }
  // whole post-credits knock series (1–2 s apart). Returns true if the module plays it itself.
  knockSeries(n = 6) { if (this.real) { this._r('knock', n); return true; } return false; }
}
