#!/usr/bin/env node
// Cross-platform driver for the per-game embed (lib-mode) build. Vite
// only takes one entry per invocation, so loop the games and re-run
// `vite build --config vite.embed.config.ts` with `GAME_ID` set in env.
// Vite's emptyOutDir clears each game's own dist/embed/<game>/ subdir
// (separate from the SPA build's dist/index.html etc), so the order
// between SPA and embed builds doesn't matter for collisions.

import { execSync } from 'node:child_process'
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
}
