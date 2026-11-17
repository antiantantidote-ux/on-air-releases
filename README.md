# El Dios Presidente

A god-game / banana-republic dictator sim for **Android TV**, played entirely with a
**DualShock 4**. You are the ancient island deity of San Milagro, who has discovered that
rigged elections scale better than blood sacrifice.

**Status: all four phases complete (vertical slice)**

- Phase 1 — engine, island, water, day/night, the Divine Hand (grab / throw), orbit camera,
  radial-wheel framework, 10-foot HUD.
- Phase 2 — building placement and construction, supply chains (sugar → rum, tobacco →
  cigars), dock exports by freighter, islanders with five needs and a job/eat/pray/sleep/protest
  state machine, the Peso and Mana loops, costed miracles and edicts.
- Phase 3 — El Mascota Supremo: choose a giant Capybara, Jaguar or Macaw, which hatches at the
  Nest and acts on its own. Pet it (Square) or slap it (Circle) to reshape its behaviour.
- Phase 4 — two alignment axes that morph the island, the full miracle and edict sets, four
  factions, guerrillas, elections, plague, procedural music, and win/lose endings.

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
| R2 | Hold = grab, release while moving = throw. Tap = latch in the fist, tap again = let go. Over the Creature: leash / unleash (it follows the Hand) |
| L2 (hold) | Precision slow-move (the Hand points) |
| L1 (hold) | Construction & Edicts wheel (Farms, Industry, Civic, Requisition, Edicts, Demolish) — ✕ confirm, ○ back |
| R1 (hold) | Miracles wheel (costs Mana) and Mascota commands |
| ✕ | Bless an islander; bless a building (10 Mana: ×2.5 output for 30 s, or +20% construction). In blueprint mode: build |
| □ | Inspect islander, building, cargo or terrain. In blueprint mode: rotate 45°. **Over the Creature: pet** |
| ○ | Close card / set down the held object / cancel blueprint or demolish mode. **Over the Creature: slap** |
| △ | Snap to Palace ↔ Creature |
| D-pad | ← pause · ↑ 1× · → 2× · ↓ replay advisor alerts |
| Options / touchpad click | Almanac del Presidente (D-pad ←/→ flips between the economy, the Creature's mind, and politics) |

Keyboard mirror for desk debugging: WASD = left stick, arrows = right stick, Space = R2,
Shift = L2, Q/E = L1/R1, Enter = ✕, F = □, Esc = ○, T = △, 1/2/3/4 = D-pad ←/↑/→/↓, Tab = Options.

## How the economy works

- **Pesos** come from the dock: farm and factory workers haul finished goods there and a
  freighter buys the lot every 70 seconds or so. Wages and upkeep are paid at midnight.
- **Mana** comes from prayer — a trickle at the palace, four times faster in a cathedral.
- **Islanders** need Food, Housing, Healthcare, Liberty and Faith. Hungry ones eat at a
  plantain farm, sick ones need a clinic, unhappy ones protest at the palace. Grabbing and
  throwing them costs Liberty.
- **The Hand is part of the economy**: drop a crate on a building site for +25% progress, drop
  cargo on the dock to export it, drop an islander on a workplace to give them that job.

## Alignment, politics and how it ends

- **Alignment** has two axes: Benevolent ↔ Ruthless and Spiritual ↔ Corrupt. Healing, rain,
  clinics and blessings push one way; meteors, martial law, dunking citizens and a man-eating
  Creature push the other. Rigged elections and taxes are Corrupt; cathedrals are Spiritual.
- **Island morphing** follows Benevolence: lush saturated foliage, turquoise water and sunbeams
  on the palace — or ashen land, murky water, smog, obsidian spikes and loudspeakers. The
  procedural score cross-fades between a salsa and a brass march.
- **Miracles (R1, Mana):** Rainstorm, Heal Plague, Convert, Meteor Strike, Move the Sun, Tricks.
- **Edicts (L1, Pesos):** Free Rum Rations, Mardi Gras Tax, Mandatory Siesta, Martial Law,
  Rigged Elections.
- **Factions:** Campesinos, Industrialists, the Devout and the Junta each have an approval
  rating driven by the state of the island and by your edicts. A faction left under 25% loses
  members to the **guerrillas**, who camp in the jungle and raid the palace in groups of five.
  Pluck rebels out by Hand, drop them on a cathedral to re-educate them, Convert them, or
  let the guards and the Creature deal with them.
- **Elections** are held every fourth midnight unless rigged or suspended by martial law.
- **You win** by completing the Golden Ziggurat-Casino (L1 → Civic, $9,000).
  **You lose** if you are voted out, the palace falls to a raid, or Faith collapses.

## How the Creature learns

Every few seconds the Creature works out its dominant **drive** — Hungry, Tired, Unrest (there
are protesters), Diligent (there is work) or Playful — and samples one of eleven **actions**
from that row of a weight matrix: water crops, help build, haul goods, dance, preach, eat
plantains, eat a citizen, smash a building, scare protesters, sleep, play.

- **Pet (Square)** multiplies the weight of what it is doing, or did in the last 12 seconds, by
  up to 1.45. **Slap (Circle)** multiplies it by as little as 0.5 and stops the deed cold.
- Feedback fades the longer you wait, and 30% of each lesson carries over to the same action
  under the other drives.
- Slaps cost **trust**; a Creature with low trust ignores orders from the R1 wheel.
- Species differ in starting instincts and in bonuses (the Capybara waters and dances twice as
  well, the Jaguar scatters protesters twice as far, the Macaw's sermons raise twice the Mana).
- The Almanac's second page shows the whole matrix as a dot grid: bigger = more likely,
  green = rewarded, red = punished.

## Code map (`web/src`)

| File | Responsibility |
| --- | --- |
| `main.js` | Bootstrap, frame loop, wheel contents, dynamic resolution |
| `input.js` | DS4 polling, deadzones, edge detection, rumble, keyboard mirror |
| `terrain.js` | Seeded heightfield island, vertex colours, baked AO, height queries |
| `water.js` | One-draw-call water shader (waves, depth tint, shore foam) |
| `sky.js` | Day/night cycle, sun/moon light, sky dome, fog |
| `scenery.js` | Instanced palms / jungle / rocks, palace, nest |
| `entities.js` | Instanced grabbables + ballistic physics, islander bodies (walking, swimming) |
| `buildings.js` | Building definitions and models, placement rules, construction, production, freighter |
| `society.js` | Islander needs and task state machine, jobs, housing, immigration, Peso/Mana ledger |
| `icons.js` | World-space status icons and progress bars (one instanced draw call) |
| `creature.js` | The three Creature models, drive/action utility AI, weight matrix and pet/slap learning |
| `morality.js` | Alignment axes, island morphing (shader mood uniform, palace dressing), rain effect |
| `politics.js` | Factions, guerrillas and raids, elections, plague, win/lose conditions |
| `music.js` | Procedural Web Audio score that follows alignment |
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
2. **City building, citizens, Peso/Mana economy** — done
3. **The Creature and its reinforcement learning** — done
4. **Morality morphing, miracles, edicts, factions, endings** — done
