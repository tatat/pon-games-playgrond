import { Assets, Container, Graphics, Rectangle, Sprite, Text } from 'pixi.js'
import { DESIGN_H, DESIGN_W } from '../../engine/constants'
import { makeVirtualKeypad } from '../../engine/input/virtual-keypad'
import { Scene, type SceneDelta } from '../../engine/scene'
import { Easings } from '../../engine/util/tween'
import { useRuntimeStore } from '../../store/runtime'
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

const LOGO_W = 360
const LOGO_H = 326
const TITLE_FONT = '"Kaisei Decol", serif'

/** Title screen for breakout-clone. Starfield + 6 floating brick stickers
 * + logo + game-name + "press SPACE / TAP" prompt. Tapping or pressing
 * SPACE fires `onRequestStart` so the game module can swap in
 * `MainScene`. */
export class OpeningScene extends Scene {
  private starfield!: Starfield
  private elapsedMs = 0
  private floatingBricks: { sprite: Sprite; baseY: number; phase: number }[] = []
  private titleLogo!: Sprite
  private subtitle!: Text
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
    // The title logo lives in the same preload manifest so a single
    // network round trip covers both.
    await this.preload(
      [
        {
          alias: 'breakout-logo',
          src: 'games/breakout-clone/images/logo-tssh.svg',
          // The SVG's intrinsic viewBox is 239×217 — we display it at
          // 360×326 on top of a possibly-2x retina canvas, so rasterise
          // at 3x the intrinsic size to keep the edges crisp.
          data: { resolution: 3 },
        },
        ...BRICK_NAMES.map((name) => ({
          alias: `brick-${name}-${FLOATING_BRICK_SIZE}`,
          src: `games/breakout-clone/stickers/${name}-${FLOATING_BRICK_SIZE}@2x.png`,
        })),
      ],
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

    const logoTex = Assets.get('breakout-logo')
    this.titleLogo = new Sprite(logoTex)
    this.titleLogo.anchor.set(0.5)
    this.titleLogo.width = LOGO_W
    this.titleLogo.height = LOGO_H
    this.titleLogo.position.set(231, 205)
    this.titleLogo.alpha = 0
    this.titleLogo.zIndex = 10
    this.addChild(this.titleLogo)
    void this.tween({
      duration: 1500,
      ease: Easings.power2,
      onUpdate: (t) => {
        this.titleLogo.alpha = t
      },
    }).promise

    this.subtitle = new Text({
      text: 'ブロック崩し',
      style: { fill: 0xd8d8d8, fontSize: 38, fontFamily: TITLE_FONT },
    })
    this.subtitle.position.set(50, 596)
    this.subtitle.alpha = 0
    this.subtitle.zIndex = 10
    this.addChild(this.subtitle)
    // Match the original's 500ms-delayed 1500ms fade-in. We run a 2000ms
    // tween where the first 25% stays at alpha 0, then eases up.
    void this.tween({
      duration: 2000,
      ease: Easings.power2,
      onUpdate: (t) => {
        this.subtitle.alpha = Math.max(0, (t - 0.25) / 0.75)
      },
    }).promise

    this.startText = new Text({
      text: 'SPACE OR TAP/CLICK TO ENTER',
      style: { fill: 0xa0a0a0, fontSize: 24, fontFamily: TITLE_FONT },
    })
    this.startText.position.set(50, 650)
    this.startText.alpha = 0
    this.startText.zIndex = 10
    this.addChild(this.startText)
    // Original: 800ms fade-in delayed by 1000ms. Roll the delay + fade
    // into one tween and use the standard pulse below for steady state.
    void this.tween({
      duration: 1800,
      ease: Easings.power2,
      onUpdate: (t) => {
        this.startText.alpha = Math.max(0, (t - 0.556) / 0.444)
      },
    }).promise

    this.bindInput({ start: ['Space', 'Enter'] })

    // Title scene: only Option (= pause) is filled. The shared keypad
    // module places it at the viewport bottom-right corner (Pattern 1).
    const keypad = this.use(
      makeVirtualKeypad(this.input, this.layout, {
        option: { tap: () => useRuntimeStore.getState().toggleGamePaused() },
      }),
    )
    this.layout.uiLayer.addChild(keypad.view)
    this.use(() => {
      this.layout.uiLayer.removeChild(keypad.view)
    })

    // Full-viewport tap to start. zIndex stays below the pause button
    // (which is at zIndex 200) so the corner tap goes to pause first.
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

    // Pulse the start prompt — suspend it once the transition begins so
    // the fade-out tween isn't fighting the per-frame alpha mutation.
    if (!this.transitioned) {
      this.startText.alpha = 0.65 + Math.sin(this.elapsedMs / 600) * 0.35
    }

    if (!this.transitioned && this.input.wasJustPressed('start')) {
      this.transitioned = true
      void this.playStartTransition()
    }

    this.updateTweens(dtMs)
    this.input.endFrame()
  }

  /** Phaser-original transition: fade the logo + texts out (500ms),
   * then fade the whole scene to black (500ms), then hand control to
   * the game module to swap in `MainScene`. */
  private async playStartTransition(): Promise<void> {
    const targets: { obj: { alpha: number }; from: number }[] = [
      { obj: this.titleLogo, from: this.titleLogo.alpha },
      { obj: this.subtitle, from: this.subtitle.alpha },
      { obj: this.startText, from: this.startText.alpha },
    ]
    await this.tween({
      duration: 500,
      ease: Easings.power2,
      onUpdate: (t) => {
        for (const { obj, from } of targets) obj.alpha = from * (1 - t)
      },
    }).promise
    await this.tween({
      duration: 500,
      ease: Easings.power2,
      onUpdate: (t) => {
        this.alpha = 1 - t
      },
    }).promise
    this.options.onRequestStart()
  }
}
