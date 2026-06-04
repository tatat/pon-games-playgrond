import { resolveAssetUrl } from '../../engine/assets'
import { type LoadedStageCourse, parseStageCourse } from './stage-course'

export type { LoadedStageCourse, StageCourseJson } from './stage-course'

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
