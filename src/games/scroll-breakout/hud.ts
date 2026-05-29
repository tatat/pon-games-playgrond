import { Container, Graphics, Text } from 'pixi.js'
import { DESIGN_H, DESIGN_W } from '../../engine/constants'

const WHITE = 0xffffff
const FONT = 'Courier, "Courier New", monospace'

export class HUD extends Container {
  private readonly scoreText: Text
  private readonly livesText: Text
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

    this.livesText = new Text({
      text: 'Lives: 3',
      style: { fill: WHITE, fontSize: 20, fontFamily: FONT },
    })
    this.livesText.anchor.set(1, 0)
    this.livesText.position.set(DESIGN_W - 20, 16)
    this.livesText.zIndex = 101
    this.addChild(this.livesText)

    this.startText = new Text({
      text: 'Press SPACE or TAP to start\n\n← → / A D : Move    SHIFT : Fast',
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

  setLives(lives: number): void {
    this.livesText.text = `Lives: ${lives}`
  }

  showStart(): void {
    this.overlay.visible = true
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
