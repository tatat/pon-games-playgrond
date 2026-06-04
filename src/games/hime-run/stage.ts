import { resolveAssetUrl } from '../../engine/assets'
import { type LoadedStageCourse, parseStageCourse } from './stage-course'

export type { LoadedStageCourse, StageCourseJson } from './stage-course'

/** On-disk stage-manifest schema version. */
export const STAGE_MANIFEST_VERSION = 1

/** A selectable stage. Today every stage is an authored course file; phase 3 adds
 * seed-based random stages, which is when this gains a source distinction. */
export interface StageDef {
  id: string
  name: string
  /** Course JSON filename under `stages/`. */
  file: string
}

/** The stage catalog the select screen lists. The manifest is the authoritative
 * source of each stage's `id` and display `name` (a `name` inside a course JSON is
 * advisory). */
export interface StageManifest {
  version: number
  stages: StageDef[]
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
      return { id, name, file }
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
