import { describe, expect, it } from 'vitest'
import { STARTING_LIVES } from './constants'
import { BreakoutState } from './state'

describe('BreakoutState', () => {
  it('starts with starting lives and zero score', () => {
    const s = new BreakoutState()
    expect(s.lives).toBe(STARTING_LIVES)
    expect(s.score).toBe(0)
    expect(s.isGameStarted).toBe(false)
    expect(s.isGameOver).toBe(false)
  })

  it('addScore accumulates', () => {
    const s = new BreakoutState()
    s.addScore(10)
    s.addScore(25)
    expect(s.score).toBe(35)
  })

  it('loseLife decrements', () => {
    const s = new BreakoutState()
    s.loseLife()
    s.loseLife()
    expect(s.lives).toBe(STARTING_LIVES - 2)
  })

  it('isActive is false until started and false after game over', () => {
    const s = new BreakoutState()
    expect(s.isActive()).toBe(false)
    s.isGameStarted = true
    expect(s.isActive()).toBe(true)
    s.isGameOver = true
    expect(s.isActive()).toBe(false)
  })

  it('reset returns to starting values', () => {
    const s = new BreakoutState()
    s.addScore(50)
    s.loseLife()
    s.isGameStarted = true
    s.isGameOver = true
    s.isJumping = true
    s.elapsedMs = 1234
    s.reset()
    expect(s.score).toBe(0)
    expect(s.lives).toBe(STARTING_LIVES)
    expect(s.isGameStarted).toBe(false)
    expect(s.isGameOver).toBe(false)
    expect(s.isJumping).toBe(false)
    expect(s.elapsedMs).toBe(0)
  })

  it('formattedElapsed prints seconds to one decimal', () => {
    const s = new BreakoutState()
    s.elapsedMs = 12345
    expect(s.formattedElapsed()).toBe('12.3s')
  })
})
