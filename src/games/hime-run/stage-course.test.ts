import { describe, expect, it } from 'vitest'
import sampleStageJson from '../../../public/games/hime-run/stages/sample.json'
import { SAMPLE_COURSE, SAMPLE_LOOP_START } from './sample-course'
import { parseStageCourse, STAGE_COURSE_VERSION } from './stage-course'

/** The document the export script writes — used here to assert the round trip
 * (serialized sample → validated course) the runtime loader relies on. */
const sampleDoc = () => ({
  version: STAGE_COURSE_VERSION,
  name: 'Sample',
  loopStart: SAMPLE_LOOP_START,
  sections: SAMPLE_COURSE,
})

describe('parseStageCourse', () => {
  it('accepts the serialized sample course and preserves it', () => {
    const loaded = parseStageCourse(sampleDoc())
    expect(loaded.name).toBe('Sample')
    expect(loaded.loopStart).toBe(SAMPLE_LOOP_START)
    expect(loaded.course).toHaveLength(SAMPLE_COURSE.length)
    expect(loaded.course[0]?.name).toBe(SAMPLE_COURSE[0]?.name)
  })

  it('rejects an unsupported version', () => {
    expect(() => parseStageCourse({ ...sampleDoc(), version: 999 })).toThrow()
  })

  it('rejects loopStart out of range', () => {
    expect(() => parseStageCourse({ ...sampleDoc(), loopStart: SAMPLE_COURSE.length })).toThrow()
    expect(() => parseStageCourse({ ...sampleDoc(), loopStart: -1 })).toThrow()
  })

  it('rejects an empty section list', () => {
    expect(() => parseStageCourse({ ...sampleDoc(), sections: [], loopStart: 0 })).toThrow()
  })

  it('rejects a non-positive or non-finite section width', () => {
    for (const width of [0, -1, Number.POSITIVE_INFINITY, Number.NaN]) {
      expect(() =>
        parseStageCourse({
          version: STAGE_COURSE_VERSION,
          name: 'x',
          loopStart: 0,
          sections: [{ name: 's', width, blocks: [] }],
        }),
      ).toThrow()
    }
  })

  it('rejects a non-positive or non-finite block dimension', () => {
    for (const [w, h] of [
      [0, 1],
      [1, 0],
      [-1, 1],
      [1, Number.POSITIVE_INFINITY],
    ]) {
      expect(() =>
        parseStageCourse({
          version: STAGE_COURSE_VERSION,
          name: 'x',
          loopStart: 0,
          sections: [{ name: 's', width: 1, blocks: [{ type: 'terrain', x: 0, y: 0, w, h }] }],
        }),
      ).toThrow()
    }
  })

  it('rejects an invalid block type', () => {
    expect(() =>
      parseStageCourse({
        version: STAGE_COURSE_VERSION,
        name: 'x',
        loopStart: 0,
        sections: [{ name: 's', width: 1, blocks: [{ type: 'lava', x: 0, y: 0, w: 1, h: 1 }] }],
      }),
    ).toThrow()
  })

  it('rejects a non-finite block field', () => {
    expect(() =>
      parseStageCourse({
        version: STAGE_COURSE_VERSION,
        name: 'x',
        loopStart: 0,
        sections: [
          { name: 's', width: 1, blocks: [{ type: 'coin', x: 0, y: Number.NaN, w: 1, h: 1 }] },
        ],
      }),
    ).toThrow()
  })

  it('rejects a non-object document', () => {
    expect(() => parseStageCourse(null)).toThrow()
    expect(() => parseStageCourse('nope')).toThrow()
  })
})

describe('shipped sample.json', () => {
  // The runtime loads this file, but it's generated from sample-course.ts by
  // scripts/hime-run-export-sample.mjs. This guards against drift: editing the
  // course without re-running the export fails here (re-run the script to fix).
  it('matches the current export of SAMPLE_COURSE', () => {
    expect(sampleStageJson).toEqual({
      version: STAGE_COURSE_VERSION,
      name: 'Sample',
      loopStart: SAMPLE_LOOP_START,
      sections: SAMPLE_COURSE,
    })
  })

  it('validates as a stage course', () => {
    expect(() => parseStageCourse(sampleStageJson)).not.toThrow()
  })
})
