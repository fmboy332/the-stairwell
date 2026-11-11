// hud.js — in-game overlays only (bodycam readout, radio subtitles, grain/vignette, intro card,
// jumpscare, endings, post-credits log). Poby owns the menus/credits in index.html.
import { faceCanvas } from './face.js';

export const CREDIT_LINE = '"SCP-087" by Zaeyde, from the SCP Wiki, https://scpwiki.com/scp-087, licensed under CC BY-SA 3.0.';

const CSS = `
#sw-hud{position:fixed;inset:0;pointer-events:none;font-family:"Courier New",monospace;color:#cfd2c8;z-index:10}
#sw-hud .vig{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 45%,rgba(0,0,0,.55) 78%,rgba(0,0,0,.95) 100%)}
#sw-hud canvas.grain{position:absolute;inset:0;width:100%;height:100%;opacity:.05;image-rendering:pixelated}
#sw-hud .read{position:absolute;top:16px;left:18px;font-size:13px;letter-spacing:.08em;text-shadow:0 0 4px #000;opacity:.8}
#sw-hud .read b{color:#d33;font-weight:normal}
#sw-hud .radio{position:absolute;bottom:9%;left:50%;transform:translateX(-50%);max-width:70%;text-align:center;font-size:16px;background:rgba(0,0,0,.45);padding:6px 12px;transition:opacity .6s}
#sw-hud .obj{position:absolute;top:22%;width:100%;text-align:center;font-size:26px;letter-spacing:.3em;color:#e6e0d0;text-shadow:0 0 12px #000}
#sw-hud .stam{position:absolute;bottom:22px;left:50%;width:120px;height:2px;margin-left:-60px;background:rgba(255,255,255,.35);transform-origin:left;transition:opacity .5s}
#sw-hud .dbg{position:absolute;top:16px;right:18px;font-size:12px;color:#8f8;text-align:right;white-space:pre}
.sw-card{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;background:#000;color:#bbb;font-family:Georgia,serif;z-index:20;transition:opacity 1.2s;pointer-events:auto}
.sw-card h2{letter-spacing:.25em;font-weight:normal;color:#ddd;margin:0}
.sw-card p{max-width:640px;line-height:1.55;margin:0;color:#999}
.sw-card small{color:#666;max-width:640px}
.sw-card button{background:none;border:1px solid #555;color:#ccc;padding:10px 28px;font:inherit;cursor:pointer;min-width:200px}
.sw-card button:hover{border-color:#ccc;color:#fff}
.sw-jump{position:fixed;inset:0;z-index:30;background:#000;pointer-events:none}
.sw-jump canvas{position:absolute;left:50%;top:50%;height:120vh;transform:translate(-50%,-50%)}
`;

export class Hud {
  constructor({ debug = false } = {}) {
    if (!document.getElementById('sw-style')) { const st = document.createElement('style'); st.id = 'sw-style'; st.textContent = CSS; document.head.appendChild(st); }
    document.getElementById('sw-hud')?.remove();
    this.root = document.createElement('div'); this.root.id = 'sw-hud';
    this.root.innerHTML = `<canvas class="grain" width="320" height="180"></canvas><div class="vig"></div>
      <div class="read"></div><div class="radio" style="opacity:0"></div><div class="obj"></div><div class="stam"></div>${debug ? '<div class="dbg"></div>' : ''}`;
    document.body.appendChild(this.root);
    this.grain = this.root.querySelector('.grain').getContext('2d');
    this.grainImg = this.grain.createImageData(320, 180);
    this.el = { read: this.root.querySelector('.read'), radio: this.root.querySelector('.radio'), obj: this.root.querySelector('.obj'), stam: this.root.querySelector('.stam'), dbg: this.root.querySelector('.dbg') };
    this.reset();
  }
  reset() { this.garble = 0; this.depthWrong = false; this._radioT = 0; this.objective(''); this.radio(''); this.frame = 0; }
  _garble(s) { if (!this.garble) return s; return [...s].map(ch => ch !== ' ' && Math.random() < this.garble * 0.5 ? (Math.random() < 0.5 ? '—' : ' ') : ch).join(''); }
  radio(text, hold = 7) {
    if (!text) { this.el.radio.style.opacity = 0; return; }
    this._radioText = text; this._radioT = performance.now() + hold * 1000;
    this.el.radio.textContent = this._garble(text); this.el.radio.style.opacity = 1;
    this.onRadio && this.onRadio(text);
  }
  objective(t) { this.el.obj.textContent = t; }
  update({ shownDepth, battery, stamina, rec = true, dbg }) {
    this.frame++;
    if (this.frame % 2 === 0) { // film grain
      const d = this.grainImg.data; for (let i = 0; i < d.length; i += 4) { const n = Math.random() * 255; d[i] = d[i + 1] = d[i + 2] = n; d[i + 3] = 255; }
      this.grain.putImageData(this.grainImg, 0, 0);
    }
    if (this.frame % 6 === 0) {
      const dep = typeof shownDepth === 'string' ? shownDepth : `${shownDepth.toFixed(0)} m`;
      this.el.read.innerHTML = `<b>${rec && (this.frame % 60 < 36) ? '●' : '&nbsp;'}</b> REC  D-9341 · EXPLORATION V<br>DEPTH ${dep}<br>LIGHT ${(battery * 100).toFixed(0)}%`;
      if (this.garble && this._radioT > performance.now() && Math.random() < 0.3) this.el.radio.textContent = this._garble(this._radioText);
    }
    if (this._radioT && performance.now() > this._radioT) { this.el.radio.style.opacity = 0; this._radioT = 0; }
    this.el.stam.style.transform = `scaleX(${stamina})`; this.el.stam.style.opacity = stamina < 0.98 ? 0.6 : 0;
    if (this.el.dbg && dbg) this.el.dbg.textContent = dbg;
  }
  card(html, { ms = 0, cls = '' } = {}) {
    const c = document.createElement('div'); c.className = 'sw-card ' + cls; c.innerHTML = html; document.body.appendChild(c);
    c.close = () => { c.style.opacity = 0; setTimeout(() => c.remove(), 1200); };
    if (ms) setTimeout(c.close, ms);
    return c;
  }
  intro(onDone) {
    const c = this.card(`<h2>EXPLORATION V</h2><p>Bodycam feed, recovered.</p>
      <small>Inspired by SCP-087 from the SCP Foundation wiki, CC BY-SA 3.0. An original adaptation, not a true story.<br><br>${CREDIT_LINE}</small>
      <small style="color:#555">click to begin</small>`);
    c.style.background = 'rgba(0,0,0,.92)';
    let done = false; const fin = () => { if (done) return; done = true; c.close(); onDone && onDone(); };
    c.addEventListener('click', fin); setTimeout(fin, 7000);
    return c;
  }
  jumpscare(ms = 1100) {
    const j = document.createElement('div'); j.className = 'sw-jump';
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 640; cv.getContext('2d').drawImage(faceCanvas(), 0, 0);
    j.appendChild(cv); document.body.appendChild(j); const t0 = performance.now();
    const loop = () => {
      const t = performance.now() - t0; if (t > ms) { j.remove(); return; }
      const s = 1 + t / ms * 0.35;
      cv.style.transform = `translate(calc(-50% + ${(Math.random() - .5) * 30}px), calc(-50% + ${(Math.random() - .5) * 30}px)) scale(${s})`;
      cv.style.filter = `contrast(${1.05 + Math.random() * 0.35}) brightness(${0.8 + Math.random() * 0.5})`;
      requestAnimationFrame(loop);
    };
    loop();
  }
  ending(type, { onRetry, onContinue }) {
    const esc = type === 'escape';
    const c = this.card(esc
      ? `<h2>FOOTAGE RECOVERED</h2><p>D-9341 reached the entrance landing and the door was sealed behind him.<br>The tape runs for forty-one minutes. Nobody who has watched the last six will describe them.</p>
         <div><button data-a="retry">Descend again</button> <button data-a="cont">Continue</button></div>`
      : `<h2 style="font-family:'Courier New',monospace">SIGNAL LOST</h2><p>Exploration V — feed terminated at an estimated depth that does not exist.</p>
         <div><button data-a="retry">Retry</button> <button data-a="cont">Continue</button></div>`);
    if (!esc) { // static behind the text
      const cv = document.createElement('canvas'); cv.width = 160; cv.height = 90; cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;opacity:.25;z-index:-1;image-rendering:pixelated';
      c.prepend(cv); const g = cv.getContext('2d'), im = g.createImageData(160, 90);
      const loop = () => { if (!c.isConnected) return; for (let i = 0; i < im.data.length; i += 4) { const n = Math.random() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = n; im.data[i + 3] = 255; } g.putImageData(im, 0, 0); requestAnimationFrame(loop); };
      loop();
    }
    c.querySelector('[data-a=retry]').onclick = () => { c.remove(); onRetry(); };
    c.querySelector('[data-a=cont]').onclick = () => { c.remove(); onContinue(); };
    return c;
  }
  // Post-credits: incident log + knocking behind the padded door, 1–2 s apart.
  postCredits(audio, onClose) {
    const c = this.card(`<h2 style="font-family:'Courier New',monospace;font-size:1.1rem">INCIDENT LOG — ADDENDUM</h2>
      <p style="font-family:'Courier New',monospace;text-align:left" class="log"></p><div class="btn" style="opacity:0;transition:opacity 1s"><button>Back to title</button></div>`);
    const log = c.querySelector('.log');
    const lines = ['Two weeks after Exploration V.', 'Night staff report knocking from inside the stairwell door.',
      'The door has been lined with six centimetres of industrial padding.', 'The knocking continues. Interval: one to two seconds.', ''];
    let i = 0; const typeLine = () => { if (i < lines.length) { log.innerHTML += lines[i++] + '<br>'; setTimeout(typeLine, 1800); } };
    typeLine();
    let knocks = 0; const knock = () => { if (!c.isConnected || knocks > 14) { log.innerHTML += '<br>[ knocking stopped ]'; c.querySelector('.btn').style.opacity = 1; return; }
      if (knocks > 2 && !series) audio.knock(); knocks++; setTimeout(knock, 1000 + Math.random() * 1000); };
    const series = !!(audio.knockSeries && audio.knockSeries(6)); // real module plays the 1–2 s series itself
    setTimeout(knock, 3000);
    c.querySelector('button').onclick = () => { c.remove(); onClose && onClose(); };
  }
  pause(on) {
    if (on && !this._pause) { this._pause = this.card('<h2>PAUSED</h2><p>Click to keep descending.</p><small>WASD move · Shift sprint · Mouse look · Esc pause</small>'); this._pause.style.background = 'rgba(0,0,0,.8)'; this._pause.onclick = () => this.onResume && this.onResume(); }
    if (!on && this._pause) { this._pause.remove(); this._pause = null; }
  }
  destroy() { this.root.remove(); }
}
