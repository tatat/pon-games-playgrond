#!/usr/bin/env node
// Cross-platform driver for the per-game embed (lib-mode) build. Vite
// only takes one entry per invocation, so loop the games and re-run
// `vite build --config vite.embed.config.ts` with `GAME_ID` set in env.
// Vite's emptyOutDir clears each game's own dist/embed/<game>/ subdir
// (separate from the SPA build's dist/index.html etc), so the order
// between SPA and embed builds doesn't matter for collisions.

import { execSync } from 'node:child_process'
import { cpSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Hardcoded for now. Phase 2 will read this from `release.json`.
const GAMES = ['breakout-clone', 'sticker-drift']

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')

const requested = process.argv.slice(2)
const games = requested.length > 0 ? requested : GAMES

for (const id of games) {
  if (!GAMES.includes(id)) {
    console.error(`Unknown game id: ${id}. Known: ${GAMES.join(', ')}`)
    process.exit(1)
  }
}

for (const id of games) {
  console.log(`\n== Building embed bundle for ${id} ==`)
  execSync('npx vite build --config vite.embed.config.ts', {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, GAME_ID: id },
  })

  // Self-contained bundle: copy the game's `public/games/<id>/` tree
  // into the bundle's `assets/games/<id>/` so consumers fetch assets
  // relative to the bundle URL, not from the playground origin.
  //
  // The `games/<id>/` segment **inside** `assets/` is deliberate. The
  // engine emits asset paths like `games/<id>/stickers/<name>.png`
  // (no per-game refactor when shifting between SPA and embed mode);
  // the embed's `setAssetBaseUrl` is `<bundle>/assets/`. Combining
  // them gives `<bundle>/assets/games/<id>/stickers/<name>.png`,
  // which is exactly where this copy puts the file. Renaming either
  // half would force engine-wide path changes.
  const publicAssets = resolve(repoRoot, `public/games/${id}`)
  if (!existsSync(publicAssets)) {
    console.error(
      `Cannot find public assets for ${id} at ${publicAssets}. ` +
        'A known game id must have a populated `public/games/<id>/` ' +
        'directory; the embed bundle is unusable without it.',
    )
    process.exit(1)
  }
  const embedAssets = resolve(repoRoot, `dist/embed/${id}/assets/games/${id}`)
  cpSync(publicAssets, embedAssets, { recursive: true })
  console.log(`  copied assets → dist/embed/${id}/assets/games/${id}/`)
}
