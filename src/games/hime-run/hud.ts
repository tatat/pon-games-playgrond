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
  private readonly overlay: Graphics
  private readonly titleText: Text
  private readonly startText: Text
  private readonly gameOverText: Text

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
    this.coinValue.position.set(78, 90)
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

    this.gameOverText = new Text({
      text: '',
      style: { fill: ACCENT, fontSize: 36, fontFamily: FONT, align: 'center', lineHeight: 48 },
    })
    this.gameOverText.anchor.set(0.5)
    this.gameOverText.position.set(DESIGN_W / 2, DESIGN_H / 2)
    this.gameOverText.zIndex = 101
    this.gameOverText.visible = false
    this.addChild(this.gameOverText)
  }

  setScore(score: number): void {
    this.scoreValue.text = `${score} m`
  }

  setCoinCount(coins: number): void {
    this.coinValue.text = `${coins}`
  }

  showTitle(best: number): void {
    this.startText.text = best > 0 ? `${START_TEXT}\n\nBest ${best} m` : START_TEXT
    this.overlay.visible = true
    this.titleText.visible = true
    this.startText.visible = true
    this.gameOverText.visible = false
  }

  showPlaying(): void {
    this.overlay.visible = false
    this.titleText.visible = false
    this.startText.visible = false
    this.gameOverText.visible = false
  }

  showGameOver(finalScore: number, best: number): void {
    this.gameOverText.text = `GAME OVER\nScore: ${finalScore} m\nBest: ${best} m\n\nPress SPACE / TAP to retry`
    this.overlay.visible = true
    this.titleText.visible = false
    this.startText.visible = false
    this.gameOverText.visible = true
  }
}
