import { Container, Graphics, Text } from 'pixi.js'
import { DESIGN_H, DESIGN_W } from '../../engine/constants'

const WHITE = 0xffffff
/** Shared alert red: the game-over text and a negative score use this. */
const ALERT_RED = 0xff6b6b
const FONT = 'Courier, "Courier New", monospace'
/** Comic/pop display face for the score (Google Fonts), with fallbacks. */
const SCORE_FONT = '"Luckiest Guy", system-ui, sans-serif'

const TITLE_TEXT = 'Press SPACE / TAP to start\n\n← → / A D : Move    SHIFT : Fast'
const AIM_TEXT = 'Aim with ← →     SPACE / TAP : Launch'

const SCORE_FONT_LINK_ID = 'sb-score-font'
const SCORE_FONT_HREF = 'https://fonts.googleapis.com/css2?family=Luckiest+Guy&display=swap'

/** Ensure the score web font is loaded before the HUD builds its text, so the
 * score renders in it rather than a fallback. Idempotent, and resolves even if
 * the network/font is unavailable (the HUD then falls back to system-ui). */
export async function loadScoreFont(): Promise<void> {
  if (typeof document === 'undefined') return
  if (!document.getElementById(SCORE_FONT_LINK_ID)) {
    const link = document.createElement('link')
    link.id = SCORE_FONT_LINK_ID
    link.rel = 'stylesheet'
    link.href = SCORE_FONT_HREF
    document.head.appendChild(link)
  }
  try {
    await document.fonts.load('64px "Luckiest Guy"')
  } catch {
    // Font unavailable — fall back to system-ui.
  }
}

export class HUD extends Container {
  private readonly scoreLabel: Text
  private readonly scoreValue: Text
  private readonly startText: Text
  private readonly gameOverText: Text
  private readonly overlay: Graphics

  constructor() {
    super()
    this.zIndex = 100

    // Score is added before the overlay so it renders behind it — the title /
    // game-over dim sits on top of the big number.
    this.scoreLabel = new Text({
      text: 'SCORE',
      style: {
        fill: 0x9a9ab5,
        fontSize: 16,
        fontFamily: SCORE_FONT,
        letterSpacing: 3,
      },
    })
    this.scoreLabel.position.set(50, 40)
    this.addChild(this.scoreLabel)

    this.scoreValue = new Text({
      text: '0',
      style: {
        fill: WHITE,
        fontSize: 170,
        fontFamily: SCORE_FONT,
      },
    })
    // Number's left edge aligned to the SCORE label.
    this.scoreValue.position.set(50, 40)
    this.addChild(this.scoreValue)

    this.overlay = new Graphics()
      .rect(0, 0, DESIGN_W, DESIGN_H)
      .fill({ color: 0x000000, alpha: 0.55 })
    this.addChild(this.overlay)

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
        fill: ALERT_RED,
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
    this.scoreValue.text = `${score}`
    // Below the start point the score goes negative — flag it in alert red.
    this.scoreValue.tint = score < 0 ? ALERT_RED : WHITE
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
