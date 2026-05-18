#!/usr/bin/env node
// RR7 pre-renders HTML files relative to `basename` (e.g.
// `dist/client/pon-games-playgrond/index.html`).  For GitHub Pages, the
// artifact root is served at that basename, so HTML files must live at the
// root of `dist/client/` — not nested one level deeper.
//
// This script promotes `dist/client/<basename>/` contents to `dist/client/`
// so the final layout is compatible with `actions/upload-pages-artifact`.

import { cpSync, existsSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pkg from '../package.json' with { type: 'json' }

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
const clientDir = resolve(repoRoot, 'dist/client')

const baseName = pkg.name
const nestedDir = resolve(clientDir, baseName)

if (!existsSync(nestedDir)) {
  console.log(`post-build: ${baseName}/ not found in dist/client/ — nothing to promote`)
  process.exit(0)
}

cpSync(nestedDir, clientDir, { recursive: true })
rmSync(nestedDir, { recursive: true })
console.log(`post-build: promoted dist/client/${baseName}/ → dist/client/`)
