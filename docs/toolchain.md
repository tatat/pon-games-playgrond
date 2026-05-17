# Toolchain

Project-wide dev tooling for `pon-games-playgrond`: package manager, lint/format, pre-commit hooks, supply-chain hardening, and deployment. Game-specific architecture lives in [`web-arcade-architecture.md`](./web-arcade-architecture.md).

This document is deliberately portable — the same setup should work in the destination project when the playground content is lifted out.

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Build | **Vite** | Fast HMR, native TS, code splitting |
| Lint / Format | **Biome** | Single tool / single config for both; Rust-fast; covers JS/TS/JSX/JSON/CSS |
| Pre-commit | **husky + lint-staged** | De facto JS standard; large reference base when porting |
| Package manager | **npm** | Bundled with Node; supply-chain hardening done via `.npmrc` (see [Supply Chain Hygiene](#supply-chain-hygiene)) |

## Lint, Format, and Pre-commit

Biome handles lint and format with a single tool. husky + lint-staged run it on staged files before each commit.

```bash
npm i -D @biomejs/biome husky lint-staged
npx biome init
npx husky init
```

`husky init` writes a `.husky/pre-commit` and adds `"prepare": "husky"` to `package.json` so the hook installs on every fresh `npm install` — but see [Supply Chain Hygiene](#supply-chain-hygiene): because `ignore-scripts=true` is on, `prepare` must be run explicitly with `npm run prepare`.

```json
// package.json (excerpts)
{
  "scripts": {
    "lint": "biome check .",
    "format": "biome check --write ."
  },
  "lint-staged": {
    "*.{js,jsx,ts,tsx,json,jsonc,css}": [
      "biome check --write --no-errors-on-unmatched"
    ]
  }
}
```

```bash
# .husky/pre-commit
npx lint-staged
```

For CI, run `biome ci .` (no `--write`, fails on diff) instead of `biome check`.

## Supply Chain Hygiene

Three layered defenses, configured in a single `.npmrc`:

```ini
# .npmrc
registry=https://<takumi-guard-proxy-url>/
min-release-age=3
ignore-scripts=true
```

| Setting | Defends against | Mechanism |
|---|---|---|
| `registry=` Takumi Guard proxy | Known-malicious packages | Registry-layer block (returns 403 for flagged versions) |
| `min-release-age=3` | Freshly-published malicious versions (smash-and-grab) | Refuses to install versions younger than 3 days |
| `ignore-scripts=true` | `preinstall` / `postinstall` worms (e.g. Shai-Hulud-class) | Skips lifecycle scripts from all dependencies |

### Consequence: husky `prepare` runs manually

`ignore-scripts=true` also blocks the project's own `prepare` script, so husky doesn't auto-install on `npm install`. Document a two-step setup:

```bash
npm install
npm run prepare   # installs husky hooks
```

### CI

GitHub Actions: route installs through the same proxy with the official action, then use `npm ci` for a frozen-lockfile install:

```yaml
- uses: flatt-security/setup-takumi-guard-npm@v1
- run: npm ci
```

`npm ci` already implies `--ignore-scripts` behavior matching the `.npmrc`. The Takumi Guard step writes the proxy `registry=` to a project-level `.npmrc` for the job. Local and CI configurations stay in sync.

### Adding a dependency that needs install scripts

For this stack the common deps don't need them (Pixi is pure JS, `rapier2d-compat` ships prebuilt WASM, Biome is a single binary). If a future dep requires `postinstall`, decide explicitly — either run `npm install --foreground-scripts` for that single install, or audit the script before adding it. Never silently flip `ignore-scripts` back to `false`.

## Deployment

The playground itself targets **GitHub Pages**. Vite emits a static `dist/` directory; no backend is provisioned in this repo.

Because GH Pages serves the site under `https://<user>.github.io/<repo>/`, `base` must match the repo path:

```typescript
// vite.config.ts
export default defineConfig({
  base: '/pon-games-playgrond/',
});
```

GH Pages-specific constraints to keep in mind:

- **No server-side routing.** React Router must use either hash routing (`HashRouter`) or the `404.html` → `index.html` redirect trick for browser routing.
- **Static only.** Any feature that would need a server (leaderboards with score validation, auth, persisted profiles) is out of scope here. Cross-game user state stays in `localStorage`.
- **Public repo posture.** No secrets in the repo; no references to internal-only resources.

When the architecture is ported to another project, only the `base` value and the routing strategy should need to change.

## Setup Order

1. Scaffold with `npm create pixi.js@latest` (Vite + TS template).
2. Write `.npmrc` with the Takumi Guard registry, `min-release-age=3`, and `ignore-scripts=true`.
3. `npx biome init` and `npx husky init`; commit the generated configs. `husky init` is what adds the `prepare` script to `package.json`, so it has to come before any `npm run prepare`.
4. `npm install` then `npm run prepare` (the latter installs the husky hooks, which `ignore-scripts=true` skipped during install).
5. Update `index.html`: viewport meta, full-screen `html`/`body`/`#root`, `touch-action: none` on the body so Pixi receives pointer events cleanly. Safe-area padding is **not** applied to `#root` — it is applied inside each React shell route's own wrapper so the gameplay route still gets a true viewport-fill canvas.

   ```html
   <meta name="viewport"
         content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
   <style>
     html, body, #root { margin: 0; height: 100%; background: #000; }
     body { touch-action: none; overflow: hidden; }
   </style>
   ```

   In React shell routes (lobby, settings, leaderboard) the outermost wrapper applies `padding: env(safe-area-inset-*)`.

From here, switch to [`web-arcade-architecture.md`](./web-arcade-architecture.md) for the game-side build order.
