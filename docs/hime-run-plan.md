# hime-run — hand-authored course (plan)

Status: design for the hand-authored, fixed-order endless course.

## Decision

The course is a **hand-authored set of obstacle patterns played in a fixed order,
looping endlessly**, with **fully deterministic placement** (same obstacles, same
positions, every run). This is a memorization game: the player learns the course
and improves by mastering it, not by reacting to fresh randomness each time.

**Non-goals:** no procedural course generation, no runtime clearability/fairness
solver, no distance→difficulty scalar. Difficulty and rhythm are placed by the
author, not derived by a generator. Rationale:

- A human designer places crescendos, rest beats, operation switches, and rhythm
  directly — the qualities the 9-axis analysis identifies as what makes a course
  good — far more cheaply than coercing a generator to emit them.
- Determinism makes the game *learnable*: a known course rewards practice, and
  removes the entire class of "is this fair?" problems by construction (the
  author simply doesn't author an unfair pattern).

## One block, five types

Everything in the world — floor, steps, walls, floating ledges, pits, spikes — is
built from a single `Block` primitive. Its `type` sets both behaviour and look
(they're coupled: one type = one behaviour = one appearance), so there is no
separate look field.

```
Block = { x, y, w, h, type }   // grid-aligned rect, cells × CELL
type:
  'terrain' — solid: stand on top; blocked by (pushed left by) its sides.
              Floor, steps, walls. Drawn as terrain.
  'ledge'   — one-way: pass up through from below, land/stand on from above.
              The floating ledge. Drawn as a thin slab.
  'hazard'  — lethal on touch, VISIBLE (warning colour). Spikes etc. — a death
              you want the player to see and avoid.
  'pit'     — lethal on touch, INVISIBLE. Placed at the bottom of a hole; the
              hole reads as a pit because no floor is drawn there, and the pit
              block itself isn't rendered.
  'coin'    — non-colliding collectible (collection deferred — see Collectibles).
```

`hazard` and `pit` share the lethal behaviour but are separate types because
their look differs (visible vs. not).

- **Floor is explicit `terrain` blocks.** No more "ground always exists at
  GROUND_Y"; the floor is terrain the course lays down. (Data is a list of
  blocks, not a filled grid — a flat stretch is one wide block.)
- **A pit = no floor block there + a `pit` block at the bottom.** Falling in
  touches the pit block and dies. Grid-aligned, so "this cell is a hole" is crisp
  — no fuzzy edge-of-hole math.
- **A floating ledge = a `ledge` block raised above the floor.**

## Death & contact (climb-and-squeeze)

Touching `terrain`/`ledge` is never fatal — only lethal blocks (`hazard`/`pit`)
and the left-edge squeeze kill.

**One collision primitive.** The runner is a single body circle, and *every*
block is resolved the same way: `circleRectMTV` returns the minimum push-out of
the circle from a block rect (the shortest vector that separates them), or null
when clear. The dominant axis of that push says what the contact is — there is no
feet-point or half-width special case anywhere. Landing, the side squeeze, lethal
death and coin pickup all read this one circle:

- **Land on top.** A mostly-vertical *upward* push means the circle is resting on
  a block's top surface — she stands there. `terrain` supports from any side;
  `ledge` only when descending onto it from above (one-way).
- **Side contact pushes you.** A mostly-horizontal *leftward* push from a
  `terrain` block she isn't on top of shoves her left of her home `PLAYER_X`.
  Recovery back home is its own behaviour — see below.
- **Death = squeezed off the left edge** (pushed past the left edge, walled in)
  **or the circle touching a lethal block** (`hazard`, or falling onto a `pit`).
  Because the circle's bottom is the feet, a 1-cell-deep pit kills after exactly
  one cell of fall — landing and death agree by construction.

**Recovery (drift back home).** Once she is free of the block, she eases back to
`PLAYER_X` rather than snapping:

- **Grounded only.** A jump *freezes* recovery (and its delay) until she lands —
  she only reclaims ground while on a surface.
- **Delay, re-armed on landing.** After the last push she waits
  `PLAYER_RECOVER_DELAY`; touching down after a jump re-arms that delay, so she
  pauses a beat before drifting.
- **Ease in and out.** Her glide speed ramps up from 0 at `PLAYER_RECOVER_ACCEL`
  (so it doesn't jolt), caps at `PLAYER_RECOVER_SPEED`, and slows as she nears
  home (`PLAYER_RECOVER_RATE`).

Consequence for design: jump height/width need not be exact. Failing to clear a
`terrain` block isn't instant death — you get pushed and can still climb up — so
authoring is about *flow and pressure* (don't let the player get walled
in), not about hitting precise reach numbers. Only lethal blocks are pass/fail.

## The grid is the basis (physics derives from it)

The game is laid out on a **96px square grid** (`CELL`) so course, builder, and
jump physics all line up; difficulty reads off the geometry instead of needing a
runtime solver. Physics is *derived from* the grid (not a frozen substrate), with
reach measured from the integrator (apex = `JUMP_VELOCITY²/2·GRAVITY`):

- **Single jump** apex ≈230px ≈2.4 cells: clears a **≤2-cell** obstacle (~38px
  spare) and can't reach 3 → 3-cell obstacles want the double. (`JUMP_VELOCITY −1050`)
- **Double jump** apex ≈459px ≈4.8 cells: clears **≤4 cells** (~75px spare) when
  the second jump fires near the apex. (`DOUBLE_JUMP_VELOCITY −1050`)
- **Horizontal**: one jump carries ~3 cells of distance at `SPEED_START` (against
  the airtime). NOTE: changing jump velocity changes airtime, and the scroll speed
  ramps with distance (see "Speed" below), so the cells-per-jump figure is for the
  start speed; later in a run a jump covers more ground.

With the climb-and-squeeze contact rule these numbers are guidance, not hard
gates (missing a clear pushes you, it doesn't kill you). Constants: `CELL`,
`GRAVITY`, `JUMP_VELOCITY`, `DOUBLE_JUMP_VELOCITY`, `JUMP_CUT`, `MAX_JUMPS`,
`SPEED_START`/`SPEED_MAX`/`SPEED_RAMP_DISTANCE`, `PLAYER_X`. The body circle is measured from the sprite art — the
inscribed circle of the silhouette (pixels opaque in ANY run frame), seated so its
bottom is the foot line — and lives as `PLAYER_HIT_FRAME_CX/CY/R` (source coords)
→ `PLAYER_HIT_RADIUS` (world). Its bottom equals the feet, so there is no collider
offset to account for. All course dimensions are whole-cell multiples (written via
a `c(n)=n*CELL` helper).

## Model

```
Course = CourseStep[]                  // fixed, ordered list, authored by hand
CourseStep = { pattern: ObstaclePatternRef }

ObstaclePattern = {
  name,
  blocks: Block[],                     // the whole pattern, incl. coins (see below)
  length,                              // span from this pattern's start to the next's
}
Block = { x, y, w, h, type }           // x relative to the pattern start cursor;
                                       // type: 'terrain' | 'ledge' | 'hazard'
                                       //     | 'pit' | 'coin'
```

Coins are just blocks of `type: 'coin'` (non-colliding, collectible). There is no
separate coin layer/slot model — see "Collectibles".

- **Coordinate origin.** Each obstacle pattern has a local origin at its *start
  cursor* (a world-space position the course walker advances). Every `Block.x` is
  an offset from that cursor — `x = 0` is the cursor itself, not the first block.
  A pattern may intentionally lead with empty space.
- **`length`** is the distance from this pattern's start cursor to the *next*
  pattern's start cursor. It must cover the farthest obstacle/coin plus any
  trailing rest the author wants before the next pattern. Spacing/run-up between
  features is authored *inside* patterns via `x` and `length` — there is no
  separate spacing system.
- **Looping seam.** The course is a one-time **intro** followed by a repeating
  **loop**: after the last pattern the walker wraps to `loopStart` (the first loop
  pattern), *not* to pattern 0, so the intro never recurs. `CourseWalker` takes
  that index; `SAMPLE_LOOP_START` (= `INTRO.length`) is what the scene passes. The
  run-up before the loop's first pattern on each cycle is the trailing rest in the
  last pattern's `length` (the seam is just "cursor wraps").
- **Fresh-run start.** The cursor begins at `0`, and the first `step(0)` fills the
  screen left-to-right with the opening patterns — the `intro-flat` pattern is the
  ground the player starts standing on (no separate seed floor). A fresh run
  rebuilds the walker, so the intro plays again at the top of each new run and
  every run begins identically.
- **Fully deterministic.** No RNG at runtime in course construction. Coin layers
  are pre-generated offline (see Collectibles), not rolled while playing. Every
  run is identical in layout given the same inputs.
- A pattern is the authoring unit: a short, deliberately designed run of a few
  obstacles expressing one idea (a rhythm of taps, a wall that needs the double
  jump after a calm, a platform hop into an immediate gap, etc.).
- **Off-screen handling.** Keep the current screen-space model: the walker emits
  obstacles at the right edge as their cursor scrolls into range, and culls them
  once fully past the left edge (as `MainScene.stepPlaying` already does). World
  positions are the cursor sum; only on-screen obstacles exist as live objects.

## Collectibles (coins)

A coin is a `Block` of `type: 'coin'` — non-colliding, collected on overlap
(coin removed, counter++), never fatal. It lives in the same `blocks` list as the
terrain, so coins ride the same walker/cull path and need no separate track.

**Coins are hand-authored into patterns.** Each coin is placed directly in a
pattern's `blocks` list via the `coin(xCells, rowCells)` helper — a grid-aligned
1×1 cell like every other block, drawn as a disc centred in its cell — alongside
the terrain. Placement is part of authoring the pattern, the same as a step or
ledge.

What the placement aims for (an authoring checklist):

- **On the natural arc** — coins along a jump the player makes anyway (juice).
- **Risk/reward** — coins only reachable by the harder line (higher hop, the high
  lane, grazing a hazard): safety vs. payout = axis 6 made real.
- **Routing signal** — a coin trail telegraphs the intended path.

Collection uses a circle overlap test (`coinAt`); on overlap the coin block is
removed from the live blocks and a counter increments (`HUD.setCoinCount`, reset
in `startGame`). Coins respawn each loop (the walker re-emits the pattern's coins
every cycle — a memorization game). Coin run-local state (count, which on-screen
coins are collected) resets on restart and does NOT live in `HimeSession` (that is
cross-restart, `best` only).

## Routes are vertical: the map is taller

There is no branch/commit/merge machinery — alternate routes are just **the map
being taller**. A pattern can extend upward into higher lanes (ledges/terrain
stacked well above the ground), and the runner is free to take any height the
geometry affords: stay on the ground (the easy low lane) or climb a ledge
staircase to a high lane. The choice is diegetic and reversible at will; what's
reachable is purely a matter of map design, not a coded route table.

- **One continuous map.** Both lanes are ordinary `Block`s in the same pattern —
  the ground floor plus higher ledges/terrain. No second data structure: a tall
  pattern is authored exactly like a flat one, just using more vertical cells.
- **Free vertical movement.** The runner moves between lanes by jumping; the
  system never locks her to a lane. Difficulty/payout asymmetry is authored into
  the geometry (the high lane is harder to reach and stay on, and is where the
  coins / shortcuts live — the structural home of axis 6 choice load and axis 7
  lookahead).
- **Vertical follow camera.** A standard 2D-platformer dead-zone window: the
  runner moves freely between `CAMERA_WINDOW_TOP` and `CAMERA_WINDOW_BOTTOM` on
  screen (so ordinary jumps don't scroll the view), and the camera follows only
  when she leaves the window — up onto a high lane, or down into a lower route.
  It is clamped to the lowest map block so void never shows below the floor (that
  floor limit rises instantly when a lower block appears and eases up when one
  culls off-screen, so it doesn't snap). The background skylines take a small
  vertical parallax; sky/stars/orb stay fixed. See `CAMERA_WINDOW_*` /
  `CAMERA_FLOOR_EASE` in `constants.ts` and `updateCamera` in `scene.ts`.
- Determinism holds: the layout is fixed; only which height the player travels is
  player-chosen, and that adds no RNG.

## The 9 axes are the authoring checklist

The nine difficulty axes are a **design-time checklist for the human author**
(not runtime generation constraints). When authoring and ordering patterns,
deliberately vary:

1. Operation type — which input the pattern demands (tap / hold / double / land /
   rhythm).
2. Precision — how tight the success window is (eyeball + playtest, not solved).
3. Continuity — how many inputs chain within a pattern.
4. Lead time — the run-up before each demand (authored as spacing in the pattern).
5. Operation switching — order patterns so consecutive ones demand *different*
   operations where you want a difficulty bump; same operation to let the player
   settle.
6. Choice load — author patterns with a tempting-but-wrong option where you want
   decision pressure (fully visible; the load is the choice, never legibility).
7. Lookahead — chain patterns so clearing one requires having set up in the prior.
8. Rhythm regularity — even spacing for a learnable groove; irregular to disrupt.
9. Sustained load / waves — order the whole list as a curve: ramp → peak → calm →
   repeat, so the loop has shape rather than flat difficulty.

These guide authoring; none of them run at play time.

## Decided

- **Speed: ramps with distance.** Scroll speed climbs from `SPEED_START` to
  `SPEED_MAX`, reaching the cap at `SPEED_RAMP_DISTANCE` px of travel — faster the
  further you get, as a difficulty curve. This does **not** break determinism or
  the memorization track: the course *layout* is fixed, and speed is a pure
  function of distance, so the same distance always plays at the same speed and a
  given run is fully reproducible. (The layout repeats via the loop; the speed at
  a given distance does not depend on which loop you're in, only on distance.)
- **Coins are hand-authored into patterns** (see Collectibles) as ordinary
  committed `coin` blocks, so the no-runtime-RNG / fully-deterministic rule holds
  by construction.

## Open questions (to settle before/while authoring)

- **Pattern count & loop length** for a satisfying first cycle before it repeats.
- **Authoring format** — inline TS array of pattern literals (simplest, typed,
  reviewable) vs. a small data file. Lean inline TS unless it gets unwieldy.

## Build order (incremental, each step leaves the game working)

Done so far:
- Authored-course model + pure `CourseWalker`; `scene.ts` walks `SAMPLE_COURSE`
  with a distance-driven speed ramp.
- 96px grid with physics derived from it (margin-tuned single/double jumps).
- A wave-shaped loop authored on the grid: a one-time intro + a repeating section
  (`CourseWalker` wraps to `SAMPLE_LOOP_START`, not pattern 0).
- Unified block model: one `Block` + `type: 'terrain' | 'ledge' | 'hazard' |
  'pit' | 'coin'`. Floor is explicit `terrain`; a pit is "no floor + a `pit` block
  underneath"; placement is grid-aligned. `coin` exists as a type (collection
  deferred to the coins step).
- Climb-and-squeeze contact on **one body circle**: landing, side push, lethal/pit
  death and coin overlap all resolve through `circleRectMTV` (no feet-point or
  half-width special cases). Recovery is grounded-only, delay-gated on landing,
  and eased in/out.
- Parallax background (`background.ts`): a post-apocalyptic ruined-city backdrop —
  a smog-dusk gradient sky, a static star field, a looming oversized sun/moon, and
  three skyline layers of broken buildings that scroll at fractions of the world
  speed (driven by `distance`) to sell forward motion. Fully deterministic (fixed
  per-layer `Rng` seeds), no per-frame redraw (each layer is a two-tile Graphics
  shifted by `container.x` and wrapped by modulo). Buildings have quantised,
  unevenly-split crumbled rooflines; atmospheric perspective sets a monotonic
  far→near value ramp (far lightest/warm, near darkest/cool).
- Coins (collection + HUD + sample): a `coin` is a grid-aligned 1×1-cell `Block`
  (`coin(xCells, rowCells)` in `course.ts`) drawn as a disc centred in its cell.
  The body circle picks one up on overlap (`coinAt`) — removed from the live
  blocks, counter++ — and since the walker re-emits each pattern's coins every
  loop, they respawn each cycle. The count is run-local (reset in `startGame`,
  shown by `HUD.setCoinCount`), never persisted in `HimeSession`. A hand-authored
  sample places coins for the three intents (arc juice, routing trail, risk/reward
  high lines) across the intro and several loop patterns.
- Vertical maps + follow camera: patterns can extend both UP into higher lanes and
  DOWN into lower routes (just taller/below-ground terrain/ledge geometry — no
  branch/commit/merge), authored via `slab()` (a platform at any depth) and `gaps`
  (a non-lethal floor opening to drop through). The camera is a standard dead-zone
  window (`CAMERA_WINDOW_*`): jumps within it don't scroll, leaving it follows up
  or down; clamped to the lowest map block (`updateCamera` in `scene.ts`). Skylines
  take a small vertical parallax and overdraw below the screen so a down route
  doesn't reveal a cut-off edge. Sample patterns `up-route-long` (ledge staircase
  to a long coin-lined high lane) and `down-route-long` (a gap to a long lower
  platform) lead the loop.

Remaining:

1. **Map builder:** `/tools/hime-run-builder` (see below).

## Map builder

Authoring patterns as raw coordinate literals does not scale — visual placement
is needed to iterate on the 9-axis design cheaply. Build a **standalone React
tool page** under a dedicated tools path: `/tools/hime-run-builder`.

**A simple coarse-grid editor.** Patterns are painted on a square grid, not
free-form:

- **Grid:** one cell = **96px** (`CELL`), matching the game grid. The horizontal
  axis is scroll distance; the vertical axis is height above the ground (ground
  at the bottom row, stacking upward). Everything snaps to the grid — obstacle x,
  width, and height are all cell multiples.
- **Height by stacking cells:** a `terrain` block is N cells tall from the floor;
  a `ledge` floats at a cell height; a `pit` is "no floor here" (drop a `pit`
  block in the hole). Painting taller = stacking more cells.
- **Jump-arc guide:** overlay the runner's reach on the grid so "clears / doesn't
  clear" is visible while placing — a single jump rises **2 cells** and carries
  **3 cells** of distance; the double jump reaches **4 cells** high. So a 1–2-cell
  obstacle reads as a single-jump, a 3–4-cell one as a double-jump, right off the
  grid — which is what prevents unfair spacing (cf. the rhythm-three bug) at
  authoring time.
- **Palette:** pick the block `type` to paint (terrain / ledge / hazard / pit /
  coin) — coins are placed by hand on the grid like any other block. Click/drag to
  add, click again to erase.
- **Export:** emit the painted cells as `ObstaclePattern` literals — matching
  `course.ts`, which writes block dimensions in cells via the `c(n) = n * CELL`
  helper — to paste/commit into `course.ts`.

Scope & wiring:

- A `/tools/*` URL namespace separates dev tooling from the game routes
  (`/hime-run`); other tools can live alongside it later. No bundle exclusion or
  registry gating — the builder being reachable in a shipped build is harmless;
  the path split is just organization. Add it in `src/routes.ts` as
  `route('tools/hime-run-builder', 'routes/tools/hime-run-builder.tsx')`.
- React + DOM/canvas grid (React is the shell here, consistent with the
  project's "React for the shell, Pixi for game content" principle — the builder
  is a tool, not gameplay).
- The unified `Block` model has landed, so its export target is the final `Block`
  schema. The grid extends upward for tall, multi-lane maps; coins are painted on
  the grid like any other block.

Status: the authored-course walker (intro + loop), distance-ramped scene,
grid-derived physics, a wave-shaped sample loop, the unified one-`Block` model,
climb-and-squeeze contact on a single body circle, the parallax ruined-city
background, coins (collection + HUD + hand-authored placement, respawning each
loop), and vertical maps with a follow camera are all in. Up next: the map
builder.
