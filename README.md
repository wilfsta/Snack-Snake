# Snack Snake

A funny Snake game where you gobble the right answers. Start in the **Number Garden** (ages 5+: counting, then adding within 10 – no reading needed, nothing can go wrong; earn ⭐ stars to grow your garden and dress Sid in hats, glasses and patterns), or pick times tables, adding, taking away or dividing, or Classic (original rules).

**Players**: up to 6 children can each have their own Sid, stars, garden, learning progress and options (tap the player chip on the menu). Saves from before profiles become Player 1.

**Options** (main menu or pause): snake speed, wrap-around vs deadly walls, and how many answers appear (2–6, fewer = easier).

## Run it

```bash
npm install
npm run dev      # http://localhost:5173 (also printed: a Network URL for phones/tablets on the same Wi-Fi)
npm test         # unit + simulation tests (Vitest)
npm run build    # type-check + production build into dist/
npm run preview  # serve the production build (also LAN-accessible)
```

## Controls

| Action  | Keyboard            | Gamepad (DualShock 4 / DualSense / standard) | Touch                       |
|---------|---------------------|----------------------------------------------|-----------------------------|
| Steer   | Arrow keys / WASD   | D-pad or left stick                          | On-screen pad, or swipe     |
| Confirm | Enter / Space       | ✕ (Cross)                                    | Tap                         |
| Back    | Backspace           | ○ (Circle)                                   | Back button                 |
| Pause   | Esc / P             | Options                                      | ⏸ button                    |

Menus are navigable with arrows/D-pad. Press a controller button once if the browser hasn't detected it yet.

## Architecture

```
src/
  app/        App = router + top-level state machine. controllers/ (Menu, Game, Backdrop) and services/ (Settings, Progress)
  worlds/     World definitions (Number Garden): theme + a learning path across subjects + warm-up + visit length
  rewards/    Stars (earned for effort and progress, never taken away), garden plants, Sid's wardrobe catalogue
  game/       Grid-authoritative Snake: SnakeSession (in-game phase machine), Snake, Arena, collision, spawner, scoring, modes
  learning/   Subject-agnostic: Challenge/ChallengeSource interfaces, LearningEngine (adaptive selection), LearningTracker, mastery rules
  content/    Educational content plug-ins. arithmetic/ = ×, +, −, ÷ operations (facts introduced in order 1..12); ContentLibrary routes between subjects
  render/     Canvas: GameRenderer, SnakeRenderer + SnakeAnimator (emotions), skins, tiles, effects
  input/      InputManager merging KeyboardInput, GamepadInput, TouchInput into abstract directions/actions
  audio/      AudioManager (synthesised placeholder sounds; `registerAsset(id, url)` to use real files)
  storage/    StorageManager behind a KeyValueStore interface (localStorage today)
  ui/         DOM menus, HUD, teaching banner, spatial focus navigation
```

Dependency direction: **game → learning interface ← content**. `SnakeSession` only calls
`ChallengeSource.next()` / `.record(event)` and never knows the subject. To add a subject, implement
`LearningContent` (see `content/multiplication/MultiplicationContent.ts`).

Configurable rules live in `game/modes.ts` (wall wrap vs solid, wrong-answer and self-collision behaviour, speed).
Snake characters are data in `render/skins.ts` (colours, pattern, accessories hook).
