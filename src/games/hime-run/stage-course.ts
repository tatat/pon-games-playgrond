import type { Course, Section } from './course'
import type { Block, BlockType } from './obstacles'

// Pure parsing/validation for a stage course (no IO, no Pixi). Kept separate from
// the fetch-based loader (`stage.ts`) so the export script
// (`scripts/hime-run-export-sample.mjs`) can reuse this validator under plain Node
// — this module only `import type`s, so it has no runtime dependencies.

/** On-disk stage-course schema version. Bump when the stored shape changes. */
export const STAGE_COURSE_VERSION = 1

/** A stage course as stored on disk: a serialized grid `Course` (cells; `y`
 * ground-relative, up = +) plus the intro|loop split. The builder exports this
 * shape; `SAMPLE_COURSE` is written to it by the export script. */
export interface StageCourseJson {
  version: number
  name: string
  /** Sections [0, loopStart) play once (intro); [loopStart, …] repeat. */
  loopStart: number
  sections: Section[]
}

/** A validated course ready to drive an `AuthoredSource`. */
export interface LoadedStageCourse {
  name: string
  loopStart: number
  course: Course
}

/** The block-type vocabulary, as a runtime set for validation. Must track the
 * `BlockType` union in obstacles.ts. */
const BLOCK_TYPES: ReadonlySet<BlockType> = new Set<BlockType>([
  'terrain',
  'ledge',
  'hazard',
  'pit',
  'coin',
])

function fail(msg: string): never {
  throw new Error(`hime-run stage: ${msg}`)
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function parseBlock(v: unknown, where: string): Block {
  if (!isRecord(v)) fail(`${where} is not an object`)
  const { type, x, y, w, h } = v
  if (typeof type !== 'string' || !BLOCK_TYPES.has(type as BlockType)) {
    fail(`${where} has invalid type ${JSON.stringify(type)}`)
  }
  // Position may sit anywhere (negative y is below ground); size must be positive.
  for (const [k, n] of [
    ['x', x],
    ['y', y],
  ] as const) {
    if (typeof n !== 'number' || !Number.isFinite(n)) fail(`${where}.${k} is not a finite number`)
  }
  for (const [k, n] of [
    ['w', w],
    ['h', h],
  ] as const) {
    if (typeof n !== 'number' || !Number.isFinite(n) || !(n > 0)) {
      fail(`${where}.${k} must be a positive finite number`)
    }
  }
  return { type: type as BlockType, x: x as number, y: y as number, w: w as number, h: h as number }
}

function parseSection(v: unknown, i: number): Section {
  if (!isRecord(v)) fail(`section ${i} is not an object`)
  const { name, width, blocks } = v
  if (typeof name !== 'string') fail(`section ${i} name is not a string`)
  if (typeof width !== 'number' || !Number.isFinite(width) || !(width > 0)) {
    fail(`section "${String(name)}" width must be a positive finite number`)
  }
  if (!Array.isArray(blocks)) fail(`section "${name}" blocks is not an array`)
  return {
    name,
    width,
    blocks: blocks.map((b, j) => parseBlock(b, `section "${name}" block ${j}`)),
  }
}

/** Validate an untrusted stage-course document (e.g. loaded JSON) and return a
 * runtime-ready course. Throws on the first problem — version mismatch, bad
 * structure, an invalid block type/field, or a violated `CourseWalker` invariant
 * (non-empty, `0 ≤ loopStart < sections.length`, every `width > 0`). */
export function parseStageCourse(data: unknown): LoadedStageCourse {
  if (!isRecord(data)) fail('document is not an object')
  const { version, name, loopStart, sections } = data
  if (version !== STAGE_COURSE_VERSION) {
    fail(`unsupported version ${JSON.stringify(version)} (expected ${STAGE_COURSE_VERSION})`)
  }
  if (typeof name !== 'string') fail('name is not a string')
  if (!Array.isArray(sections) || sections.length === 0) fail('sections must be a non-empty array')
  if (
    typeof loopStart !== 'number' ||
    !Number.isInteger(loopStart) ||
    loopStart < 0 ||
    loopStart >= sections.length
  ) {
    fail(`loopStart ${JSON.stringify(loopStart)} out of range [0, ${sections.length})`)
  }
  const course: Course = sections.map((s, i) => parseSection(s, i))
  return { name, loopStart, course }
}
