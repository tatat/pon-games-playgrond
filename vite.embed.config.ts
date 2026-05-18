import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// One game per invocation: callers set `GAME_ID=<id>` in the env (the
// `build:embed` script in package.json does this). The output goes to
// `dist/embed/<game>/index.js`, sharing the SPA's `dist/` so a single
// Pages artifact carries both. The embed's `outDir` is its own subdir
// under `dist/`, so `emptyOutDir: true` only wipes the per-game
// `dist/embed/<game>/` directory — never touches the SPA's `dist/`
// siblings.
//
// The set of valid game ids is duplicated with `scripts/build-embed.mjs`
// so a stray direct `vite build --config vite.embed.config.ts` doesn't
// silently write to an unexpected outDir. Keep the two lists in sync
// when adding a game (and consider pulling them into a shared module
// when the count grows past a handful).
const KNOWN_GAME_IDS = ['breakout-clone', 'sticker-drift']
const gameId = process.env.GAME_ID
if (!gameId) {
  throw new Error(
    'vite.embed.config.ts requires GAME_ID. Run via `npm run build:embed -- <game>` instead.',
  )
}
if (!KNOWN_GAME_IDS.includes(gameId)) {
  throw new Error(`Unknown GAME_ID="${gameId}". Known ids: ${KNOWN_GAME_IDS.join(', ')}.`)
}

export default defineConfig({
  // Use a root-relative base so `import.meta.url` inside the bundle
  // produces a URL on the host the bundle is served from (not a build-
  // time literal). `embed.ts` will further override the asset base with
  // `setAssetBaseUrl` so games resolve their `public/games/<id>/...`
  // assets against the lib's own URL.
  base: './',
  plugins: [react()],
  // React + react-dom sneak into the bundle via zustand's React entry;
  // both packages branch on `process.env.NODE_ENV` and the lib-mode
  // build doesn't substitute it the way the SPA build does. Inline a
  // production value so the bundle doesn't reference Node's `process`
  // global at runtime. (`zustand/vanilla` would let us drop React
  // entirely — defer that to its own pass.)
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  optimizeDeps: {
    exclude: ['@dimforge/rapier2d-compat'],
  },
  build: {
    outDir: `dist/embed/${gameId}`,
    emptyOutDir: true,
    // No sourcemap — the artifact ships open-source code, but the
    // map nearly doubles the Pages-artifact size (~4.7 MB per game)
    // for a bundle ponpon never has to debug from CDN. Re-enable
    // locally if needed.
    sourcemap: false,
    // The lib bundle resolves its assets against the playground's
    // origin via `import.meta.url` — we don't want vite to copy
    // `public/` *into* the embed dir. The SPA build already ships
    // public/ at the Pages root.
    copyPublicDir: false,
    lib: {
      entry: `src/games/${gameId}/embed.ts`,
      formats: ['es'],
      fileName: () => 'index.js',
    },
    // We deliberately bundle pixi.js, @pixi/sound, @pixi/ui, rapier,
    // and zustand so the embed bundle is self-contained — ponpon
    // imports one URL per game and gets a working runtime. No
    // `external` entries.
    rolldownOptions: {
      output: {
        // Single-file output keeps the URL list ponpon needs short.
        // Code-splitting would scatter chunks under the embed dir and
        // make the consumer manage chunk URLs.
        codeSplitting: false,
      },
    },
  },
})
