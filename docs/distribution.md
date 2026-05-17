# Distribution

How playground's build artifacts reach ponpon. The playground develops the games; ponpon consumes them as ESM library bundles via the playground's GitHub Pages URL.

Related: [`toolchain.md`](./toolchain.md), [`architecture/plugin-interface.md`](./architecture/plugin-interface.md).

## Two roles, one Pages deployment

GitHub Pages for this repo serves **both** of these at the same origin:

| Path | What | Audience |
|---|---|---|
| `/` | Playground SPA (lobby + games) | Anyone — public demo / dev iteration |
| `/dist/<game>/` | ESM library bundle + assets | ponpon — production consumer |

The two have **independent release cadence**:

- **SPA at `/`** reflects the current `main` HEAD — rebuilt on every push, can be experimental.
- **`/dist/`** is rebuilt only when `release.json` changes — represents the stable version that ponpon imports.

## `release.json`

Sits at the repo root. Pins which commit, and which games, become the next `/dist/` deployment.

```json
{
  "ref": "abc1234e",
  "games": ["breakout-clone", "sticker-drift"]
}
```

- `ref` — a commit SHA (or tag) in this repo. The lib build runs from a checkout of this commit, not from current `main`.
- `games` — explicit allowlist. Games not listed are not built and not deployed. This is the mechanism for keeping WIP games out of the published `/dist/`.

Releasing a new dist version = updating `release.json` and pushing. Git history of `release.json` is the release log.

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

## Two build targets

`vite.config.ts` (or two configs) defines:

- **`npm run build:spa`** — the playground SPA (lobby + games). Output: `build-spa/`.
- **`npm run build:lib`** — library bundles. Output: `dist/<game>/{index.js, assets/...}`. Accepts a `--game <id>` flag to build a single entry.

Each game has an `embed.ts` that is the library entry:

```typescript
// src/games/<id>/embed.ts
export interface MountOptions {
  seed?: number;
  onScoreChange?(score: number): void;
  onGameOver?(result: GameResult): void;
  settings?: Partial<SettingsState>;     // host can inject defaults
}

export interface Handle {
  destroy(): void;
}

export async function mount(el: HTMLElement, opts?: MountOptions): Promise<Handle>;
```

`mount` wraps the internal `GameModule.start` path: bootstrap Rapier / audio, create `Application` parented to `el`, run the game, return a `destroy`. Each game's bundle inlines its dependencies (Pixi, Rapier WASM, Zustand for that game) — bundle sharing across games is not pursued at this scale.

Asset URLs use `new URL('./assets/...', import.meta.url)` so the bundle resolves them relative to where it is served — no config required from the consumer.

## Deploy workflow (GitHub Actions)

A single Action on push to `main`:

```yaml
- uses: actions/checkout@v4

# Build the SPA from current main
- run: npm ci
- run: npm run build:spa            # → build-spa/

# Build /dist from the pinned ref, into the SPA output's dist/ subdir
- name: Build pinned library bundles
  run: |
    ref=$(jq -r .ref release.json)
    games=$(jq -r '.games | join(" ")' release.json)
    git worktree add /tmp/rel "$ref"
    pushd /tmp/rel
    npm ci
    for g in $games; do
      npm run build:lib -- --game "$g"
      cp -R dist/"$g" "$GITHUB_WORKSPACE"/build-spa/dist/
    done
    popd

- uses: actions/deploy-pages@v...
  with:
    path: build-spa
```

Optional cache (`actions/cache` keyed by `hashFiles('release.json')`) avoids rebuilding the library on SPA-only pushes.

## ponpon consumption

ponpon imports each game by URL from the playground's Pages deployment. The script runs on ponpon's origin, so `localStorage` is ponpon's (settings and save data live with ponpon).

```tsx
// ponpon/src/app/games/breakout-clone/game.tsx
'use client'
import { useEffect, useRef } from 'react'

const SCRIPT_URL = 'https://tatat.github.io/pon-games-playgrond/dist/breakout-clone/index.js'

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

`/dist/` URLs are unversioned (e.g. `/dist/breakout-clone/index.js`). Updating `release.json` overwrites the deployed `/dist/` content in place. ponpon picks up the new version on the next reload.

When pinning becomes useful (e.g. ponpon wants to stay on a known-good version while playground experiments), versioned dirs can be added: `/dist/breakout-clone/v0.3.0/index.js`. For solo dev with low release cadence, unversioned `/dist/` is sufficient.

## What this does NOT cover

- ponpon's own React boundary code (the `game.tsx` above) lives in ponpon's repo and is not part of `/dist/`. The playground only ships engine + game logic.
- `useUserStore` / `useSettingsStore` from the playground are reachable to ponpon **only** as side effects of running `mount` — the consumer can't query them through `mount`. Cross-app sharing of those stores (e.g. ponpon's settings page driving in-game volume) requires either bundling the stores' export with `mount`, or duplicating the store in ponpon. Decide at integration time; not required for first-game port.
