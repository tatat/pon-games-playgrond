# Deterministic RNG

Every game uses a seeded RNG instead of `Math.random()`. The seed from `GameContext.config.seed` is what makes replays, E2E reproducibility, and bug repro possible.

Related: [Scene](./scene.md), [Plugin Interface](./plugin-interface.md).

## API

```typescript
// engine/rng.ts
export class Rng {
  constructor(seed: number);

  /** [0, 1) */
  next(): number;

  /** [min, max] inclusive */
  intRange(min: number, max: number): number;

  /** Returns a random element. Throws on an empty array. */
  pick<T>(arr: readonly T[]): T;

  /** True with probability p (0..1). */
  chance(p: number): boolean;
}
```

## Implementation

The default backing algorithm is **Mulberry32** — five lines, statistically adequate for arcade games, zero dependencies. Game code depends only on the `Rng` class's public surface, never on the algorithm; the implementation can later be swapped for `pure-rand` / `seedrandom` / similar without touching callers.

Replacing the algorithm changes the output stream for a given seed. Save data, recorded replays, and seeded screenshot tests will break across the swap — accepted for a playground.

## Scene integration

`SceneManager` constructs the `Rng` from `ctx.config.seed` and injects it into each scene via `attach`. Scenes call `this.rng.next/intRange/pick/chance` directly.

## Seed source

`GameMount` picks the seed when starting a game:

```typescript
const search = new URLSearchParams(window.location.search);
const seed = Number.parseInt(search.get('seed') ?? '', 10) || Date.now();
```

Normal play uses `Date.now()`. Playwright hits `/game/breakout?seed=42` for reproducibility.

## Rules

- **No `Math.random()` in gameplay code.** If it changes the simulation, it goes through `this.rng`. Cosmetic-only randomness (purely visual jitter that does not affect score / physics / AI) is exempt but should be commented at the call site.
- **`Rng.setSeed` is not exposed.** The seed is set once at game start. Re-seeding mid-session has surprising semantics and is avoided.
