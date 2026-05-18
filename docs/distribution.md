# Distribution

How playground's build artifacts reach ponpon. The playground develops the games; ponpon consumes them as ESM library bundles via the playground's GitHub Pages URL.

Related: [`toolchain.md`](./toolchain.md), [`architecture/plugin-interface.md`](./architecture/plugin-interface.md).

## Two roles, one Pages deployment

GitHub Pages for this repo serves **both** of these at the same origin. Paths below are public URL paths (under the repo's Pages prefix, e.g. `https://tatat.github.io/pon-games-playgrond/embed/breakout-clone/index.js`).

| Path | What | Audience |
|---|---|---|
| `/` | Playground SPA (lobby + games + static assets at `/games/…`) | Anyone — public demo / dev iteration |
| `/embed/<game>/index.js` + `/embed/<game>/assets/…` | Self-contained ESM library bundle | ponpon — production consumer |

The lib path settled on `/embed/<game>/` (not `/dist/<game>/`) so the build folder name (`dist/`, the Vite default) doesn't have to clash with the URL space. Each embed bundle is **self-contained**: a copy of that game's `public/games/<id>/` tree ships under `embed/<id>/assets/games/<id>/`, so ponpon only needs the `embed/<id>/index.js` URL — no separate asset fetch from the playground SPA path.

**Two release cadences:**

- **SPA** (`/`) follows main HEAD — every push rebuilds it.
- **Embed bundles** (`/embed/<id>/`) follow the commit pinned in `release.json` — they rebuild only when that file changes. The git history of `release.json` is the release log for the consumer-facing bundles.

## Two build targets

- **`npm run build`** — the playground SPA (lobby + games). Output: `dist/` (Vite default). Vite's `base: '/pon-games-playgrond/'` is baked in.
- **`npm run build:embed [-- <game> …]`** — per-game library bundles. Output: `dist/embed/<game>/index.js`. With no args, builds every game in the hardcoded list; pass game ids to build a subset (e.g. `npm run build:embed -- breakout-clone`). The script driving this is `scripts/build-embed.mjs`.

Both outputs share the single `dist/` so one Pages artifact carries everything.

Each game has an `embed.ts` that is the library entry:

```typescript
// src/games/<id>/embed.ts
export interface EmbedMountOptions {
  seed?: number
  onScoreChange?: (score: number) => void
  onGameOver?: (result: GameResult) => void
  assetBaseUrl?: string  // override the bundle-relative `./assets/` default
}

export interface EmbedHandle {
  destroy(): Promise<void>
}

export async function mount(
  container: HTMLElement,
  options?: EmbedMountOptions,
): Promise<EmbedHandle>
```

`mount` wraps the internal `GameModule.start` path: bootstrap Rapier / audio (`@dimforge/rapier2d-compat.init()` + `initAudio()` — idempotent across remounts), create `Application` parented to the host element, run the game, return a `destroy`. Each game's bundle inlines its dependencies (Pixi, Rapier WASM, Zustand for that game) — bundle sharing across games is not pursued at this scale.

Asset URLs are resolved against the **bundle's own URL**, not the playground origin or the host page's. `embed.ts` computes `new URL('./assets/', import.meta.url).href` and pushes it into the engine's asset resolver via `setAssetBaseUrl`. Combined with the engine's asset paths (`games/<id>/stickers/…`), URLs land at `<bundle>/assets/games/<id>/stickers/…` — exactly where `build-embed.mjs` copied the public assets. The bundle is fully portable: ponpon only knows the `embed/<id>/index.js` URL and the runtime walks to its sibling `assets/` automatically. Hosts can still override via `EmbedMountOptions.assetBaseUrl` for proxied / mirrored layouts.

## `release.json` and pinned-ref builds

`release.json` at the repo root pins the embed-bundle source commit and the games allowlist:

```json
{
  "ref": "abc1234e…",
  "games": ["breakout-clone", "sticker-drift"]
}
```

- `ref` — a commit SHA. The embed build runs from a `git worktree` checkout of this commit, not from current `main`.
- `games` — explicit allowlist. Games not listed are not built / deployed; the mechanism for keeping WIP games out of `/embed/`.

Cutting a release = updating `release.json` and pushing. The workflow reads main's `release.json`, checks out `ref` into a sibling worktree, runs `npm ci && npm run build:embed -- <games>` there, and copies the resulting `dist/embed/<id>/` trees into the main artifact's `dist/embed/`. The games list is passed to `build-embed.mjs` explicitly so the pinned ref's own `release.json` (if any) doesn't override the current intent.

A workflow `actions/cache` step keyed on a jq-normalised hash of `{ ref, games }` short-circuits the worktree + `npm ci` + vite build round-trip when only the SPA side changed — whitespace-only edits to `release.json` don't invalidate the cache.

**Security note.** Updating `release.json`'s `ref` causes the workflow to execute build code (`npm ci` + `vite build`) from that commit with the workflow's permissions (Pages write, etc.). Treat release-json bumps as code changes: review the diff between the previous ref and the new one before merging. The workflow does early-fail if the pinned ref is missing the embed pipeline (`scripts/build-embed.mjs`, `vite.embed.config.ts`, the `build:embed` npm script) so an unrelated old commit fails fast rather than mid-build.

Future upgrade path (when per-game pinning becomes useful):

```json
{
  "default_ref": "abc1234e",
  "games": {
    "breakout-clone": null,
    "sticker-drift":  { "ref": "ef56789f" }
  }
}
```

## Deploy workflow (GitHub Actions)

`.github/workflows/deploy-pages.yml` builds the SPA from main HEAD, builds the embed bundles from `release.json`'s pinned ref via `git worktree`, and uploads the combined `dist/` as the Pages artifact:

```yaml
- uses: actions/checkout@v4
  with: { fetch-depth: 0 }      # need full history for git worktree

- uses: actions/setup-node@v4
  with: { node-version: '26', cache: 'npm' }

- run: npm ci
- run: npm run build            # SPA → dist/

- name: Hash release.json semantically  # normalised so whitespace edits
                                        # don't invalidate the cache
  id: release-hash
  run: |
    value=$(jq -cS '{ref, games}' release.json | sha256sum | cut -d' ' -f1)
    echo "value=$value" >> "$GITHUB_OUTPUT"

- name: Cache pinned embed bundles
  id: cache-embed
  uses: actions/cache@v5
  with:
    path: dist/embed
    key: embed-${{ steps.release-hash.outputs.value }}

- name: Build pinned embed bundles
  if: steps.cache-embed.outputs.cache-hit != 'true'
  run: |
    set -euo pipefail
    REF=$(jq -r .ref release.json)
    GAMES=$(jq -r '.games | join(" ")' release.json)
    # See the workflow file for: trap-based worktree cleanup, early-fail
    # if the pinned ref is missing scripts/build-embed.mjs etc.
    git worktree add /tmp/rel "$REF"
    pushd /tmp/rel && npm ci && npm run build:embed -- $GAMES && popd
    rm -rf dist/embed
    mkdir -p dist
    cp -R /tmp/rel/dist/embed dist/embed

- uses: actions/configure-pages@v5
- uses: actions/upload-pages-artifact@v3
  with: { path: dist }
- uses: actions/deploy-pages@v4
```

The full file has the `permissions` / `concurrency` / `environment` blocks Pages requires, the trap for worktree cleanup, and the early-fail checks for the pinned ref — see the workflow itself for the canonical form.

## ponpon consumption

ponpon imports each game by URL from the playground's Pages deployment. The script runs on ponpon's origin, so `localStorage` is ponpon's (settings and save data live with ponpon).

```tsx
// ponpon/src/app/games/breakout-clone/game.tsx
'use client'
import { useEffect, useRef } from 'react'

const SCRIPT_URL = 'https://tatat.github.io/pon-games-playgrond/embed/breakout-clone/index.js'

export function BreakoutGame() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let handle: { destroy(): void } | null = null
    const ctrl = new AbortController()

    ;(async () => {
      const { mount } = await import(/* @vite-ignore */ SCRIPT_URL)
      if (ctrl.signal.aborted || !ref.current) return
      handle = await mount(ref.current, { seed: Date.now() })
    })()

    return () => {
      ctrl.abort()
      handle?.destroy()
    }
  }, [])

  return <div ref={ref} style={{ width: '100vw', height: '100vh' }} />
}
```

CORS, asset URLs, and audio fetches across origins all work — GitHub Pages serves with `Access-Control-Allow-Origin: *`.

## Versioning

`/embed/` URLs are unversioned (e.g. `/embed/breakout-clone/index.js`). Pushing to `main` overwrites the deployed `/embed/` content in place; ponpon picks up the new version on the next reload.

When per-game pinning becomes useful (e.g. ponpon wants to stay on a known-good version while playground experiments), Phase 2's `release.json` covers it. Versioned dirs (`/embed/breakout-clone/v0.3.0/index.js`) are a further step beyond that.

## What this does NOT cover

- ponpon's own React boundary code (the `game.tsx` above) lives in ponpon's repo and is not part of `/embed/`. The playground only ships engine + game logic.
- `useUserStore` / `useSettingsStore` from the playground are reachable to ponpon **only** as side effects of running `mount` — the consumer can't query them through `mount`. Cross-app sharing of those stores (e.g. ponpon's settings page driving in-game volume) requires either bundling the stores' export with `mount`, or duplicating the store in ponpon. Decide at integration time; not required for first-game port.
