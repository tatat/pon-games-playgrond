# hime-run stage select — plan (scenes, stage data, random generation)

Status: design for splitting the opening into its own scene with stage selection,
and for seeded random course generation. Builds on `docs/hime-run-plan.md` (the
endless-runner core) and `docs/hime-run-builder-plan.md` (the course editor).

**Scope:** scene flow, the runtime stage data model, the `SectionSource`
abstraction, and the random course generator. The visual builder itself is a
separate effort (`hime-run-builder-plan.md`).

## Scene flow

```
index.ts
  └─ OpeningScene        title + stage-select list (selection lives here)
        │  onSelectStage(stage)
        ▼
     MainScene(stage)    existing playing / gameover; only the course source differs
        │  onBackToSelect()
        └──────────────► OpeningScene
```

- `OpeningScene` owns selection (embedded list, no separate scene). It reuses the
  ruined-dusk parallax background.
- `MainScene` keeps its internal `title` phase as a per-stage "tap to start" beat
  that shows the stage name and best, then `jump` starts the run. This is a
  deliberate UX choice: a ready beat after the scene swap lets the player start the
  run clock when set, rather than dropping straight into a scrolling world.
- After game over: `jump` replays the **same** stage (same layout; a random stage
  re-runs the **same seed**). Returning to `OpeningScene` is a **distinct** control
  — a "stage select" button on the game-over overlay (plus a dedicated key) — not
  Option, which stays bound to pause everywhere (`scene.ts` binds Option = pause in
  every phase).

## Stage data model

A stage is one of two kinds; both feed the same runtime via `SectionSource`.

```ts
type StageSource =
  | { kind: 'course'; url: string }   // JSON-defined course (builder export / sample)
  | { kind: 'random'; seed: number }  // seeded algorithmic generation

interface StageDef {
  id: string
  name: string
  source: StageSource
}
```

Resolving a `StageDef` yields a `SectionSource`. A `random` stage resolves
synchronously from its seed. A `course` stage needs its JSON, so `MainScene`
loads + validates it in `onEnter` (async, under the scene `AbortSignal`, alongside
the existing sprite `preload`) and only then builds the `AuthoredSource` — the
opening never resolves a source in the synchronous select callback. `startGame()`
rebuilds the source fresh each run, so a stage is fully deterministic from its
inputs (course data, or seed).

### Runtime stage JSON

The runtime consumes a serialized `Course` — the grid coordinates the engine
already uses (cells; `y` ground-relative, up = +). `SAMPLE_COURSE` serializes
straight to this; no coordinate conversion happens anywhere in this plan. It is
also the shape the builder will export (`hime-run-builder-plan.md`), so it is not a
throwaway format — but the builder's export is out of scope here.

```ts
interface StageCourseJson {
  version: number
  name: string
  loopStart: number                 // sections [0, loopStart) play once, rest loop
  sections: { name: string; width: number; blocks: Block[] }[]  // Block in cells
}
```

`SAMPLE_COURSE` becomes the first such file. Files live under each game's own
assets dir: `public/games/hime-run/stages/*.json`, listed by a manifest so stages
can be added (e.g. by the builder) without code changes:

```ts
interface StageManifest {
  version: number
  stages: { id: string; name: string; file: string }[]
}
```

`public/games/hime-run/stages/manifest.json` is loaded via `Assets`, then each
selected course JSON is loaded on demand. The **manifest is the authoritative
source of stage `id` + display name**; a `name` inside a course JSON is advisory
(the manifest wins). Because the builder's own validation is advisory ("nothing
blocks the author"), the runtime loader defends itself: a parser validates the
manifest and each course JSON — `version`, structural shape, block fields, and the
`CourseWalker` invariants (non-empty, `0 ≤ loopStart < sections.length`, every
`width > 0`) — and rejects an invalid document rather than feeding it to the
walker. TS interfaces don't validate loaded JSON, so this is an explicit parser,
not a cast.

## SectionSource abstraction

The walker is split: it keeps scroll + grid→px placement; "which section is next"
moves to a source. Sources are **infinite** — `next()` always returns a section.

```ts
interface SectionSource {
  next(): Section
}

// Existing behaviour: cycle the array, wrapping to loopStart past the end.
class AuthoredSource implements SectionSource { /* index + loopStart */ }

// Seeded generation: assemble one safe primitive per call from the Rng.
class RandomSource implements SectionSource { /* rng-driven */ }
```

`CourseWalker` takes a `SectionSource` instead of a `Course`. `AuthoredSource`
keeps today's eager validation in its constructor — non-empty, `loopStart` in
range, and **every** section `width > 0` — so the authored path (including the
existing constructor-validation test) is unchanged: tests pass by wrapping the
course in an `AuthoredSource`. `CourseWalker` also asserts `width > 0` on each emit
as a backstop for infinite sources, which can't be checked up-front.

### Future: finite stages (not built now)

All stages loop today. A terminal "goal" stage is a localized extension: widen the
interface to `next(): Section | null` (null = end), add one null-guard `break` in
`CourseWalker.step`, add a `FiniteSource`, and add a `cleared` phase + goal visuals
in `MainScene`. `AuthoredSource` / `RandomSource` are unaffected (they never end).
The expensive part is the clear/goal/results feature, not the abstraction — so it
is deferred with no penalty.

## Random generation

`RandomSource` builds each section from a library of **safe parameterized
primitives** derived from the sample course's vocabulary (flat-rest, hop 1–2,
wall 3–4 = double-jump, pit + ledge stepping stones, ground spike, hill, valley,
tunnel). Each primitive's cell parameters stay inside ranges the measured jump
physics can clear, so every generated section is solvable.

**Difficulty is carried by the existing speed ramp alone — the source does not
scale difficulty.** The runner already accelerates over `SPEED_RAMP_DISTANCE`, and
the same primitive is harder to clear the faster the world scrolls (less reaction
time), so a flat-difficulty course plus that ramp gives the escalation for free.
This drops the trickiest undecided part of the design (a cursor→parameter curve)
and keeps `next()` trivially argument-free: the source holds no cursor and emits a
uniformly-sampled primitive per call.

- Selection and parameters come from the seeded `Rng` (`engine/rng`); same seed →
  same course. (Uniform sampling now, light weighting later if the mix feels off.)
- **Every primitive must be clearable across the whole speed range, and its binding
  case differs by primitive.** A horizontal gap (pit) is cleared by one jump's
  reach = speed × airtime, so its worst case is the **slowest** speed (least reach)
  — gap widths are bound by `SPEED_START`. A reaction-timing demand (dodge a hazard,
  fire the double jump just before a wall) has the least margin at the **fastest**
  speed — those are bound by `SPEED_MAX`. So there is no single "worst speed"; each
  primitive's safe range must hold at both ends. The concrete cell values are taken
  from the hand-tuned sample course, which already plays from distance 0 at
  `SPEED_START`, so its vocabulary is safe across the range by construction. Verify
  any new value with instrumentation, not feel.
- A rest beat separates primitives so no two demands chain into an impossible one.
- The parallax background keeps its own fixed per-layer seeds — the stage seed only
  drives the course.

Seed flow: the random entry's seed is set on the select screen itself, with no URL
parameter. The seed is a fixed-length decimal (6 digits = 1,000,000 reproducible
seeds) shown as a row of tap-to-increment digit cells — each tap cycles that digit
0→9→0 with no carry (a combination-lock odometer), driven by the same pointer the
rest of the menu uses, so it works identically on desktop and mobile with no
keyboard text entry. A reroll control fills all digits from the scene `Rng` (range
0–`10^digits−1`, so a rerolled seed stays re-enterable by hand). The shown seed
starts from the persisted last-used seed, falling back to a fixed default on a
first-ever visit; each tap and reroll persists it (so the shown seed — which is
what plays — reopens next session).

(`?seed=` is deliberately *not* used: the portal folds `?seed=` into
`ctx.config.seed` but defaults it to `Date.now()`, so the game can't tell a pinned
seed from a fresh-session one without re-reading the URL — a layering break the
in-screen stepper avoids. `ctx.config.seed` still seeds the scene `Rng` that drives
reroll.)

## Persistence

Best score is per stage, persisted to `localStorage` via the repo's Zustand
convention (`createJSONStorage(() => globalThis.localStorage)`): a hime-run-local
store keyed by stage id (random stages share one `random` bucket). The last-used
random seed is remembered too. Best now lives in this store, so `HimeSession` —
which today holds only the restart-surviving best — is removed; any remaining
restart-scoped state, if needed, is passed to `MainScene` directly.

## Opening UI

- Ruined-dusk look; the parallax background is reused.
- A vertical list: each authored stage as a row (name + best), the random entry
  last (name + a tap-to-increment 6-digit seed stepper + reroll).
- Input: ↑/↓ to move, `Space`/`Enter` to select, pointer tap, virtual keypad on
  mobile (Option = pause, reused from the rest of the game). The seed digits and
  reroll are pointer-driven (tap a digit to step it); `R` rerolls when the random
  row is highlighted. No keyboard digit entry, so the seed is set the same way on
  every device.
- A simple list now; add scrolling once the stage count grows.

## Phasing

1. **Scaffolding** — introduce `SectionSource`, make `CourseWalker` consume it, add
   `AuthoredSource`, rewrap the two scene call sites. Behaviour-identical; tests
   rewrapped.
2. **Sample as JSON + stage select** — `StageCourseJson` / `StageManifest`; a
   checked-in script (`scripts/hime-run-export-sample.mjs`) serializes
   `SAMPLE_COURSE` — reusing its authoring helpers, so no hand-transcription — to
   `stages/sample.json`, validating its own output with the loader's parser.
   (`sample-course.ts` has only `import type` deps, so plain Node on this repo's
   Node 26 runs it with no extra tooling.) Then: manifest, stage loader,
   `OpeningScene` list, `MainScene(stage)` wiring, `index.ts` boots `OpeningScene`,
   per-stage best store.
3. **Random** — `RandomSource` (safe primitives, uniform sampling, no difficulty
   scaling — the speed ramp carries difficulty), random entry + seed UI,
   determinism tests.
4. **(Future) Builder export** — the builder writes `stages/*.json`; no runtime
   change.

Each phase ends with `npm run lint && npm run type-check && npm test`.
