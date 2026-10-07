# CREATOR BITOS VS PROBLEMS IN LIFE (THE GAME)

An original, cinematic 2D stickman fighting game. You play **Creator Bitos**, an artist
who has to fight his way through ten personified Problems — Laziness, Gadget, Addiction,
Lust, Society, Suicide, Suffering, Wrath, School (four forms) and Seizure — before they
bury the work he is trying to make.

Everything here is original: the characters, the arenas, the music, the code. Mortal
Kombat, Tekken and Street Fighter were high-level inspiration for *genre conventions
only* — no characters, UI layouts, assets or music are copied from them.

**No Node. No Express. No build step. No `npm install`.** The game is plain HTML, CSS
and ES modules that run on any static host — GitHub Pages, Netlify, Vercel, S3, or a USB
stick. Accounts and progression work everywhere, with or without a server.

---

## Play it

```bash
npm run dev          # http://localhost:3000  (zero-dependency static server)
```

That's it — there is nothing to install. Any static server works just as well:

```bash
python3 -m http.server 3000 --directory public
npx serve public
```

> **Why a server at all?** The game uses ES modules, which browsers refuse to load from
> `file://` for security reasons. Any HTTP server fixes that; double-clicking
> `public/index.html` will not.

---

## Deploying to GitHub Pages

The repository ships a ready-made workflow: **`.github/workflows/deploy-pages.yml`**.

1. Push to GitHub.
2. *Settings → Pages → Source* → **GitHub Actions**.
3. Push again (or run the workflow). The `public/` folder is published.

Two safety nets are already in place for the common mistakes:

- **`index.html` at the repository root** forwards any host that publishes the repo root
  into `public/index.html`. (Without it, GitHub Pages serves the README or a 404.)
- **`.nojekyll`** in both the root and `public/` stops GitHub from mangling the build.

Other hosts need no configuration, but two small files are included anyway:
`vercel.json` (`outputDirectory: public`) and `netlify.toml` (`publish = "public"`).

---

## Accounts and your player database

The game probes for a backend on start-up and tells you which mode it is in
(bottom of the Auth screen, and *Extras → Database*).

| Mode | When | Where data lives | Password storage |
| --- | --- | --- | --- |
| **Online** | `/api/health` answers | your server → JSON file or Google Sheets | scrypt (Node backend) |
| **Offline** | no backend reachable (static hosts) | this browser | PBKDF2-SHA256, 250 000 iterations, random salt |

Offline mode is **not** a degraded demo: sign-up, sign-in, validation, unlocks, settings,
statistics and progression all work, and they persist between sessions. Passwords are
hashed either way — a plaintext password is never written anywhere, and the hash is
stripped before a record is handed to the game.

### Option A — no backend (default)

Do nothing. Deploy the folder. Accounts live in each player's browser.

### Option B — the optional Node server

Still Express-free and dependency-free; it uses only `node:http`.

```bash
npm run server        # static site + accounts API on :3000
```

Writes to `server/data/players.json`. Handy for local play with a shared database.

### Option C — Google Sheets, with no server at all

Use the included **Google Apps Script** backend. It runs inside Google, so the
spreadsheet credentials never touch the game, the browser, or a config file:

1. Make a spreadsheet with a tab named **Players**.
2. *Extensions → Apps Script*, paste in `server/google-apps-script/Code.gs`, save.
3. *Deploy → New deployment → Web app*, **Execute as: Me**, **Access: Anyone**.
4. Copy the `/exec` URL and open the game with it:

   ```
   https://you.github.io/creator-bitos/?api=https://script.google.com/macros/s/ABC/exec
   ```

   (The URL is remembered per browser. Run `testAll()` in the Apps Script editor to
   self-test the backend.)

The client contract is identical across all three options, so switching never changes
game code. Passwords in the Apps Script path use PBKDF2-SHA256 at 250 000 iterations —
the same primitive as offline mode — because Apps Script has no scrypt.

If a backend is configured but unreachable, the game says so plainly
("DATABASE: UNREACHABLE — PROGRESS WILL NOT SAVE") rather than pretending it saved.

---

## Controls

Keyboard, rebindable in **Settings → Controls** (saved per account). Mouse and
`Enter`/`Esc` work in menus.

| | Player 1 | Player 2 (local versus) |
| --- | --- | --- |
| Move | `A` `D` | `←` `→` |
| Jump / Crouch | `W` `S` | `↑` `↓` |
| Block | `Space` | `Numpad0` / `Right Shift` |
| Light / Heavy Punch | `J` `K` | `Numpad1` `Numpad2` |
| Light / Heavy Kick | `U` `I` | `Numpad4` `Numpad5` |
| Special / Ultimate | `O` `P` | `Numpad7` `Numpad8` |
| Pause / Back | `Esc` | `Numpad.` |

---

## How it plays

- **Campaign** — ten rounds in order. Clearing one unlocks the next and unlocks that
  Problem as a playable fighter in Training.
- **Training** — any unlocked fighter vs an immortal dummy, with hitbox/hurtbox overlay,
  infinite meter and no timer.
- **Versus (PVP)** — local two-player, locked until all ten rounds are cleared. The menu
  says so instead of pretending to work.
- **Extras** — story, character database, combat glossary, controls, unlock checklist,
  animation gallery, cinematics, jukebox, lifetime stats, credits. Every character entry
  is drawn with its live animation.
- **Settings** — audio, video, gameplay, accessibility, controls. Changes apply instantly
  and persist.

Combat runs on a fixed 60 Hz simulation with real hitboxes and hurtboxes, damage,
knockback, hit stun, block stun, chip damage, hit stop, combo cancels, cooldowns, meter,
projectiles, summons, armour, throws and per-character specials.

### The opening cinematic

Roughly 26 seconds, skippable at any moment with any key, and replayable from Extras:

`black → awaken → rise → silhouettes → resolve → stance → surround → clash → survive → title`

It is staged with a moving camera (slow push-in, wide pull-back, punch-zoom on impacts),
backlight haze and rim lighting so silhouettes read against the dark, staggered enemy
reveals, a choreographed clash with hit stop and shockwave rings, one slow bloom, film
grain, a vignette and a letterbox gate. It also has its own music track.

---

## Content notes

Two rounds deal with heavy subjects on purpose, and both are handled seriously:

- **Suicide (round 6)** is framed as *overcoming a crisis and reaching for help*. It is
  never glamourised, never a joke, and the round ends with a resources card.
- **Seizure (round 10, final boss)** is symbolic — the chaos of a mind losing control,
  not a medical condition you "cure by winning". There is **no rapid flashing**:
  instability comes from camera movement, background distortion, colour transitions,
  audio and controlled pulses. `tools/flash-test.js` measures whole-screen luminance
  every frame of the highest-risk scenes and fails the build if anything strobes
  (WCAG/Harding: under 3 flashes per second, no repeated swings, no hard strobe frames).

The accessibility tab also ships effect-scale, screen-shake and flash reductions, plus
high-contrast text and subtitles.

---

## Project layout

```
index.html            root entry — forwards repo-root hosts into public/
.nojekyll             tells GitHub Pages not to rebuild the site
vercel.json           Vercel: publish public/
netlify.toml          Netlify: publish public/
.github/workflows/    one-click GitHub Pages deployment

public/               ← this folder IS the deployed game
  index.html          canvas + boot shell
  styles/ui.css       DOM overlays
  src/
    main.js           bootstrap: surface, input, 12 scenes, 60 Hz loop
    core/             canvas, input, events, loop, scene manager, state,
                      api (online + offline), local-accounts, utils
    config/           settings schema, difficulty curves
    animation/        skeleton solver, 28 clips, stickman renderer,
                      particles, camera, hit-stop clock
    characters/       roster (11 fighters) + movesets
    combat/           fighter, match, projectiles, summons
    ai/               controller + per-enemy personalities
    arenas/           13 hand-painted arenas
    audio/            synthesiser, music, SFX (no audio files at all)
    ui/               widgets and battle HUD
    scenes/           boot, loading, auth, intro, menu, campaign, battle,
                      results, training, versus, extras, settings

server/               OPTIONAL — the game never requires it
  index.js            static host + accounts API (node:http only)
  routes/api.js       /api/health /auth/* /me /roster
  lib/                auth (scrypt), campaign rules, adapter interface
  adapters/           json-store.js, google-sheets-store.js
  google-apps-script/ Code.gs — the serverless Sheets backend

tools/                test + QA harness (not shipped)
```

---

## Testing

```bash
npm run check     # 176 checks, no server needed
npm test          # the above + 32 live API checks (needs `npm run server`)
```

| Suite | Checks | Covers |
| --- | --- | --- |
| `smoketest.js` | 51 | combat, frame data, all 4 difficulties, boss phases, summons, rig + all 28 animation clips |
| `scene-smoke.js` | 38 | all 12 scenes for real frame counts, NaN-geometry guard, bounds, HP/meter, rebinding |
| `store-test.js` | 42 | adapter round-trips, atomic writes, corrupt-file recovery, hashing, sessions |
| `flash-test.js` | 12 | per-frame luminance on Seizure, Suffering and the intro |
| `static-test.js` | 33 | static deployment, offline accounts, Apps Script mode, credential leaks |
| `api-test.js` | 32 | live HTTP API (needs the server) |

Runs are **deterministic**: every suite seeds `Math.random` (`tools/seed-random.js`), so
AI-vs-AI measurements are identical run to run instead of flaky.

Several of these suites exist because of bugs they caught in this repo — the skeleton
solver was drawing the torso downwards, root-motion offsets authored in pixels were
scaled by character height (launching fighters off-screen mid-attack), the camera bounds
clamp inverted at high zoom, and array fields were corrupted on reload. All fixed, all
with regression tests.

### Offline visual QA

There is no browser in CI, so `tools/capture.js` runs the real scene code in Node against
`tools/recorder.js` (a Canvas2D implementation that resolves transforms and records draw
calls); `tools/render_png.py` rasterises those to PNG with Pillow, and
`tools/ascii_preview.py` prints them as text. That pipeline is how the framing, grounding
and layout bugs above were found and confirmed fixed.

```bash
node tools/capture.js                                              # capture scenes
python3 tools/render_png.py tools/out/menu.json tools/out/menu.png  # to PNG
python3 tools/ascii_preview.py tools/out/menu.png                   # to text
```

---

## Licence

MIT. Original work; do not redistribute under the name of an existing franchise.
