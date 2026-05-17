import { beforeEach, describe, expect, it } from 'vitest'
import { useUserStore } from './user'

beforeEach(() => {
  localStorage.clear()
  useUserStore.persist.clearStorage()
  // Reset back to the initial state *including* the action methods, otherwise
  // `replace: true` would wipe them.
  useUserStore.setState(useUserStore.getInitialState(), true)
})

describe('useUserStore', () => {
  it('starts with sensible defaults', () => {
    expect(useUserStore.getState().username).toBe('Guest')
    expect(useUserStore.getState().highScores).toEqual({})
  })

  it('setUsername updates the name', () => {
    useUserStore.getState().setUsername('alice')
    expect(useUserStore.getState().username).toBe('alice')
  })

  it('setHighScore writes the score the first time', () => {
    useUserStore.getState().setHighScore('breakout', 100)
    expect(useUserStore.getState().highScores.breakout).toBe(100)
  })

  it('setHighScore keeps the maximum across submissions', () => {
    const { setHighScore } = useUserStore.getState()
    setHighScore('breakout', 100)
    setHighScore('breakout', 50)
    setHighScore('breakout', 200)
    setHighScore('breakout', 150)
    expect(useUserStore.getState().highScores.breakout).toBe(200)
  })

  it('setHighScore tracks each game independently', () => {
    const { setHighScore } = useUserStore.getState()
    setHighScore('breakout', 100)
    setHighScore('snake', 50)
    const { highScores } = useUserStore.getState()
    expect(highScores.breakout).toBe(100)
    expect(highScores.snake).toBe(50)
  })
})
