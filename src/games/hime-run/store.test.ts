import { beforeEach, describe, expect, it } from 'vitest'
import { RANDOM_BEST_KEY, useHimeRunStore } from './store'

beforeEach(() => {
  useHimeRunStore.persist.clearStorage()
  useHimeRunStore.setState(useHimeRunStore.getInitialState(), true)
})

describe('useHimeRunStore', () => {
  it('starts with no bests and no remembered seed', () => {
    const s = useHimeRunStore.getState()
    expect(s.bests).toEqual({})
    expect(s.lastRandomSeed).toBeNull()
  })

  it('submitBest records the first score', () => {
    useHimeRunStore.getState().submitBest('sample', 100)
    expect(useHimeRunStore.getState().bests.sample).toBe(100)
  })

  it('submitBest keeps the maximum across submissions', () => {
    const { submitBest } = useHimeRunStore.getState()
    submitBest('sample', 100)
    submitBest('sample', 50)
    submitBest('sample', 200)
    submitBest('sample', 150)
    expect(useHimeRunStore.getState().bests.sample).toBe(200)
  })

  it('tracks each stage independently', () => {
    const { submitBest } = useHimeRunStore.getState()
    submitBest('sample', 100)
    submitBest('other', 50)
    const { bests } = useHimeRunStore.getState()
    expect(bests.sample).toBe(100)
    expect(bests.other).toBe(50)
  })

  it('shares one bucket for every random run', () => {
    const { submitBest } = useHimeRunStore.getState()
    submitBest(RANDOM_BEST_KEY, 80)
    submitBest(RANDOM_BEST_KEY, 120)
    expect(useHimeRunStore.getState().bests[RANDOM_BEST_KEY]).toBe(120)
  })

  it('remembers the last random seed', () => {
    useHimeRunStore.getState().setLastRandomSeed(4242)
    expect(useHimeRunStore.getState().lastRandomSeed).toBe(4242)
  })
})
