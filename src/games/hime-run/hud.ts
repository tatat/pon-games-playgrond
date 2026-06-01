import { Container, Graphics, Text } from 'pixi.js'
import { DESIGN_H, DESIGN_W } from '../../engine/constants'
import { COIN_COLOR } from './constants'

const WHITE = 0xf5f3ff
const ACCENT = 0xff9ec4
const FONT = 'system-ui, sans-serif'

const TITLE_TEXT = 'Hime Run'
const START_TEXT = 'Press SPACE / TAP to start\n\nHold to jump higher · tap again to double-jump'

/** Score readout plus the title / game-over overlays. The runner's distance is
 * pushed in via `setScore`; the scene toggles the three screen states. */
export class HUD extends Container {
  private readonly scoreValue: Text
  private readonly coinValue: Text
  /** Coin readout scale; punched to >1 on pickup, eased back in update(). */
  private coinScale = 1
  private readonly overlay: Graphics
  private readonly titleText: Text
  private readonly startText: Text
  /** Game-over screen: a header, the hero score, a one-line breakdown, a footer. */
  private readonly gameOverGroup: Container
  private readonly goScore: Text
  private readonly goBreakdown: Text

  constructor() {
    super()
    this.zIndex = 100

    this.scoreValue = new Text({
      text: '0 m',
      style: { fill: WHITE, fontSize: 44, fontWeight: '700', fontFamily: FONT },
    })
    this.scoreValue.position.set(40, 32)
    this.addChild(this.scoreValue)

    // Coin tally below the score: a small disc icon + count, in the coin colour.
    const coinIcon = new Graphics().circle(54, 108, 13).fill(COIN_COLOR)
    this.addChild(coinIcon)
    this.coinValue = new Text({
      text: '0',
      style: { fill: COIN_COLOR, fontSize: 34, fontWeight: '700', fontFamily: FONT },
    })
    // Anchored at left-centre (aligned with the icon) so the pickup punch scales
    // around its centre rather than skewing from the top-left.
    this.coinValue.anchor.set(0, 0.5)
    this.coinValue.position.set(78, 108)
    this.addChild(this.coinValue)

    this.overlay = new Graphics()
      .rect(0, 0, DESIGN_W, DESIGN_H)
      .fill({ color: 0x000000, alpha: 0.5 })
    this.overlay.zIndex = 100
    this.addChild(this.overlay)

    this.titleText = new Text({
      text: TITLE_TEXT,
      style: { fill: WHITE, fontSize: 88, fontWeight: '800', fontFamily: FONT },
    })
    this.titleText.anchor.set(0.5)
    this.titleText.position.set(DESIGN_W / 2, DESIGN_H * 0.4)
    this.titleText.zIndex = 101
    this.addChild(this.titleText)

    this.startText = new Text({
      text: START_TEXT,
      style: { fill: WHITE, fontSize: 26, fontFamily: FONT, align: 'center', lineHeight: 36 },
    })
    this.startText.anchor.set(0.5)
    this.startText.position.set(DESIGN_W / 2, DESIGN_H * 0.62)
    this.startText.zIndex = 101
    this.addChild(this.startText)

    // Game-over screen — a clear hierarchy rather than one stacked block: a big
    // header up top, the score as the hero in the middle, supporting numbers on
    // one quiet line, and the retry prompt as a footer.
    const cx = DESIGN_W / 2
    this.gameOverGroup = new Container()
    this.gameOverGroup.zIndex = 101
    this.gameOverGroup.visible = false
    this.addChild(this.gameOverGroup)

    const header = new Text({
      text: 'GAME OVER',
      style: { fill: ACCENT, fontSize: 104, fontWeight: '800', fontFamily: FONT },
    })
    header.anchor.set(0.5)
    header.position.set(cx, DESIGN_H * 0.31)

    const scoreLabel = new Text({
      text: 'SCORE',
      style: { fill: WHITE, fontSize: 28, fontWeight: '700', fontFamily: FONT, letterSpacing: 6 },
    })
    scoreLabel.anchor.set(0.5)
    scoreLabel.position.set(cx, DESIGN_H * 0.45)

    // The hero: the final score, by far the largest number on screen.
    this.goScore = new Text({
      text: '0',
      style: { fill: WHITE, fontSize: 128, fontWeight: '800', fontFamily: FONT },
    })
    this.goScore.anchor.set(0.5)
    this.goScore.position.set(cx, DESIGN_H * 0.56)

    // Supporting detail on one quiet line, dimmed so it sits under the score.
    this.goBreakdown = new Text({
      text: '',
      style: { fill: WHITE, fontSize: 26, fontFamily: FONT, align: 'center' },
    })
    this.goBreakdown.alpha = 0.7
    this.goBreakdown.anchor.set(0.5)
    this.goBreakdown.position.set(cx, DESIGN_H * 0.69)

    const retry = new Text({
      text: 'Press SPACE / TAP to retry',
      style: { fill: WHITE, fontSize: 26, fontFamily: FONT },
    })
    retry.anchor.set(0.5)
    retry.position.set(cx, DESIGN_H * 0.86)

    this.gameOverGroup.addChild(header, scoreLabel, this.goScore, this.goBreakdown, retry)
  }

  setScore(score: number): void {
    this.scoreValue.text = `${score} m`
  }

  setCoinCount(coins: number): void {
    this.coinValue.text = `${coins}`
    this.coinScale = 1.4 // punch; eased back to 1 in update()
  }

  /** Ease the coin readout's pickup punch back to its rest size. */
  update(dtSec: number): void {
    if (this.coinScale !== 1) {
      this.coinScale += (1 - this.coinScale) * Math.min(1, 16 * dtSec)
      if (Math.abs(this.coinScale - 1) < 0.01) this.coinScale = 1
      this.coinValue.scale.set(this.coinScale)
    }
  }

  showTitle(best: number): void {
    this.startText.text = best > 0 ? `${START_TEXT}\n\nBest ${best}` : START_TEXT
    this.overlay.visible = true
    this.titleText.visible = true
    this.startText.visible = true
    this.gameOverGroup.visible = false
  }

  showPlaying(): void {
    this.overlay.visible = false
    this.titleText.visible = false
    this.startText.visible = false
    this.gameOverGroup.visible = false
  }

  showGameOver(distance: number, coins: number, score: number, best: number): void {
    const coinBonus = score - distance
    this.goScore.text = `${score}`
    this.goBreakdown.text = `Distance ${distance} m      Coins ${coins} (+${coinBonus})      Best ${best}`
    this.overlay.visible = true
    this.titleText.visible = false
    this.startText.visible = false
    this.gameOverGroup.visible = true
  }
}
