import RAPIER from '@dimforge/rapier2d-compat'
import { DESIGN_H, DESIGN_W } from '../../engine/constants'
import { WALL_THICKNESS } from './constants'

/** Invisible bounce surfaces for the ball: left edge, right edge, and top.
 * Bottom is intentionally open — the ball falls past it to trigger "ball
 * died". Returns nothing visible; the colliders alone do the work. */
export function createWalls(world: RAPIER.World): void {
  const t = WALL_THICKNESS

  // Each wall is a thick fixed body just outside the playfield so a fast
  // ball can't tunnel through in one step.
  const specs: Array<{ x: number; y: number; w: number; h: number }> = [
    // Left
    { x: -t / 2, y: DESIGN_H / 2, w: t, h: DESIGN_H * 2 },
    // Right
    { x: DESIGN_W + t / 2, y: DESIGN_H / 2, w: t, h: DESIGN_H * 2 },
    // Top
    { x: DESIGN_W / 2, y: -t / 2, w: DESIGN_W * 2, h: t },
  ]

  for (const s of specs) {
    const rb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(s.x, s.y))
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(s.w / 2, s.h / 2)
        .setRestitution(1)
        .setFriction(0),
      rb,
    )
  }
}
