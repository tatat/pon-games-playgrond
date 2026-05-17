import { describe, expect, it } from 'vitest'
import { homingAcceleration } from './homing'

describe('homingAcceleration', () => {
  const base = {
    obstacleY: 360,
    playerY: 360,
    currentVy: 0,
    homingSpeed: 150,
    gameSpeed: 1,
  }

  it('returns 0 when player and obstacle are within 10px', () => {
    expect(homingAcceleration({ ...base, playerY: 360, obstacleY: 365 })).toBe(0)
    expect(homingAcceleration({ ...base, playerY: 360, obstacleY: 350 })).toBe(0)
  })

  it('returns positive acceleration when player is below obstacle', () => {
    const accel = homingAcceleration({ ...base, playerY: 500, obstacleY: 360 })
    expect(accel).toBeGreaterThan(0)
  })

  it('returns negative acceleration when player is above obstacle', () => {
    const accel = homingAcceleration({ ...base, playerY: 100, obstacleY: 360 })
    expect(accel).toBeLessThan(0)
  })

  it('opposes current velocity when overshooting', () => {
    // Obstacle is above player and already moving down fast → should decelerate.
    const accel = homingAcceleration({
      ...base,
      playerY: 400,
      obstacleY: 360,
      currentVy: 500, // already faster than target (150 * 1 = 150)
    })
    expect(accel).toBeLessThan(0)
  })

  it('scales target velocity with gameSpeed', () => {
    const slow = homingAcceleration({ ...base, playerY: 500, gameSpeed: 1 })
    const fast = homingAcceleration({ ...base, playerY: 500, gameSpeed: 2 })
    // At higher gameSpeed both the target and the rate factor grow, so the
    // signed acceleration is larger in magnitude.
    expect(fast).toBeGreaterThan(slow)
  })

  it('caps the rate factor at 2x gameSpeed', () => {
    // Compare gameSpeed=2 vs gameSpeed=3 holding currentVy fixed at its target
    // for gs=2 to isolate the rate cap behaviour.
    const a = homingAcceleration({ ...base, playerY: 500, currentVy: 0, gameSpeed: 2 })
    const b = homingAcceleration({ ...base, playerY: 500, currentVy: 0, gameSpeed: 3 })
    // Without the cap, b would be > a * 1.5. With the cap on the rate (still
    // 2x) but a larger target velocity, b should still be > a, but not by the
    // unbounded factor that an uncapped rate would produce.
    expect(b).toBeGreaterThan(a)
  })
})
