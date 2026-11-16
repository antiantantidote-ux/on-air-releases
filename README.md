# El Dios Presidente

A god-game / banana-republic dictator sim for **Android TV**, played entirely with a
**DualShock 4**. You are the ancient island deity of San Milagro, who has discovered that
rigged elections scale better than blood sacrifice.

**Status: Phase 1 of 4** — engine, island, water, day/night, the Divine Hand (grab / throw),
orbit camera, radial-wheel framework, 10-foot HUD.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Rendering | Three.js r187 (WebGL2), vendored in `web/vendor` | Low-poly + instancing fits a 150-draw-call budget; no CDN, runs offline |
| Input | W3C Gamepad API | Android's WebView maps the DS4 to the standard layout, including rumble |
| Game code | Plain ES modules, no build step | `web/` is the game; edit and reload |
| TV packaging | `android/` — one-Activity WebView shell (leanback launcher) | Packages `web/` as APK assets |

## Run it

```sh
npm run dev            # http://localhost:8080 — plug in a DS4 and press any button
```

Build the Android TV APK (needs the Android SDK; open `android/` in Android Studio, or):

```sh
cd android && gradle assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk
```

## Controls (DualShock 4)

| Input | Action |
| --- | --- |
| Left stick | Move the Hand (camera follows outside a deadzone) |
| Right stick | Orbit (X) / pitch (Y) camera; aims the radial wheels |
| R2 | Hold = grab, release while moving = throw. Tap = latch in the fist, tap again = let go |
| L2 (hold) | Precision slow-move (the Hand points) |
| L1 (hold) | Requisitions & Edicts wheel — ✕ confirm, ○ back |
| R1 (hold) | Miracles wheel |
| ✕ | Bless / poke whatever is under the Hand |
| □ | Inspect citizen, cargo or terrain |
| ○ | Close card / set down the held object |
| △ | Snap to Palace ↔ Creature's Nest |
| D-pad | ← pause · ↑ 1× · → 2× · ↓ replay advisor alerts |
| Options / touchpad click | Almanac del Presidente |

Keyboard mirror for desk debugging: WASD = left stick, arrows = right stick, Space = R2,
Shift = L2, Q/E = L1/R1, Enter = ✕, F = □, Esc = ○, T = △, 1/2/3/4 = D-pad ←/↑/→/↓, Tab = Options.

## Code map (`web/src`)

| File | Responsibility |
| --- | --- |
| `main.js` | Bootstrap, frame loop, wheel contents, dynamic resolution |
| `input.js` | DS4 polling, deadzones, edge detection, rumble, keyboard mirror |
| `terrain.js` | Seeded heightfield island, vertex colours, baked AO, height queries |
| `water.js` | One-draw-call water shader (waves, depth tint, shore foam) |
| `sky.js` | Day/night cycle, sun/moon light, sky dome, fog |
| `scenery.js` | Instanced palms / jungle / rocks, palace, nest |
| `entities.js` | Instanced grabbables + ballistic physics, islander behaviour |
| `hand.js` | The glove, grab/throw state machine, ground decals |
| `camera.js` | Deadzone-follow orbit rig |
| `radial.js` | Data-driven radial wheel (sub-wheels supported) |
| `hud.js` | Top bar, hints, advisors, inspect card, Almanac |

## Test

`npm test` (with `npm run dev` running and Playwright installed) boots the game in headless
Chromium with a simulated DS4 and exercises every Phase 1 control, the draw-call budget and
the minimum-font-size rule.

## Roadmap

1. **Engine, island, camera, DS4 Hand** — done
2. City building, citizens, Peso/Mana economy
3. The Creature and its reinforcement learning (the egg in the Nest hatches)
4. Morality morphing, costed miracles and edicts, factions, advisors
