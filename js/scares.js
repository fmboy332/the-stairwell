// scares.js — every scare/event is one entry in SCARES. Oraly: slot story beats in here.
//
// Entry fields:
//   id       unique string
//   depth    metres below the entrance landing before it can fire
//   trigger  (ctx) => boolean, checked every frame once depth is reached (default: fire at once)
//   fn       (ctx, self) => void, runs when it fires
//   repeat   if true it can fire again after `cooldown` seconds (default: fires once)
//   update   optional (ctx, self, dt) => void, runs every frame after it has fired (persistent behaviour)
//   max      optional cap on repeats
//
// ctx: { depth, shownDepth, t, dt, audio, face, hud, camera, player, game }
//   game API: flicker(ms), flashOff(ms), setFlashFailing(bool), echo(sec), lookingDown(),
//             landingAhead(n) -> Vector3 (feet height), aheadOnStairs(dist) -> Vector3,
//             jumpscare(endType), end(type), after(sec, fn), state (shared scratch object)
import * as THREE from '../vendor/three.module.min.js';
import { SEG_H } from './world.js';

const chance = perSecond => ctx => Math.random() < perSecond * ctx.dt;
const v = new THREE.Vector3();

export const SCARES = [
  { id: 'radio_checkin', depth: 0, trigger: c => c.t > 4,
    fn: c => c.hud.radio('CONTROL: Radio check, D-9341. Bodycam is live. Begin your descent and describe what you see.') },

  { id: 'flashlight_flicker', depth: 3, repeat: true, cooldown: 25, trigger: chance(0.05),
    fn: c => c.game.flicker(700 + Math.random() * 900) },

  { id: 'child_crying', depth: 4,
    fn: c => { c.audio.startCry(0); c.game.after(6, () => c.hud.radio('CONTROL: We hear it too. Sounds like a child. Somewhere below you. Keep going.')); },
    // canon: the crying NEVER gets closer — constant distance, fading slightly the deeper you go
    update: c => c.audio.setCryFade(1 - Math.min(0.4, c.depth / 600)) },

  { id: 'footstep_echo', depth: 12, repeat: true, cooldown: 45, trigger: chance(0.06),
    fn: (c, s) => { c.game.echo(14 + Math.random() * 12); if (!s.said) { s.said = true; c.game.after(5, () => c.hud.radio('D-9341: ...my footsteps. They come back one step late.')); } } },

  { id: 'door_above', depth: 30,
    fn: c => { c.audio.door(); c.game.after(2.5, () => c.hud.radio('CONTROL: That was not us. The door is sealed. Continue descending.')); } },

  { id: 'face_glimpse_edge', depth: 42, repeat: true, cooldown: 70, max: 2, trigger: chance(0.25),
    fn: (c, s) => { // at the very edge of the flashlight cone, on the landing ahead; gone when you look straight at it
      const p = c.game.aheadOnStairs(5.2, 0.42); p.y += 1.55; c.face.show(p, 0.04, 1600); s.watch = true;
    },
    update: (c, s) => { if (s.watch && c.face.visible && c.face.lookDot(c.camera) > 0.985) { c.face.hide(); s.watch = false; } } },

  { id: 'radio_dropout', depth: 52,
    fn: c => { c.audio.staticBurst(1.5); c.hud.garble = 0.35;
      c.hud.radio('CONTROL: D-9341, we are losing your sig— ...repeat, return to the— ...');
      c.game.after(9, () => { c.audio.staticBurst(0.8); c.hud.radio('CONTROL: ...still with us? Say something.'); }); } },

  { id: 'face_in_shaft', depth: 60, trigger: c => c.game.lookingDown(),
    fn: (c, s) => { v.set(c.player.position.x < 0 ? 0.28 : -0.28, c.player.position.y - 2 * SEG_H, Math.min(2.6, Math.max(0.4, c.player.position.z))); c.face.show(v, 0.35, 2600, { noFog: true }); s.watch = true; c.audio.heartbeat(120); },
    update: (c, s) => { if (s.watch && c.face.visible && !c.game.lookingDown()) { c.face.hide(); s.watch = false; } } },

  { id: 'distant_scrape', depth: 20, repeat: true, cooldown: 50, trigger: chance(0.03),
    fn: c => c.audio.scrape() },

  { id: 'light_dies', depth: 68, repeat: true, cooldown: 55, trigger: chance(0.04),
    fn: c => c.game.flashOff(2000) },

  { id: 'depth_meter_wrong', depth: 80,
    fn: c => { c.hud.depthWrong = true; c.hud.garble = 0.5;
      c.hud.radio('CONTROL: Your depth readout can\'t be right. That\'s below the foundations. Below the bedrock survey.'); } },

  { id: 'silence_then_sting', depth: 100,
    fn: c => { c.audio.silence(); c.hud.radio('');
      c.game.after(3.6, () => {
        const p = c.game.aheadOnStairs(2.4, 0); p.y += 1.5; c.face.show(p, 0.12, 650);
        c.audio.sting(0.85); c.game.flicker(600);
        c.game.after(1.2, () => c.audio.unsilence(2.5));
      }); } },

  { id: 'face_stalks', depth: 120,
    fn: (c, s) => { s.pos = c.game.landingAhead(2).add(new THREE.Vector3(0, 1.5, 0)); c.face.show(s.pos, 0.05); s.last = c.t; s.on = true; },
    // it moves only while you are not looking at it (or the light is off); it gets closer every time
    update: (c, s) => {
      if (!s.on || c.game.state.climax) { if (s.on) { s.on = false; c.face.hide(); } return; }
      if (!c.face.visible) c.face.show(s.pos, 0.05);
      const watched = c.face.lookDot(c.camera) > 0.75 && c.game.flashOn();
      const eye = c.camera.position, d = s.pos.distanceTo(eye);
      if (d > 14) { s.pos.copy(c.game.landingAhead(1)).y += 1.5; }           // you left it behind: it's ahead again
      if (!watched && c.t - s.last > 0.9) { s.last = c.t; v.subVectors(eye, s.pos).normalize().multiplyScalar(Math.min(1.4, d)); s.pos.add(v); c.face.show(s.pos, 0.05); }
      if (watched) s.last = c.t;
      if (d < 1.1) { s.on = false; c.game.jumpscare('signal_lost'); }
    } },

  { id: 'climax', depth: 150,
    fn: (c, s) => {
      c.game.state.climax = true; c.audio.stopCry(); c.audio.silence(); 
      s.pos = c.game.aheadOnStairs(2.0, 0); s.pos.y += 1.5; c.face.show(s.pos, 0.18);
      c.audio.sting(1); c.game.setFlashFailing(true);
      s.goalY = c.player.position.y + 2 * SEG_H; s.start = c.t; s.on = true;
      c.hud.objective('RUN. GET BACK UP.');
      c.hud.radio('CONTROL: GET OUT OF THERE. Come back up, now!');
    },
    update: (c, s, dt) => {
      if (!s.on) return;
      const eye = c.camera.position, d = s.pos.distanceTo(eye);
      if (c.t - s.start > 1.2) { // a beat of stillness, then it follows
        const speed = 1.15 + Math.min(0.6, (c.t - s.start) * 0.02);
        v.subVectors(eye, s.pos).normalize().multiplyScalar(speed * dt); s.pos.add(v); c.face.show(s.pos, 0.18);
        if (c.t - (s.hb || 0) > 2) { s.hb = c.t; c.audio.heartbeat(150); }
      }
      c.hud.objective(`RUN. GET BACK UP.  ${Math.max(0, s.goalY - c.player.position.y).toFixed(1)} m`);
      if (c.player.position.y >= s.goalY) { s.on = false; c.face.hide(); c.game.end('escape'); }
      else if (d < 0.9) { s.on = false; c.game.jumpscare('signal_lost'); }
    } },
];

// Runs the SCARES list. Keeps per-scare state; level.js calls tick() every frame.
export class ScareDirector {
  constructor(list = SCARES) { this.list = list; this.state = new Map(list.map(s => [s.id, { fired: 0, lastT: -1e9 }])); }
  tick(ctx) {
    for (const s of this.list) {
      const st = this.state.get(s.id);
      if (st.fired && s.update) s.update(ctx, st, ctx.dt);
      if (ctx.depth < s.depth) continue;
      if (st.fired && (!s.repeat || (s.max && st.fired >= s.max) || ctx.t - st.lastT < (s.cooldown || 0))) continue;
      if (ctx.game.state.climax && s.id !== 'climax') continue;
      if (s.trigger && !s.trigger(ctx)) continue;
      this.fire(s.id, ctx);
    }
  }
  fire(id, ctx) {
    const s = this.list.find(x => x.id === id), st = this.state.get(id); if (!s) return;
    st.fired++; st.lastT = ctx.t; s.fn(ctx, st);
    ctx.game.emit('scare', id);
  }
}
