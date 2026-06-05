#!/usr/bin/env node
// Serialize the hand-authored sample course (src/games/hime-run/sample-course.ts)
// to the runtime stage JSON the game loads (public/.../stages/sample.json).
//
// The authoring helpers already produce grid `Block`s (cells; y ground-relative,
// up = +), so this is a straight dump — no coordinate transform, no transcription.
// We self-check the output with the same validator the runtime loader uses, so the
// script can only emit a document the game would accept.
//
// Runs on plain Node (this repo's Node 26 strips TS types): both imported modules
// have only `import type` dependencies, so no bundler/transpiler is needed.
//
//   node scripts/hime-run-export-sample.mjs

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SAMPLE_COURSE, SAMPLE_LOOP_START } from '../src/games/hime-run/sample-course.ts'
import { parseStageCourse, STAGE_COURSE_VERSION } from '../src/games/hime-run/stage-course.ts'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')

const doc = {
  version: STAGE_COURSE_VERSION,
  name: 'Sample',
  loopStart: SAMPLE_LOOP_START,
  sections: SAMPLE_COURSE,
}

// Reject before writing if the dump wouldn't load — keeps disk and runtime in sync.
parseStageCourse(doc)

const out = resolve(repoRoot, 'public/games/hime-run/stages/sample.json')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`)
console.log(`wrote ${out} (${doc.sections.length} sections, loopStart ${doc.loopStart})`)
