# AGENTS.md

Guidance for AI agents (Claude Code, GitHub Copilot, etc.) working in this repository.

## What this repo is

A Pixi-based playground for replatforming two games (`breakout-clone`, `sticker-drift`) from Phaser. The games end up shipped as ESM library bundles consumed by the sibling project [ponpon](../ponpon/) via this repo's GitHub Pages.

Architecture and conventions live under `docs/`:

- `docs/web-arcade-architecture.md` — index, principles, scope, common pitfalls, reference implementation order
- `docs/toolchain.md` — build / lint / format / pre-commit / package manager / supply-chain hygiene / deployment
- `docs/distribution.md` — how built artifacts (`release.json`, `mount`, ponpon-side import) reach ponpon
- `docs/architecture/*.md` — per-topic detail (plugin-interface, scene, state, physics, assets, audio, input, rng, responsive, testing)

Always consult these before adding patterns; do not invent parallel ones.

## File operations: prefer built-in tools

When the host environment exposes structured tools, **use them in preference to shell commands**. This keeps diffs reviewable, avoids accidental destruction, and is friendlier to permission prompts.

| Don't | Do |
|---|---|
| `cat file.ts`, `head`, `tail`, `sed -n '10,20p' file.ts` | the agent's read/view tool (with offset/limit if needed) |
| `sed -i 's/.../.../' file.ts`, `awk` rewrites | the agent's edit/patch tool |
| `echo … > file.ts`, here-docs piped into files | the agent's write/create tool |
| `grep -r pattern src/` | the agent's grep/search tool |
| `find . -name '*.ts'` | the agent's glob/find tool |

**`sed` and `awk` are off-limits for both reading and writing files.** Their output is hard to review, their in-place mode silently corrupts on failure, and the read forms are exactly what the read tool's offset/limit are for.

Shell is fine for things tools cannot do (running `npm`, `git`, `node`, one-off `ls` for orientation).

## Tool affordances over shell workarounds

The same principle extends past file ops: whenever the agent's harness exposes a structured way to do something, prefer it to the shell equivalent. The harness-tracked path stays visible to the user, gets notified on completion, and is easier to clean up.

| Don't | Do |
|---|---|
| `(npm run dev > ./tmp/log 2>&1 &) && sleep N && head ./tmp/log` (shell-detached) | Run the same command via the agent's background mode (e.g. Claude Code's `run_in_background: true`); read the tracked task's tail when needed |
| `pkill -f vite` mid-batch alongside other tool calls you care about | Stop the tracked background task explicitly in its **own** call — a sibling call running in parallel can otherwise be cancelled when the killer terminates a harness-watched process |
| Write screenshots / probes to the repo root (`opening.png`) | Write under `./tmp/` (`./tmp/opening.png`); gitignored, no cleanup obligation |

## Running the dev server

`npm run dev` is long-lived, so **agree the policy with the user before starting it** — don't just launch it. Pick one of:

- **The agent runs it** in the harness's background mode (e.g. Claude Code's `run_in_background: true`), and reads the tracked task's tail when it needs the log. Stop the task explicitly when done.
- **The user runs it** in their own terminal (`! npm run dev` in Claude Code, or a separate shell), and the agent just uses the already-running server.

Only one dev server should own the port at a time. If the user already has it running, don't start a second one; if you start one, say so.

**The dev server is served under a base path of `/pon-games-playgrond/`** (Vite `base`). The root is `http://localhost:5173/pon-games-playgrond/` and a game route is e.g. `http://localhost:5173/pon-games-playgrond/breakout-clone`. Navigating without the base (`http://localhost:5173/breakout-clone`) returns a 404 / blank page with no `<canvas>` — a common Playwright gotcha. The dev-server log prints the correct `Local:` URL; use it.

**Use Playwright for static layout, ask the user for anything in motion.** Where Playwright fits depends on what you're checking:

- **Static layout balance** (spacing, alignment, sizing, where things sit on screen at rest) — a Playwright screenshot is fine, and is the preferred way to eyeball it yourself.
- **Anything in motion** (gameplay, animation, physics, timing, feel) — a DOM-snapshot tool can't meaningfully observe a real-time canvas-rendered game (Pixi), so **ask the user to look and confirm** rather than driving the browser yourself. The exception: if the thing can be checked by **instrumenting with logs** (asserting positions, velocities, state transitions, collision counts via console output you read back), that's a fair way to verify it yourself — prefer it when the property is measurable rather than visual.

Playwright also backs the deterministic e2e suite (`npm run test:e2e`); that's separate from the manual checks above.

## Image / asset processing

**Each game owns its own images — don't share image assets across games.** A game loads only from its own `public/games/<id>/...` dir. If two games need the same picture, **copy it** into each game's dir; a byte-identical duplicate is accepted and preferred over a cross-game reference. (This keeps games independently shippable to ponpon and lets one game's art evolve without disturbing another's.) Sounds and other assets follow the same per-game ownership.

Two very different jobs — keep them separate:

- **Throwaway crop of a screenshot** (eyeballing a layout) — no shipped artifact. Capture the region directly (Playwright `target`/viewport) or crop in-browser via `browser_evaluate` on the canvas. Output goes under `./tmp/`. Don't reach for an image library for this.
- **Producing a shipped asset** (a sprite/sticker that lands in `public/games/<id>/...` and ships to ponpon) — this needs a real, reproducible pipeline. Use **`sharp`** (a devDependency): high-quality resize, transparent-bounds `.trim()`, PNG output, batch size variants.

When generating shipped sprites, follow the existing convention (see `docs/architecture/assets.md`):

- Emit `@2x` PNGs — the `@2x` suffix is load-bearing, Pixi reads it as `resolution = 2`.
- Match the existing naming: `<name>-<size>@2x.png`, where `<name>` is a short family + variant id (the current stickers use `d1`/`d2`/`r1`/`r2`/`t1`/`t2`) and `<size>` is the logical height in px. Generate **all** the discrete sizes a game already uses — the current ladder is `64`, `96`, `128`, `160`, `192`, `224`, `256`, `300`.
- Keep source/original images out of `public/` (use `./tmp/` or a non-served location); only the generated variants belong under `public/`.

Script placement: a one-off conversion can live in `./tmp/` and be discarded. If the same processing will recur, promote it to a checked-in `scripts/asset-*.mjs` so it's re-runnable.

`sharp` ships prebuilt libvips binaries via optional npm deps — **no install script**, so it works under `.npmrc`'s `ignore-scripts=true`. `min-release-age` still applies on upgrades (drop a patch and retry if a fresh release is inside the window).

## Daily commands

```bash
npm run dev          # Vite dev server (playground SPA on http://localhost:5173/pon-games-playgrond/)
npm run build        # type-check + production build
npm run preview      # serve the production build locally
npm run lint         # Biome check (no write)
npm run format       # Biome check --write
npm run type-check   # tsc --noEmit
npm test             # Vitest unit tests (Node env by default)
npm run test:watch   # Vitest in watch mode
npm run test:ui      # Vitest UI
npm run test:e2e     # Playwright
```

After every install (or first checkout) run `npm run prepare` to install the husky hook — `.npmrc` has `ignore-scripts=true`, so the lifecycle does not auto-run.

## Conventions to keep

- **Principle 1**: In-game UI is Pixi. React is the shell (lobby / outer settings) only. See `docs/web-arcade-architecture.md` Principles.
- **Latest versions**: this project deliberately stays current. Only justify *not* using the latest version.
- **Supply chain**: do not loosen `.npmrc` (`min-release-age`, `ignore-scripts`) without explicit reason. If a dep needs install scripts, decide deliberately and document.
- **Cancellation**: setup-phase async takes `AbortSignal`; cleanup paths (`destroy`, `onExit`) do not. See `docs/architecture/plugin-interface.md` § Cancellation convention.
- **No `Math.random()`** in simulation code — use the seeded `Rng` from `engine/rng`. See `docs/architecture/rng.md`.
- **No raw `MouseEvent` / `TouchEvent`** in game code — everything goes through Pixi's `pointerdown` / `pointerup` etc. See `docs/architecture/input.md`.
- **Comment what the code is, not what it stopped being.** A comment should explain the current state for a fresh reader. When something reverts from a special case back to the ordinary one (e.g. an asset that used to be borrowed from another game now lives in this game's own dir), don't add a comment narrating that history — the ordinary case needs no annotation, and the note goes stale. Provenance and "why we changed it" belong in the commit message, not the source.

## TypeScript notes

Strict-mode TS is on (see `tsconfig.app.json`). A few choices worth knowing:

- **`noUncheckedIndexedAccess: true`** — any `record[key]` / `array[i]` is typed `T | undefined`. Handle the `undefined` case (`?? default`, narrowing, or `at()` for arrays). This is the main "safety net" for dynamic-key access.
- **`noPropertyAccessFromIndexSignature: false`** — dot notation against an index-signature type is allowed. You don't need to use bracket notation for known keys; the `| undefined` from the previous rule still applies.
- **`noUnusedLocals` / `noUnusedParameters: true`** — unused imports / variables / params fail the build. Prefix intentionally unused parameters with `_` (e.g. `_signal`) to opt out.
- **`verbatimModuleSyntax: true`** — type-only imports must use `import type` syntax. Biome's organize-imports keeps these tidy automatically.
- **No path aliases** (`@/...`). Use relative imports.

## Recommended workflow

A typical change cycle in this repo:

1. Make the change. Prefer the dedicated tools (Read / Edit / Write) over shell text-manipulation.
2. Run `npm run lint && npm run type-check && npm test` locally before committing. The husky pre-commit hook runs `lint-staged` (Biome on staged files) + `npm run type-check`; `npm test` is **not** in the hook (kept off so the hook stays fast) but is part of the workflow above — don't skip it.
3. For non-trivial changes (new subsystem, engine refactor, new game port) consider asking Codex for a code review before committing:
   - `/codex:rescue` for investigation or focused review
   - `/codex:review` for a code review of the working tree
   - Findings are advisory — pick the ones worth applying.
4. Commit using **Conventional Commits**-style subjects (used throughout this repo's history):
   - `feat(engine): ...` — new functionality
   - `fix(scene): ...` — bug fix
   - `docs: ...` — documentation only
   - `chore: ...` — toolchain, infra, hooks, deps
   - `refactor: ...` — no behaviour change
   - `test: ...` — test-only changes
   - Keep the subject under ~70 chars; put detail in the body.
   - Include the `Co-Authored-By` trailer for AI agents per the agent's defaults.

## Scope reminders

The following are explicitly **out of scope** for this playground (see `web-arcade-architecture.md § Scope`); do not propose adding them unless asked:

- Canvas accessibility (a shadow ARIA tree)
- Orientation lock / rotate-device overlay
- Server-side score validation, networking, multiplayer
- Internationalization library (only `useSettingsStore.locale` exists)
- Telemetry / error tracking
- Build-size budget CI enforcement
- Cross-game shared asset bundle

If implementation work crosses into these areas, stop and ask.

## Where things live

```
docs/                   architecture documentation (source of truth)
src/                    source code
  engine/               shared engine subsystems
  games/<id>/           one directory per game module
  store/                cross-game Zustand stores
  components/           React shell (dev-only lobby etc.)
public/                 static assets served as-is by Vite
tmp/                    scratch space (see below)
.npmrc                  supply-chain config
biome.json              lint + format config
.husky/pre-commit       runs lint-staged
release.json            (future) pinned ref + game allowlist for /dist/ deploy
```

## `tmp/` — scratch space

Anything an agent needs to write that should not survive the session goes under `./tmp/`. It is gitignored and is also outside the Biome / TypeScript include paths, so files there will not trip lint, format, or type-check.

**Prefer `./tmp/` over `/tmp/`.** The repo-local scratch directory keeps probe scripts, log dumps, and experiments visible inside the workspace (greppable, browsable, survives across tool calls in the same session), whereas `/tmp/` is opaque to anyone reviewing the work and is wiped by the system on its own schedule. Reach for `/tmp/` only when a tool genuinely requires an absolute path outside the workspace.

Use cases:
- One-off probe / debug scripts while diagnosing an issue.
- Experimental sketches before promoting code to `src/`.
- Inspecting library internals (read package source into `tmp/` if needed).
- Dev-server / build logs (`./tmp/vite.log`) when running long processes.

No cleanup obligation — `tmp/` is gitignored, so leftover files do not affect the repo. Tidy when it helps; otherwise leave them.

## Troubleshooting

### `npm install` fails with `ETARGET ... date before <today minus 3 days>`

`.npmrc` has `min-release-age=3`, so npm refuses to install package versions younger than 3 days (a supply-chain hygiene measure). When a fresh release of a dep falls inside the window, the install errors with:

```
npm error notarget No matching version found for <pkg>@^X.Y.Z with a date before <DATE>.
```

Fix: drop the affected entry in `package.json` by one patch (or one minor) and retry. **Do not** lower `min-release-age` to bypass this.

### Vitest reports `localStorage` undefined despite `// @vitest-environment happy-dom`

Node 26 + happy-dom 20 + Vitest 4 have a broken integration where Node's experimental `localStorage` global shadows happy-dom's. This project sidesteps it with a manual shim in `src/test/setup.ts`, wired up via `test.setupFiles`. Use `globalThis.localStorage` (the default name) — it works under the node environment.

### `useXxxStore.persist` is `undefined`

Zustand v5's `persist` middleware silently drops its namespace if the storage factory throws on the first call. The repo standard is to always pass explicit storage:

```typescript
persist(initializer, {
  name: '...',
  storage: createJSONStorage(() => globalThis.localStorage),
})
```

Don't omit `storage`; the default `() => window.localStorage` breaks under Vitest and SSR-style environments.
