import { Assets, Container, Graphics, Rectangle, Sprite, Text } from 'pixi.js'
import { DESIGN_H, DESIGN_W } from '../../engine/constants'
import { Scene, type SceneDelta } from '../../engine/scene'
import { BRICK_NAMES } from './constants'
import { Starfield } from './starfield'

const BACKGROUND_COLOR = 0x0a0a14

/** Fixed positions for the six decorative floating brick stickers. Same
 * coordinates as the Phaser original. */
const BRICK_POSITIONS = [
  { x: 836, y: 198 },
  { x: 849, y: 490 },
  { x: 568, y: 210 },
  { x: 588, y: 500 },
  { x: 1089, y: 209 },
  { x: 1114, y: 491 },
] as const

const FLOATING_BRICK_SIZE = 256

export interface OpeningSceneOptions {
  /** Called when the user presses SPACE / taps. The owner (game module)
   * is expected to swap us for the gameplay scene. */
  onRequestStart(): void
}

/** Title screen for breakout-clone. Starfield + 6 floating brick stickers
 * + game-name + "press SPACE / TAP" prompt. Tapping or pressing SPACE
 * fires `onRequestStart` so the game module can swap in `MainScene`. */
export class OpeningScene extends Scene {
  private starfield!: Starfield
  private elapsedMs = 0
  private floatingBricks: { sprite: Sprite; baseY: number; phase: number }[] = []
  private startText!: Text
  private transitioned = false

  constructor(private readonly options: OpeningSceneOptions) {
    super()
    this.sortableChildren = true
  }

  async onEnter(signal: AbortSignal): Promise<void> {
    const bg = new Graphics().rect(0, 0, DESIGN_W, DESIGN_H).fill(BACKGROUND_COLOR)
    bg.zIndex = -100
    this.addChild(bg)

    this.starfield = new Starfield(this.rng)
    this.starfield.zIndex = -90
    this.addChild(this.starfield)

    // Reuse the 256-size brick stickers for decoration. Same aliases as
    // MainScene, so the resolver dedupes when MainScene preloads later.
    await this.preload(
      BRICK_NAMES.map((name) => ({
        alias: `brick-${name}-${FLOATING_BRICK_SIZE}`,
        src: `games/breakout-clone/stickers/${name}-${FLOATING_BRICK_SIZE}@2x.png`,
      })),
      signal,
    )

    // Place a decorative brick at each fixed position.
    BRICK_POSITIONS.forEach((pos, i) => {
      const name = BRICK_NAMES[i % BRICK_NAMES.length]
      const tex = Assets.get(`brick-${name}-${FLOATING_BRICK_SIZE}`)
      if (!tex) return
      const aspect = tex.width / tex.height
      let w: number, h: number
      if (aspect >= 1) {
        w = FLOATING_BRICK_SIZE
        h = FLOATING_BRICK_SIZE / aspect
      } else {
        w = FLOATING_BRICK_SIZE * aspect
        h = FLOATING_BRICK_SIZE
      }
      const sprite = new Sprite(tex)
      sprite.anchor.set(0.5)
      sprite.width = w
      sprite.height = h
      sprite.position.set(pos.x, pos.y)
      sprite.alpha = 0.4
      sprite.zIndex = 1
      this.addChild(sprite)
      this.floatingBricks.push({ sprite, baseY: pos.y, phase: i * 0.7 })
    })

    const title = new Text({
      text: 'BLOCK BREAK',
      style: {
        fill: 0xffffff,
        fontSize: 72,
        fontFamily: 'Courier, monospace',
        letterSpacing: 8,
      },
    })
    title.anchor.set(0, 0.5)
    title.position.set(50, 200)
    title.zIndex = 10
    this.addChild(title)

    const subtitle = new Text({
      text: 'ブロック崩し',
      style: { fill: 0xd8d8d8, fontSize: 32, fontFamily: 'serif' },
    })
    subtitle.position.set(50, 250)
    subtitle.zIndex = 10
    this.addChild(subtitle)

    this.startText = new Text({
      text: 'SPACE OR TAP/CLICK TO ENTER',
      style: { fill: 0xa0a0a0, fontSize: 22, fontFamily: 'Courier, monospace' },
    })
    this.startText.position.set(50, 580)
    this.startText.zIndex = 10
    this.addChild(this.startText)

    this.bindInput({ start: ['Space', 'Enter'] })

    // Full-viewport tap to start.
    const tap = new Container()
    tap.eventMode = 'static'
    tap.hitArea = new Rectangle(0, 0, DESIGN_W, DESIGN_H)
    tap.zIndex = 0
    this.addChild(tap)
    const onTap = (): void => {
      this.input.press('start')
    }
    const onRelease = (): void => {
      this.input.release('start')
    }
    tap.on('pointerdown', onTap)
    tap.on('pointerup', onRelease)
    tap.on('pointerupoutside', onRelease)
    tap.on('pointercancel', onRelease)
    this.use(() => {
      tap.off('pointerdown', onTap)
      tap.off('pointerup', onRelease)
      tap.off('pointerupoutside', onRelease)
      tap.off('pointercancel', onRelease)
    })
  }

  override onUpdate(dt: SceneDelta): void {
    const { dtMs, dtSec } = dt
    this.elapsedMs += dtMs
    this.starfield.update(dtSec)

    // Floating bricks: sine-wave y offset + slow alpha pulse.
    for (const fb of this.floatingBricks) {
      const t = this.elapsedMs / 1000
      fb.sprite.y = fb.baseY + Math.sin(t + fb.phase) * 8
      fb.sprite.alpha = 0.4 + Math.sin(t * 0.7 + fb.phase) * 0.2
    }

    // Pulse the start prompt.
    this.startText.alpha = 0.65 + Math.sin(this.elapsedMs / 600) * 0.35

    if (!this.transitioned && this.input.wasJustPressed('start')) {
      this.transitioned = true
      this.options.onRequestStart()
    }

    this.input.endFrame()
  }
}
