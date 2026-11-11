# The Stairwell (inspired by SCP-087)

A static three.js first-person horror game that runs on GitHub Pages: no build step, no CDN.

## Run locally
    cd scp087-game && python3 -m http.server 8000
    open http://localhost:8000/        (add ?debug=1 for the true-depth/fps readout and PgDn/PgUp teleport)
ES modules need http://, so it won't work from file://.

## Controls
- Click **Begin descent**, then click the intro card to lock the mouse.
- WASD or arrows to walk. Shift to sprint (limited stamina). Mouse to look. Esc to pause.
- No jumping. Look down over the railing to see into the shaft.

## Files
- `index.html`, `js/main.js`: Poby's menus. `startGame()` calls `startLevel()`.
- `js/level.js`: renderer, player, flashlight, endings. Exports `startLevel`, `playPostCreditsLog` and `SCARES`.
- `js/world.js`: the endless recycled stairwell. Canon layout: 13 steps at about 38°, semicircular 3 m landings, 180° turns. Includes the analytic collision.
- `js/scares.js`: **the `SCARES` array** (`{id, depth, trigger, fn, repeat, cooldown, max, update}`) and `ScareDirector`.
- `js/face.js`: the original procedural SCP-087-1 face (no pupils, no nose, no mouth).
- `js/hud.js`: the bodycam readout, radio subtitles, grain and vignette, intro card, jumpscare, endings, and the post-credits knocking log.
- `js/sound.js`: an adapter. It uses Mr. Fart's `js/audio.js` when present and falls back to `js/audio-placeholder.js`.
- `vendor/`: three.js r160 (MIT).

## Hooks
- Game events: `game.on('scare', id => …)` and `game.on('ending', type => …)`, where type is `'escape'` or `'signal_lost'`.
- `startLevel({ canvas, settings, onEnd })`: `onEnd(type)` runs when the player presses Continue on the ending card. main.js shows the credits there, then plays `playPostCreditsLog()` after 10 s.
- The debug and test handle is `window.__stairwell`, with `teleport(depth)`, `fire(id)`, `face` and `director`.
