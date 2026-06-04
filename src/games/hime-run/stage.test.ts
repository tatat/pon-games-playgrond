import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadStageCourse } from './stage'
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
