import { Container, Graphics, Text } from 'pixi.js'
import { DESIGN_H, DESIGN_W } from '../../engine/constants'

const WHITE = 0xffffff
const RED = 0xff6b6b

/** Score + start prompt + game-over text + dim overlay. The scene tells it
 * which phase to display; the score updates every frame from the scene. */
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
      .fill({ color: 0x000000, alpha: 0.6 })
    this.addChild(this.overlay)

    this.scoreText = new Text({
      text: 'Score: 0',
      style: { fill: WHITE, fontSize: 16, fontFamily: 'Courier, "Courier New", monospace' },
    })
    this.scoreText.position.set(20, 50)
    this.scoreText.zIndex = 101
    this.addChild(this.scoreText)

    this.startText = new Text({
      text: 'Press SPACE or TAP to start\n\n--- CONTROLS ---\nSPACE / TAP : Float (hold to rise)\nRelease : Fall (gravity)',
      style: {
        fill: WHITE,
        fontSize: 24,
        fontFamily: 'Courier, "Courier New", monospace',
        align: 'center',
        lineHeight: 32,
      },
    })
    this.startText.anchor.set(0.5)
    this.startText.position.set(DESIGN_W / 2, DESIGN_H / 2)
    this.startText.zIndex = 101
    this.addChild(this.startText)

    this.gameOverText = new Text({
      text: 'GAME OVER\nPress SPACE or TAP to restart',
      style: {
        fill: RED,
        fontSize: 32,
        fontFamily: 'Courier, "Courier New", monospace',
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
    this.scoreText.text = `Score: ${Math.floor(score)}`
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
    this.gameOverText.text = `GAME OVER\nFinal Score: ${Math.floor(finalScore)}\nPress SPACE or TAP to restart`
    this.overlay.visible = true
    this.startText.visible = false
    this.gameOverText.visible = true
  }
}
