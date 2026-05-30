import type { PatternDemo } from '../demo'
import { actionDemos } from './system-action'
import { arcadeDemos } from './system-arcade'
import { puzzleDemos } from './system-puzzle'
import { rpgDemos } from './system-rpg'
import { strategyDemos } from './system-strategy'

/** The `system` archetype demos, split across `system-*.ts` by genre.
 * Order here is the in-menu order (breakout is the catalog's default demo). */
export const systemDemos: PatternDemo[] = [
  ...actionDemos,
  ...arcadeDemos,
  ...puzzleDemos,
  ...strategyDemos,
  ...rpgDemos,
]
