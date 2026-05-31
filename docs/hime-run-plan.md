# hime-run — hand-authored course (plan)

Status: design draft. This supersedes the earlier procedural-generation +
clearability-solver design, which is **abandoned** (see "What we're dropping").

## Decision

Stop procedurally generating the course. Instead, ship a **hand-authored set of
obstacle patterns played in a fixed order, looping endlessly**, with **fully
deterministic placement** (same obstacles, same positions, every run). This is a
memorization game ("覚えゲー"): the player learns the course and improves by
mastering it, not by reacting to fresh randomness each time.

Why the change:

- Procedural generation spent nearly all its effort *proving fairness* (the
  physics solver) and almost none on *making the course fun*. The result was
  either monotonous or randomly spiky, and every fix fought the generator.
- A human designer can place crescendos, rest beats, operation switches, and
  rhythm directly — the exact qualities the 9-axis analysis identified as what
  makes a course good. Authoring expresses them far more cheaply than coercing a
  generator to emit them.
- Determinism makes the game *learnable*: a known course rewards practice, and
  removes the entire class of "is this fair?" problems by construction (the
  designer simply doesn't author an unfair pattern).

## What we're dropping

These stop being load-bearing and will be removed once the new path is in:

- `solver.ts` — the clearability prover/search. No longer needed: fairness is a
  design-time decision, verified by playing, not proven at runtime.
- `obstacles.ts` random feature makers (`makeFeature`, `groundBlock`, `pit`,
  `platformPit`, `highWall`, `consecutiveBlocks`) and the weighted/`minD` mix.
- `difficulty.ts` — distance→difficulty ramp and the `harderUp`/`harderDown`
  samplers that biased random ranges. Difficulty now lives in the authored
  ordering, not a scalar.
- The time-based spacing system in `constants.ts`/`scene.ts`
  (`REST_LEAD_SEC`, `REST_TEMPO_*`, fairness-floor/tempo `max()`): spacing
  becomes part of each authored pattern.
- All of the above tests (`solver.test.ts`, `difficulty.test.ts`,
  `obstacles.test.ts`) — replaced by tests on the new authored-course model.

Obstacle generation is replaced; the obstacle *model* is also unified — see "One
block, five types" below. The old per-kind types (`gap`/`platform`/`wall`) are
gone.

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
              The floating ledge (old platform). Drawn as a thin slab.
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

Consequence for design: jump height/width no longer has to be exact. Failing to
clear a `terrain` block isn't instant death — you get pushed and can still climb
up — so authoring is about *flow and pressure* (don't let the player get walled
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
CourseStep = { pattern: ObstaclePatternRef }   // (branches add a variant later)

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

**Placement is computed from terrain + reach, to multiply variety.** Rather than
hand-placing every coin, a dev-time script derives, for each obstacle pattern,
the grid cells a coin could sit in: cells the player can actually reach given the
terrain and the jump envelope (on the natural arc over a block, along a landing,
on a risky high line). It then enumerates combinations of those candidate cells
into many coin sets and writes them as committed course data. The win is
量産 — N terrain patterns × auto-derived coin sets = lots of fixed courses
cheaply, without authoring coins by hand.

This is offline + committed (like generated sprite assets, `scripts/asset-*.mjs`
→ committed PNGs): the script writes `coin` blocks into the course data, which is
then ordinary reviewable source — no runtime generator, no RNG, fully
deterministic. Re-run only when terrain or the reach model changes. (The reach
calculation is the same jump-envelope math used elsewhere; combination count is
filtered for quality — drop empty/near-identical/unreachable sets.)

What the placement aims for:

- **On the natural arc** — coins along a jump the player makes anyway (juice).
- **Risk/reward** — coins only reachable by the harder line (higher hop, a
  branch's hard route, grazing a hazard): safety vs. payout = axis 6 made real.
- **Routing signal** — a coin trail telegraphs the intended path.

Collection uses a circle overlap test; on overlap the coin block is removed and a
coin counter increments (HUD needs a `setCoinCount` API + a reset in
`startGame`). Coins respawn each loop (memorization game). Coin run-local state
(which on-screen coins are collected) resets on restart and must NOT live in
`HimeSession` (that is cross-restart, `best` only).

## Branches

The course list can contain **branch nodes**, not just linear patterns. A branch
offers two (or more) routes the player selects *by how they play* the branch
point — e.g. jump to take the high route, stay grounded for the low route.

```
Course = (CourseStep | Branch)[]
Branch = { commit: CommitTrigger, routes: { name, steps: CourseStep[] }[], merge }
```

Routes hold `CourseStep[]`, the same type as the main course — not bare
patterns — so coin-layer selection works identically on the main line and inside
any route.

- **Input-selected** (preferred): the route is chosen by the player's action at
  the branch point (jump vs. not, which platform they land on). No menu — the
  choice is diegetic, and committing to it is itself a skill/decision moment.
- **Commit trigger.** Each branch point names a single, explicit condition
  evaluated once at a defined x: e.g. "airborne when crossing the branch line →
  high route, else low route." The route is selected at that instant and the
  route-specific patterns spawn from there; there is no re-deciding mid-route.
- **Merge semantics.** Routes need not be equal length, and each route is a
  `CourseStep[]` (so route patterns pick coin layers like any other step). Each
  route ends at an explicit merge marker; the walker resumes the main course
  cursor at the merge point regardless of which route was taken (a shorter route
  simply reaches the merge sooner). The overall cycle stays fixed because all
  routes converge.
- Routes differ in difficulty and payout: a riskier route holds more coins or a
  shortcut; the safe route is longer/leaner. Branches are the structural home of
  axis 6 (choice load) and axis 7 (lookahead — you must commit before you can
  see the whole route).
- Determinism holds: given the player's inputs, the layout encountered is fully
  fixed. Branches add *player-chosen* variety without adding RNG.

Both coins and branches are deferred behind the linear fixed course in the build
order — get the deterministic loop working first, then layer these on.

## The 9 axes become the authoring checklist

The difficulty axes from the abandoned design are still the right vocabulary —
but now they're a **design-time checklist for the human author**, not runtime
generation constraints. When authoring and ordering patterns, deliberately vary:

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
- **Coin variety is generated offline, committed as source** (see Collectibles),
  not rolled at runtime — keeps the no-runtime-RNG / fully-deterministic rule.

## Open questions (to settle before/while authoring)

- **Pattern count & loop length** for a satisfying first cycle before it repeats.
- **Authoring format** — inline TS array of pattern literals (simplest, typed,
  reviewable) vs. a small data file. Lean inline TS unless it gets unwieldy. The
  generated coin layers live in the same committed data file.
- **Coin layer expansion policy** — full enumeration vs. a curated/filtered
  subset (drop all-off, near-identical, or unreachable layers); how many layers
  per pattern is worth keeping.

## Build order (incremental, each step leaves the game working)

Done so far:
- Authored-course model + pure `CourseWalker`; `scene.ts` walks `SAMPLE_COURSE`
  with a distance-driven speed ramp; the old generator/solver/difficulty modules
  are deleted.
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

Remaining:

1. **Branches:** input-selected routes with a named commit trigger and explicit
   merge markers; difficulty/payout asymmetry. Layout stays deterministic given
   inputs.
2. **Coins:** a dev-time script that derives reachable coin cells from terrain +
   the jump envelope and enumerates them into committed `coin` blocks (量産);
   collection + `setCoinCount` HUD + `startGame` reset.
3. **Map builder:** `/tools/hime-run-builder` (see below).

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
- **Palette:** pick the block `type` to paint (terrain / ledge / hazard / pit;
  coins come from auto-placement, not painting). Click/drag to add, click again to
  erase.
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
  schema. Branch markers in the builder follow once branches exist in-game; coins
  are auto-placed, not painted.

Status: the authored-course walker (intro + loop), distance-ramped scene,
grid-derived physics, a wave-shaped sample loop, the unified one-`Block` model,
climb-and-squeeze contact on a single body circle, and the parallax ruined-city
background are all in. Up next: branches, coins, then the map builder.
