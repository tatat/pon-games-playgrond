/** Pure-logic helper for homing obstacles. Mirrors the original Phaser
 * implementation: if the obstacle is more than `threshold` pixels off the
 * player on the Y axis, gradually steer its vertical velocity toward a
 * target speed scaled by `gameSpeed`. Acceleration rate caps at 2x. */

const THRESHOLD_PX = 10
const RATE = 0.15
const RATE_CAP = 2.0

/** Returns the Y acceleration (px/s²) to apply to a homing obstacle this
 * frame. Returns 0 when the obstacle is within the threshold of the player. */
export function homingAcceleration(args: {
  obstacleY: number
  playerY: number
  currentVy: number
  homingSpeed: number
  gameSpeed: number
}): number {
  const { obstacleY, playerY, currentVy, homingSpeed, gameSpeed } = args
  const diff = playerY - obstacleY
  if (Math.abs(diff) <= THRESHOLD_PX) return 0

  const direction = diff > 0 ? 1 : -1
  const targetVy = direction * homingSpeed * gameSpeed
  const rate = RATE * Math.min(gameSpeed, RATE_CAP)
  return (targetVy - currentVy) * rate
}
