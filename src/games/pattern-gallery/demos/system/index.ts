import type { PatternDemo } from '../../demo'
import { actionDemos } from './action'
import { arcadeDemos } from './arcade'
import { puzzleDemos } from './puzzle'
import { rpgDemos } from './rpg'
import { strategyDemos } from './strategy'

/** The `system` archetype demos, split across `system-*.ts` by genre.
 * Order here is the in-menu order (breakout is the catalog's default demo). */
export const systemDemos: PatternDemo[] = [
  ...actionDemos,
  ...arcadeDemos,
  ...puzzleDemos,
  ...strategyDemos,
  ...rpgDemos,
]
