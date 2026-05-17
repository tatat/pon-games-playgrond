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

## Daily commands

```bash
npm run dev          # Vite dev server (playground SPA on http://localhost:5173)
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

Use cases:
- One-off probe / debug scripts while diagnosing an issue.
- Experimental sketches before promoting code to `src/`.
- Inspecting library internals (read package source into `tmp/` if needed).

No cleanup obligation — `tmp/` is gitignored, so leftover files do not affect the repo. Tidy when it helps; otherwise leave them.
