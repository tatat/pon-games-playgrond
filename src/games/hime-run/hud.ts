import { Container, type FederatedPointerEvent, Graphics, Text } from 'pixi.js'
import { DESIGN_H, DESIGN_W } from '../../engine/constants'
import { COIN_COLOR } from './constants'

const WHITE = 0xf5f3ff
const ACCENT = 0xff9ec4
const FONT = 'system-ui, sans-serif'

const START_PROMPT = 'Press SPACE / TAP to start'
const START_HINT = 'Hold to jump higher · tap again to double-jump'

export interface HUDOptions {
  /** Fired by the game-over "stage select" button (and its key, via the scene). */
  onStageSelect(): void
}

/** Score readout plus the title / game-over overlays. The runner's distance is
 * pushed in via `setScore`; the scene toggles the three screen states. */
export class HUD extends Container {
  private readonly scoreValue: Text
  private readonly coinValue: Text
  /** Coin readout scale; punched to >1 on pickup, eased back in update(). */
  private coinScale = 1
  private readonly overlay: Graphics
  /** Pre-run "ready" beat: a STAGE eyebrow, the stage name as hero, an optional
   * best line, then the start prompt + controls hint. Laid out (centred) per
   * `showTitle` so it balances with or without the best line. */
  private readonly titleGroup: Container
  private readonly stageLabel: Text
  private readonly stageName: Text
  private readonly bestLine: Text
  private readonly startPrompt: Text
  private readonly startHint: Text
  /** Game-over screen: a header, the hero score, a one-line breakdown, a footer. */
  private readonly gameOverGroup: Container
  private readonly goScore: Text
  private readonly goBreakdown: Text

  constructor(options: HUDOptions) {
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

    // Ready beat — a clear hierarchy (mirrors the game-over screen) instead of
    // one stacked text block: the stage is the hero, not a re-run of the game
    // title (which already headlines the select screen). All members are created
    // here; `showTitle` fills text and lays them out centred.
    this.titleGroup = new Container()
    this.titleGroup.zIndex = 101
    this.titleGroup.visible = false
    this.addChild(this.titleGroup)

    this.stageLabel = new Text({
      text: 'STAGE',
      style: { fill: ACCENT, fontSize: 28, fontWeight: '700', fontFamily: FONT, letterSpacing: 6 },
    })

    this.stageName = new Text({
      text: '',
      style: { fill: WHITE, fontSize: 76, fontWeight: '800', fontFamily: FONT },
    })

    this.bestLine = new Text({
      text: '',
      style: { fill: WHITE, fontSize: 26, fontFamily: FONT },
    })
    this.bestLine.alpha = 0.8

    this.startPrompt = new Text({
      text: START_PROMPT,
      style: { fill: WHITE, fontSize: 30, fontWeight: '700', fontFamily: FONT },
    })

    this.startHint = new Text({
      text: START_HINT,
      style: { fill: WHITE, fontSize: 22, fontFamily: FONT },
    })
    this.startHint.alpha = 0.7

    for (const t of [
      this.stageLabel,
      this.stageName,
      this.bestLine,
      this.startPrompt,
      this.startHint,
    ]) {
      t.anchor.set(0.5)
      this.titleGroup.addChild(t)
    }

    // Game-over screen — a clear hierarchy rather than one stacked block: a big
    // header up top, the score as the hero in the middle, supporting numbers on
    // one quiet line, and the retry prompt as a footer.
    const cx = DESIGN_W / 2
    this.gameOverGroup = new Container()
    this.gameOverGroup.zIndex = 101
    this.gameOverGroup.visible = false
    this.addChild(this.gameOverGroup)

    // Vertically centred stack: header → label → hero score → breakdown →
    // retry. The select button hangs a fixed gap below the retry prompt
    // (measured to the button's frame, see below), so it isn't part of this
    // centring.
    const header = new Text({
      text: 'GAME OVER',
      style: { fill: ACCENT, fontSize: 104, fontWeight: '800', fontFamily: FONT },
    })
    header.anchor.set(0.5)
    header.position.set(cx, DESIGN_H * 0.24)

    const scoreLabel = new Text({
      text: 'SCORE',
      style: { fill: WHITE, fontSize: 28, fontWeight: '700', fontFamily: FONT, letterSpacing: 6 },
    })
    scoreLabel.anchor.set(0.5)
    scoreLabel.position.set(cx, DESIGN_H * 0.36)

    // The hero: the final score, by far the largest number on screen.
    this.goScore = new Text({
      text: '0',
      style: { fill: WHITE, fontSize: 128, fontWeight: '800', fontFamily: FONT },
    })
    this.goScore.anchor.set(0.5)
    this.goScore.position.set(cx, DESIGN_H * 0.48)

    // Supporting detail on one quiet line, dimmed so it sits under the score.
    this.goBreakdown = new Text({
      text: '',
      style: { fill: WHITE, fontSize: 26, fontFamily: FONT, align: 'center' },
    })
    this.goBreakdown.alpha = 0.7
    this.goBreakdown.anchor.set(0.5)
    this.goBreakdown.position.set(cx, DESIGN_H * 0.63)

    const retry = new Text({
      text: 'Press SPACE / TAP to retry',
      style: { fill: WHITE, fontSize: 26, fontFamily: FONT },
    })
    retry.anchor.set(0.5)
    retry.position.set(cx, DESIGN_H * 0.72)

    // A distinct control back to the stage-select screen — separate from the
    // tap-anywhere retry, so leaving a run is a deliberate choice. Gap below the
    // retry prompt (its bottom → the button's top frame edge) is set equal to
    // the gap *above* the prompt (breakdown bottom → retry top), so the retry
    // line sits with matching breathing room on both sides. The breakdown is the
    // same font size as retry, so its half-height equals retry's — that lets us
    // derive the above-gap without measuring the breakdown (it is empty here).
    const retryGap = retry.y - this.goBreakdown.y - retry.height
    const select = this.makeSelectButton(options.onStageSelect)
    select.position.set(cx, retry.y + retry.height / 2 + retryGap + select.height / 2)

    this.gameOverGroup.addChild(header, scoreLabel, this.goScore, this.goBreakdown, retry, select)
  }

  /** A small pill button (centred on its own position) that returns to stage
   * select. Sits inside the game-over group, so it is only interactive while
   * that screen is visible. Consumes its own tap so the full-screen tap-to-retry
   * behind it doesn't also fire. */
  private makeSelectButton(onTap: () => void): Container {
    const PAD_X = 28
    const H = 52
    const RADIUS = 8
    const label = new Text({
      text: 'STAGE SELECT  (M)',
      style: { fill: WHITE, fontSize: 24, fontWeight: '700', fontFamily: FONT },
    })
    label.anchor.set(0.5)

    const w = label.width + PAD_X * 2
    const bg = new Graphics()
      .roundRect(-w / 2, -H / 2, w, H, RADIUS)
      .fill({ color: 0x000000, alpha: 0.35 })
      .stroke({ color: ACCENT, width: 2, alpha: 0.9 })

    const btn = new Container()
    btn.addChild(bg, label)
    btn.eventMode = 'static'
    btn.cursor = 'pointer'
    btn.on('pointertap', (e: FederatedPointerEvent) => {
      e.stopPropagation()
      onTap()
    })
    return btn
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

  showTitle(stageName: string, best: number): void {
    this.stageName.text = stageName
    const showBest = best > 0
    this.bestLine.text = showBest ? `Best ${best}` : ''
    this.bestLine.visible = showBest

    // Centre the visible lines as one block (gap = space *before* each line), so
    // the beat balances whether or not the best line is present. The larger gap
    // before the prompt separates "which stage" from "how to play".
    const lines: { node: Text; gap: number }[] = [
      { node: this.stageLabel, gap: 0 },
      { node: this.stageName, gap: 8 },
    ]
    if (showBest) lines.push({ node: this.bestLine, gap: 16 })
    lines.push({ node: this.startPrompt, gap: 52 }, { node: this.startHint, gap: 16 })

    const total = lines.reduce((h, l) => h + l.gap + l.node.height, 0)
    let y = DESIGN_H / 2 - total / 2
    for (const l of lines) {
      y += l.gap
      l.node.position.set(DESIGN_W / 2, y + l.node.height / 2)
      y += l.node.height
    }

    this.overlay.visible = true
    this.titleGroup.visible = true
    this.gameOverGroup.visible = false
  }

  showPlaying(): void {
    this.overlay.visible = false
    this.titleGroup.visible = false
    this.gameOverGroup.visible = false
  }

  showGameOver(distance: number, coins: number, score: number, best: number): void {
    const coinBonus = score - distance
    this.goScore.text = `${score}`
    this.goBreakdown.text = `Distance ${distance} m      Coins ${coins} (+${coinBonus})      Best ${best}`
    this.overlay.visible = true
    this.titleGroup.visible = false
    this.gameOverGroup.visible = true
  }
}
