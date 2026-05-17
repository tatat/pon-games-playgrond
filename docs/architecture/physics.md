# Physics with Rapier

Each game scene owns its own Rapier `World`, created in `onEnter` and freed in `onExit`. The Rapier WASM module is initialized **once** at engine startup (`await RAPIER.init()` in `main.tsx`), not per scene.

Related: [Scene](./scene.md).

## Fixed timestep

Physics runs at a fixed rate (default 60Hz) regardless of display refresh rate. Render frames are driven independently by Pixi's `Ticker`; on a 144Hz monitor more frames are rendered than there are physics steps, and the physics state is the same across them unless interpolation is added later.

This decoupling is what makes the simulation deterministic and frame-rate-independent. A slow frame that took 100ms drives **six** 1/60s physics steps in a row, not one big 100ms step.

```typescript
// engine/constants.ts
export const FIXED_DT = 1 / 60;             // physics tick = 60Hz
export const MAX_STEPS_PER_FRAME = 5;       // cap to prevent spiral of death
```

### Per-scene loop pattern

A scene that uses physics keeps an accumulator and advances the world in fixed steps:

- On `onEnter`: create the `World`, set `world.timestep = FIXED_DT`, register body→sprite mappings, reset the accumulator to 0.
- On `onUpdate(ticker)`: add `ticker.deltaMS / 1000` to the accumulator, then `world.step()` while it ≥ `FIXED_DT` and the per-frame step count is below `MAX_STEPS_PER_FRAME`. If the cap was hit, drop the leftover accumulator (better to stutter than to chase a backlog). Read out body translations / rotations and apply them to sprites.
- On `onExit`: `world.free()` and clear the body map.

Per-step interpolation (`lerp(prevPos, currPos, accumulator / FIXED_DT)`) is **not** added by default. It makes physics motion smoother on high-refresh displays at the cost of one extra position snapshot per body per frame. Add it later if motion feels stepped on 120/144Hz screens.

## Physics tick rate is a game-design choice, not a user setting

`FIXED_DT = 1/60` is a project-wide default. A game that wants a slower tick (Snake-like) sets `world.timestep` to a different value in its own `onEnter` and uses the matching constant in its accumulator loop. Render fps is independent and stays browser-driven.

## Spiral of death

After a long pause (tab unfocused, sleep, devtools breakpoint), the accumulator can hold seconds of backlog. Stepping it all in one frame freezes the page and creates a new backlog → spiral. The `MAX_STEPS_PER_FRAME` cap plus dropping the leftover accumulator is the standard guard.

`engine/auto-pause.ts` stops `app.ticker` on tab visibility loss (see [Scene § Auto-pause on tab visibility](./scene.md#auto-pause-on-tab-visibility)), so the accumulator does **not** grow while the tab is hidden. The cap exists for other slow-frame cases (long GC pauses, breakpoints).
