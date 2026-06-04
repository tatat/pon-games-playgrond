import { afterEach, describe, expect, it, vi } from 'vitest'
import manifestJson from '../../../public/games/hime-run/stages/manifest.json'
import {
  loadStageCourse,
  loadStageManifest,
  parseStageManifest,
  STAGE_MANIFEST_VERSION,
} from './stage'
import { STAGE_COURSE_VERSION } from './stage-course'

const validDoc = {
  version: STAGE_COURSE_VERSION,
  name: 'T',
  loopStart: 0,
  sections: [{ name: 's', width: 1, blocks: [] }],
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('loadStageCourse', () => {
  it('fetches from the base-resolved stages dir and returns the parsed course', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(validDoc), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const loaded = await loadStageCourse('sample.json', new AbortController().signal)

    expect(loaded.name).toBe('T')
    expect(loaded.course).toHaveLength(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('games/hime-run/stages/sample.json')
  })

  it('throws on a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 404 })),
    )
    await expect(loadStageCourse('missing.json', new AbortController().signal)).rejects.toThrow()
  })

  it('throws on an invalid document', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ version: 999 }), { status: 200 })),
    )
    await expect(loadStageCourse('bad.json', new AbortController().signal)).rejects.toThrow()
  })

  it('forwards the abort signal to fetch', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(validDoc), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const ac = new AbortController()

    await loadStageCourse('sample.json', ac.signal)

    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(ac.signal)
  })
})

const validManifest = {
  version: STAGE_MANIFEST_VERSION,
  stages: [{ id: 'sample', name: 'Sample', file: 'sample.json' }],
}

describe('parseStageManifest', () => {
  it('accepts a valid manifest', () => {
    const m = parseStageManifest(validManifest)
    expect(m.stages).toHaveLength(1)
    expect(m.stages[0]).toEqual({
      kind: 'course',
      id: 'sample',
      name: 'Sample',
      file: 'sample.json',
    })
  })

  it('rejects an unsupported version', () => {
    expect(() => parseStageManifest({ ...validManifest, version: 999 })).toThrow()
  })

  it('rejects an empty or missing stage list', () => {
    expect(() => parseStageManifest({ version: STAGE_MANIFEST_VERSION, stages: [] })).toThrow()
    expect(() => parseStageManifest({ version: STAGE_MANIFEST_VERSION })).toThrow()
  })

  it('rejects a stage entry missing string fields', () => {
    expect(() =>
      parseStageManifest({
        version: STAGE_MANIFEST_VERSION,
        stages: [{ id: 'x', name: 'X' }],
      }),
    ).toThrow()
  })

  it('rejects a course claiming the reserved random-best id', () => {
    expect(() =>
      parseStageManifest({
        version: STAGE_MANIFEST_VERSION,
        stages: [{ id: 'random', name: 'X', file: 'x.json' }],
      }),
    ).toThrow()
  })

  it('rejects a file that is not a plain .json basename (path traversal)', () => {
    for (const file of ['../secret.json', 'sub/dir.json', 'sample.txt', 'sample']) {
      expect(() =>
        parseStageManifest({
          version: STAGE_MANIFEST_VERSION,
          stages: [{ id: 'x', name: 'X', file }],
        }),
      ).toThrow()
    }
  })
})

describe('loadStageManifest', () => {
  it('fetches the manifest and returns the parsed stages', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(validManifest), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const m = await loadStageManifest(new AbortController().signal)

    expect(m.stages[0]?.file).toBe('sample.json')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('games/hime-run/stages/manifest.json')
  })

  it('throws on a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 404 })),
    )
    await expect(loadStageManifest(new AbortController().signal)).rejects.toThrow()
  })
})

describe('shipped manifest.json', () => {
  it('validates and lists the sample stage', () => {
    const m = parseStageManifest(manifestJson)
    expect(m.stages.some((s) => s.file === 'sample.json')).toBe(true)
  })
})
