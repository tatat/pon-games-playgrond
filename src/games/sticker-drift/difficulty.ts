/** Pure-logic helpers for sticker-drift's difficulty ramp. No Pixi / no Rapier;
 * unit-testable in isolation. */

/** Score is accumulated at 0.01 per millisecond of elapsed gameplay (matches
 * the original Phaser implementation). Final displayed score is the floor of
 * this accumulator. */
export function scoreIncrement(deltaMs: number): number {
  return deltaMs * 0.01
}

/** `gameSpeed` starts at 1 and climbs linearly with elapsed time. Used to
 * scale obstacle velocity and spawn rate, and to amplify the homing pull. */
export function gameSpeedIncrement(deltaMs: number): number {
  return deltaMs * 0.00005
}

/** Milliseconds between obstacle spawns. Shrinks as gameSpeed grows. */
export function spawnIntervalMs(baseRateMs: number, gameSpeed: number): number {
  return baseRateMs / gameSpeed
}
