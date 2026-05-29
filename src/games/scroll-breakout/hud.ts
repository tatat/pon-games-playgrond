import { Container, Graphics, Text } from 'pixi.js'
import { DESIGN_H, DESIGN_W } from '../../engine/constants'

const WHITE = 0xffffff
const FONT = 'Courier, "Courier New", monospace'

const TITLE_TEXT = 'Press SPACE / TAP to start\n\n← → / A D : Move    SHIFT : Fast'
const AIM_TEXT = 'Aim with ← →     SPACE / TAP : Launch'

export class HUD extends Container {
  private readonly scoreText: Text
  private readonly startText: Text
  private readonly gameOverText: Text
  private readonly overlay: Graphics

  constructor() {
    super()
    this.zIndex = 100

    this.overlay = new Graphics()
      .rect(0, 0, DESIGN_W, DESIGN_H)
      .fill({ color: 0x000000, alpha: 0.55 })
    this.addChild(this.overlay)

    this.scoreText = new Text({
      text: 'Score: 0',
      style: { fill: WHITE, fontSize: 20, fontFamily: FONT },
    })
    this.scoreText.position.set(20, 16)
    this.scoreText.zIndex = 101
    this.addChild(this.scoreText)

    this.startText = new Text({
      text: TITLE_TEXT,
      style: {
        fill: WHITE,
        fontSize: 24,
        fontFamily: FONT,
        align: 'center',
        lineHeight: 36,
      },
    })
    this.startText.anchor.set(0.5)
    this.startText.position.set(DESIGN_W / 2, DESIGN_H / 2)
    this.startText.zIndex = 101
    this.addChild(this.startText)

    this.gameOverText = new Text({
      text: '',
      style: {
        fill: 0xff6b6b,
        fontSize: 32,
        fontFamily: FONT,
        align: 'center',
        lineHeight: 40,
      },
    })
    this.gameOverText.anchor.set(0.5)
    this.gameOverText.position.set(DESIGN_W / 2, DESIGN_H / 2)
    this.gameOverText.zIndex = 101
    this.gameOverText.visible = false
    this.addChild(this.gameOverText)
  }

  setScore(score: number): void {
    this.scoreText.text = `Score: ${score}`
  }

  /** Opening screen: dimmed overlay + title/instructions. */
  showStart(): void {
    this.startText.text = TITLE_TEXT
    this.overlay.visible = true
    this.startText.visible = true
    this.gameOverText.visible = false
  }

  /** Aim screen: clear view of the course with a small launch hint. */
  showAiming(): void {
    this.startText.text = AIM_TEXT
    this.overlay.visible = false
    this.startText.visible = true
    this.gameOverText.visible = false
  }

  showPlaying(): void {
    this.overlay.visible = false
    this.startText.visible = false
    this.gameOverText.visible = false
  }

  showGameOver(finalScore: number): void {
    this.gameOverText.text = `GAME OVER\nScore: ${finalScore}\nPress SPACE or TAP to restart`
    this.overlay.visible = true
    this.startText.visible = false
    this.gameOverText.visible = true
  }
}
