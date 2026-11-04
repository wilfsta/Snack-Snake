# Snack Snake

A funny Snake game where you gobble the right answers. Start in the **Number Garden** (ages 5+: a journey of numerals and sums – numbers in order, one more/less, number bonds, adding and taking away, to the foundations of multiplication. It quietly finds what each child already knows and starts there – no tests, nothing can go wrong; earn ⭐ stars to grow your garden and dress Sid in hats, glasses and patterns), or pick times tables, adding, taking away, dividing, fractions (e.g. ¾ of 12) or percentages (e.g. 25% of 80), or Classic (original rules).

**How a Garden question works:** collect the question → Sid keeps moving slowly while the child thinks (the question stays big on screen) → the answers appear → collect the right one. Thinking time is set per fact (more for new things, less for well-known ones) in `src/learning/pacing.ts`. A brand-new player first eats 5 plain apples to learn the controls; returning players go straight to maths. Classic Snake is apples only.

**Revision without repeating levels:** a fact the child gets wrong comes back once, a few questions later in the same visit. Every 5th question looks back at earlier material: facts that keep going wrong come first (taking turns with quiet re-checks of anything skipped), then well-known facts that haven't come up for a long while. Revision stays a small share of play, so a child who knows their numbers keeps moving towards multiplication.

**Players**: up to 6 children can each have their own Sid, stars, garden, learning progress and options (tap the player chip on the menu). Saves from before profiles become Player 1.

**Options** (main menu or pause): snake speed, wrap-around vs deadly walls, and how many answers appear (2–6, fewer = easier).

**Grown-ups** (Options → 👪 Grown-ups, behind a "what is 7 × 8?" check that's asked again after 10 minutes): a dashboard with a card per child – when they last played, what they're learning now, this week's days / questions / % right first time / minutes compared with the week before, a 14-day activity chart and the facts that need practice – plus a full report per child (every Garden skill marked learnt, already known, learning now or not yet). From there you can **save a backup** file of every player and **load** it on another device; loading never replaces newer progress. If the browser isn't saving (some private-browsing modes, or storage full), Options and the dashboard say so.

**Unfinished visits:** if a child leaves a Garden visit partway and comes back within 3 hours, the visit carries on (questions done and stars so far), instead of starting again.

**Privacy:** no accounts, adverts, purchases or tracking, and no requests to other sites (the font ships with the game). Everything is stored in the browser on that device; a backup file only exists when a grown-up saves one.

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

**Playtesting:** add `?debug` to the address (e.g. `http://localhost:5173/?debug`) to see what the learning engine is thinking – frontier, confidence, which skill groups are secure/assumed, and why each question was asked. It has buttons to reset the current player. Press ` (backtick) to fold it away. Children never see it. It also has **playtest switches** for trying versions of the Garden with a real child: Sid slows down vs stops while the child thinks, thinking time 50–200%, and 2, 3 or 4 answers. They apply from the next Garden visit, are kept on that device only, and are ignored without `?debug`. **Visit notes** record each Garden visit (length, finished or not, right first time, hints, facts missed, bumps, the switches in use); add a comment on the last visit and **Copy all** to paste them anywhere.

## Publishing

**Live at https://wilfsta.github.io/Snack-Snake/** – every push to `main` runs the tests, builds and publishes it (`.github/workflows/deploy.yml`; GitHub Pages must be set to "GitHub Actions" under Settings → Pages). `npm run build` produces a static site in `dist/`: it can also be uploaded to any static host (GitHub Pages, Netlify, Cloudflare Pages, your own server). Paths are relative, so it works at a domain root or in a subfolder. No server code or database is needed.

- **HTTPS** is required for the offline mode and "Add to Home Screen" (every host above provides it).
- **Offline:** once opened, the game works without a connection (`public/sw.js`). New versions arrive the next time it's opened online. If you change `sw.js` itself in a way that must drop old caches, bump `CACHE` in it.
- **Phones:** Android's back gesture/button pauses a game or goes back a screen instead of leaving (a second Back without touching the screen still leaves); the screen stays on only while a game is being played; long-press menus are blocked; and the published page carries a Content Security Policy so it can only load its own files (added at build time in `vite.config.ts`).
- **Link previews** use the full address of `og-image.png` (`og:image` in `index.html`); change it if the game moves.
- Icons and the web app manifest are in `public/` (`icon.svg` is the source; the PNGs are rendered from it).

## Architecture

```
src/
  app/        App = router + top-level state machine. controllers/ (Menu, Game, Backdrop, Profile, Wardrobe, GrownUp) and
              services/ (Settings, Progress, Profile, Reward, Backup, dashboard summaries); debug/ = ?debug panel + playtest notes
  worlds/     World definitions: theme + curriculum + warm-up + visit length. gardenCurriculum = the Number Garden journey
  rewards/    Stars (earned for effort and progress, never taken away), garden plants, Sid's wardrobe catalogue
  game/       Grid-authoritative Snake: SnakeSession (in-game phase machine), Snake, Arena, collision, spawner, scoring, modes
  learning/   Subject-agnostic: Challenge/ChallengeSource interfaces, LearningEngine, LearningTracker, mastery rules;
              curriculum (stages > skill groups > items), placement (edge-finding, provisional "assumed" groups), CurriculumSession
  content/    Educational content plug-ins. arithmetic/ = ×, +, −, ÷, fractions and percentages of an amount (facts introduced in order 1..12); ContentLibrary routes between subjects
  render/     Canvas: GameRenderer, SnakeRenderer + SnakeAnimator (emotions), skins, tiles, effects
  input/      InputManager merging KeyboardInput, GamepadInput, TouchInput into abstract directions/actions
  audio/      AudioManager (synthesised placeholder sounds; `registerAsset(id, url)` to use real files)
  storage/    StorageManager behind a KeyValueStore interface (localStorage today), save status, backup files, sync record shape
  ui/         DOM menus, HUD, teaching banner, spatial focus navigation
```

Dependency direction: **game → learning interface ← content**. `SnakeSession` only calls
`ChallengeSource.next()` / `.record(event)` and never knows the subject. To add a subject, implement
`LearningContent` (see `content/multiplication/MultiplicationContent.ts`).

Configurable rules live in `game/modes.ts` (wall wrap vs solid, wrong-answer and self-collision behaviour, speed).
Snake characters are data in `render/skins.ts` (colours, pattern, accessories hook).
