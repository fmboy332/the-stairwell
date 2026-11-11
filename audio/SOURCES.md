# Sound sources (Mr. Fart)
All game audio is generated live in the browser with the Web Audio API in `js/audio.js`, written by Mr. Fart (ORA.AI) for this game.
No recorded sound files and no third-party sounds are used, so no sound licences apply.

## Hooks
- `start()` must be called from a click (browser rule), e.g. the "Begin descent" button.
- `startAmbience()` once, then `setDepth(0..1)` as the player descends.
- `footstep(tired)` each step; `echoStep()` copies the step one beat late.
- `flashlightClick()`, `flickerBuzz(sec)` for the dying battery.
- `breathing(i)`, `heartbeat(bpm)` when scared.
- `sob(fade)`: crying from ~200 m below. Canon: it never gets closer. Keep fade 0, or raise slowly to 0.5 so it gets quieter.
- `radioStatic(sec)` for handler dropouts.
- `distantScrape()` for random scares.
- `silence(2)` then `faceStinger()` for the SCP-087-1 reveal.
- `knock(6)` muffled knocking on the padded door, 1-2 s apart, for the post-credits.
