import { describe, expect, it } from 'vitest'
import { gameSpeedIncrement, scoreIncrement, spawnIntervalMs } from './difficulty'

describe('scoreIncrement', () => {
  it('is 1 per 100 ms', () => {
    expect(scoreIncrement(100)).toBeCloseTo(1)
  })

  it('scales linearly with delta', () => {
    expect(scoreIncrement(500)).toBeCloseTo(scoreIncrement(100) * 5)
  })
})

describe('gameSpeedIncrement', () => {
  it('is 0.005 per 100 ms', () => {
    expect(gameSpeedIncrement(100)).toBeCloseTo(0.005)
  })

  it('reaches +1.0 around 20 seconds', () => {
    // 20000 ms * 0.00005 = 1.0
    expect(gameSpeedIncrement(20_000)).toBeCloseTo(1)
  })
})

describe('spawnIntervalMs', () => {
  it('returns the base rate at gameSpeed=1', () => {
    expect(spawnIntervalMs(1500, 1)).toBe(1500)
  })

  it('halves the interval when gameSpeed doubles', () => {
    expect(spawnIntervalMs(1500, 2)).toBe(750)
  })

  it('is strictly decreasing in gameSpeed', () => {
    const a = spawnIntervalMs(1500, 1)
    const b = spawnIntervalMs(1500, 1.5)
    const c = spawnIntervalMs(1500, 2)
    expect(a).toBeGreaterThan(b)
    expect(b).toBeGreaterThan(c)
  })
})
