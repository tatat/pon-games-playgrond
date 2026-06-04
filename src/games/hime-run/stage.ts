import { resolveAssetUrl } from '../../engine/assets'
import { type LoadedStageCourse, parseStageCourse } from './stage-course'
import { RANDOM_BEST_KEY } from './store'

export type { LoadedStageCourse, StageCourseJson } from './stage-course'

/** On-disk stage-manifest schema version. */
export const STAGE_MANIFEST_VERSION = 1

/** A manifest-listed stage backed by an authored course JSON file. */
export interface CourseStageDef {
  kind: 'course'
  id: string
  name: string
  /** Course JSON filename under `stages/`. */
  file: string
}

/** A seed-based random stage (not in the manifest — the select screen synthesises
 * it). All seeds share one persisted best bucket (`RANDOM_BEST_KEY`), so its `id`
 * is that key. */
export interface RandomStageDef {
  kind: 'random'
  id: string
  name: string
  seed: number
}

/** A selectable stage: an authored course or a seeded random run. Both resolve to
 * a `SectionSource` in `MainScene`. */
export type StageDef = CourseStageDef | RandomStageDef

/** The stage catalog the select screen lists. The manifest is the authoritative
 * source of each stage's `id` and display `name` (a `name` inside a course JSON is
 * advisory). It carries only authored courses; the random entry is added in code. */
export interface StageManifest {
  version: number
  stages: CourseStageDef[]
}

export function parseStageManifest(data: unknown): StageManifest {
  if (typeof data !== 'object' || data === null) throw new Error('hime-run manifest: not an object')
  const { version, stages } = data as Record<string, unknown>
  if (version !== STAGE_MANIFEST_VERSION) {
    throw new Error(`hime-run manifest: unsupported version ${JSON.stringify(version)}`)
  }
  if (!Array.isArray(stages) || stages.length === 0) {
    throw new Error('hime-run manifest: stages must be a non-empty array')
  }
  return {
    version,
    stages: stages.map((s, i) => {
      if (typeof s !== 'object' || s === null) {
        throw new Error(`hime-run manifest: stage ${i} is not an object`)
      }
      const { id, name, file } = s as Record<string, unknown>
      if (typeof id !== 'string' || typeof name !== 'string' || typeof file !== 'string') {
        throw new Error(`hime-run manifest: stage ${i} needs string id, name, file`)
      }
      // `file` is joined into the stages dir URL, so confine it to a plain .json
      // basename — no path separators (which would escape the stages directory).
      if (!/^[\w-]+\.json$/.test(file)) {
        throw new Error(`hime-run manifest: stage ${i} file "${file}" must be a .json basename`)
      }
      // `RANDOM_BEST_KEY` is reserved for the synthesised random stage's shared best
      // bucket; a course claiming it would alias their persisted bests together.
      if (id === RANDOM_BEST_KEY) {
        throw new Error(`hime-run manifest: stage ${i} id "${id}" is reserved`)
      }
      return { kind: 'course', id, name, file }
    }),
  }
}

/** Fetch and validate the stage manifest. Same base-resolution as the course
 * loader. The `signal` aborts the fetch. */
export async function loadStageManifest(signal: AbortSignal): Promise<StageManifest> {
  const res = await fetch(resolveAssetUrl('games/hime-run/stages/manifest.json'), { signal })
  if (!res.ok) throw new Error(`hime-run manifest: failed to fetch (${res.status})`)
  return parseStageManifest(await res.json())
}

/** Fetch and validate a stage course from `public/games/hime-run/stages/<file>`.
 * Routes through `resolveAssetUrl` so the base path is correct on any SPA route
 * and in the embed (library-mode) bundle. The `signal` aborts the fetch. */
export async function loadStageCourse(
  file: string,
  signal: AbortSignal,
): Promise<LoadedStageCourse> {
  const res = await fetch(resolveAssetUrl(`games/hime-run/stages/${file}`), { signal })
  if (!res.ok) throw new Error(`hime-run stage: failed to fetch ${file} (${res.status})`)
  return parseStageCourse(await res.json())
}
