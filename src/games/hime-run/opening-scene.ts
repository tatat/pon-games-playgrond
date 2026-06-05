import { Container, type FederatedPointerEvent, Graphics, Text } from 'pixi.js'
import { DESIGN_H, DESIGN_W } from '../../engine/constants'
import { makeVirtualKeypad } from '../../engine/input/virtual-keypad'
import { Scene, type SceneDelta } from '../../engine/scene'
import { useRuntimeStore } from '../../store/runtime'
import { Background } from './background'
import { DEFAULT_RANDOM_SEED } from './random-source'
import { type CourseStageDef, loadStageManifest, type StageDef } from './stage'
import { RANDOM_BEST_KEY, useHimeRunStore } from './store'

const WHITE = 0xf5f3ff
const ACCENT = 0xff9ec4
const FONT = 'system-ui, sans-serif'

// Stage-list geometry. Rows are a centred column; text keeps `ROW_PAD` clearance
// from the row's left edge (don't let the label sit flush against the border).
// The column is a simple fixed layout sized for a handful of stages; scrolling /
// pagination is deferred until the catalog actually grows past a screenful.
const ROW_W = 560
const ROW_H = 64
const ROW_GAP = 14
const ROW_PAD = 24
const ROW_RADIUS = 10
const LIST_CENTER_Y = DESIGN_H * 0.58

// Random-seed stepper: a fixed-length odometer of tap-to-increment digits, so the
// seed is set with the same pointer the rest of the menu uses (no keyboard text
// entry, works the same on desktop and mobile). The digit count caps the seed
// space — 6 digits = 1,000,000 reproducible seeds, plenty to replay / share.
const SEED_DIGITS = 6
const SEED_MOD = 10 ** SEED_DIGITS
const DIGIT_W = 34
const DIGIT_H = 42
const DIGIT_GAP = 6
const DIGIT_RADIUS = 6
/** Gap between the digit cluster and the reroll pill on its right. */
const STEPPER_GAP = 16

/** A slow parallax drift so the backdrop isn't dead on the menu (px/s of faux
 * forward travel fed to the same scroll the run uses). */
const BACKDROP_DRIFT = 40

export interface OpeningSceneOptions {
  /** Fired when the player commits to a stage. The owner swaps in `MainScene`. */
  onSelect(stage: StageDef): void
}

interface Row {
  view: Container
  bg: Graphics
  label: Text
}

/** Title + stage-select for hime-run. Lists the manifest courses, then a seeded
 * random entry whose seed is set with a tap-to-increment digit stepper (plus a
 * reroll). ↑/↓ move the highlight, SPACE/Enter or a tap commits, R rerolls. Reuses
 * the ruined-dusk parallax backdrop. */
export class OpeningScene extends Scene {
  private background!: Background
  private courses: CourseStageDef[] = []
  private rows: Row[] = []
  private selected = 0
  private activated = false
  private elapsed = 0
  private hint!: Text
  /** The random seed as independent decimal digits (most significant first). Each
   * digit taps up 0→9→0 with no carry, like a combination lock. */
  private digits: number[] = []
  /** The per-digit readouts, updated on tap / reroll. */
  private digitTexts: Text[] = []

  constructor(private readonly options: OpeningSceneOptions) {
    super()
    this.sortableChildren = true
  }

  /** Row index of the synthesised random entry (always last). */
  private get randomIndex(): number {
    return this.courses.length
  }

  /** The seed the digit stepper currently spells. */
  private seedValue(): number {
    return this.digits.reduce((acc, d) => acc * 10 + d, 0)
  }

  /** Set the stepper digits from a seed (clamped into the digit space). */
  private setSeed(seed: number): void {
    const s = ((Math.trunc(seed) % SEED_MOD) + SEED_MOD) % SEED_MOD
    this.digits = Array.from(
      { length: SEED_DIGITS },
      (_, i) => Math.floor(s / 10 ** (SEED_DIGITS - 1 - i)) % 10,
    )
  }

  async onEnter(signal: AbortSignal): Promise<void> {
    this.background = new Background()
    this.background.zIndex = -100
    this.addChild(this.background)

    const title = new Text({
      text: 'Hime Run',
      style: { fill: WHITE, fontSize: 88, fontWeight: '800', fontFamily: FONT },
    })
    title.anchor.set(0.5)
    title.position.set(DESIGN_W / 2, DESIGN_H * 0.22)
    title.zIndex = 10
    this.addChild(title)

    const subtitle = new Text({
      text: 'SELECT A STAGE',
      style: { fill: ACCENT, fontSize: 26, fontWeight: '700', fontFamily: FONT, letterSpacing: 6 },
    })
    subtitle.anchor.set(0.5)
    subtitle.position.set(DESIGN_W / 2, DESIGN_H * 0.36)
    subtitle.zIndex = 10
    this.addChild(subtitle)

    this.hint = new Text({
      text: '↑ ↓ choose · SPACE / Enter or tap to play · tap digits or R to set the random seed',
      style: { fill: WHITE, fontSize: 22, fontFamily: FONT, align: 'center' },
    })
    this.hint.anchor.set(0.5)
    this.hint.position.set(DESIGN_W / 2, DESIGN_H * 0.88)
    this.hint.zIndex = 10
    this.addChild(this.hint)

    // The random entry starts on the persisted last seed, else a fixed default —
    // so a first-ever visit is reproducible.
    this.setSeed(useHimeRunStore.getState().lastRandomSeed ?? DEFAULT_RANDOM_SEED)

    // Load the course catalog and build the list (courses, then the random row).
    const manifest = await loadStageManifest(signal)
    signal.throwIfAborted()
    this.courses = manifest.stages
    this.buildRows()

    this.bindInput({
      up: ['ArrowUp', 'KeyW'],
      down: ['ArrowDown', 'KeyS'],
      select: ['Space', 'Enter'],
      reroll: ['KeyR'],
    })

    // Title scene: only Option (= pause). Shared keypad places it bottom-right.
    const keypad = this.use(
      makeVirtualKeypad(this.input, this.layout, {
        option: { tap: () => useRuntimeStore.getState().toggleGamePaused() },
      }),
    )
    this.layout.uiLayer.addChild(keypad.view)
    this.use(() => {
      this.layout.uiLayer.removeChild(keypad.view)
    })
  }

  private buildRows(): void {
    const n = this.courses.length + 1 // + the random entry
    const totalH = n * ROW_H + (n - 1) * ROW_GAP
    const startY = LIST_CENTER_Y - totalH / 2
    const rowX = (DESIGN_W - ROW_W) / 2
    const bests = useHimeRunStore.getState().bests

    const placeRow = (i: number): { view: Container; bg: Graphics } => {
      const view = new Container()
      view.position.set(rowX, startY + i * (ROW_H + ROW_GAP))
      view.zIndex = 5
      view.eventMode = 'static'
      view.cursor = 'pointer'
      const bg = new Graphics()
      view.addChild(bg)
      view.on('pointerover', () => this.setSelected(i))
      view.on('pointertap', () => {
        this.setSelected(i)
        this.activate()
      })
      this.addChild(view)
      return { view, bg }
    }

    const makeLabel = (text: string): Text => {
      const label = new Text({
        text,
        style: { fill: WHITE, fontSize: 30, fontWeight: '700', fontFamily: FONT },
      })
      label.anchor.set(0, 0.5)
      label.position.set(ROW_PAD, ROW_H / 2)
      return label
    }

    // Course rows: name (left) + persisted best (right), best hidden when 0.
    this.courses.forEach((stage, i) => {
      const { view, bg } = placeRow(i)
      const label = makeLabel(stage.name)
      view.addChild(label)

      const best = bests[stage.id] ?? 0
      const bestLabel = new Text({
        text: best > 0 ? `Best ${best}` : '',
        style: { fill: ACCENT, fontSize: 24, fontWeight: '700', fontFamily: FONT },
      })
      bestLabel.anchor.set(1, 0.5)
      bestLabel.position.set(ROW_W - ROW_PAD, ROW_H / 2)
      view.addChild(bestLabel)

      this.rows.push({ view, bg, label })
    })

    // Random row: name (left) + the digit stepper and a reroll pill (right).
    {
      const { view, bg } = placeRow(this.randomIndex)
      const label = makeLabel('Random')
      view.addChild(label)

      // Reroll pill, right-aligned; consumes its own tap so the row's tap-to-play
      // behind it doesn't also fire.
      const reroll = this.makeRerollButton(() => this.reroll())
      reroll.position.set(ROW_W - ROW_PAD - reroll.width / 2, ROW_H / 2)
      view.addChild(reroll)

      // Digit stepper sits to the left of the reroll pill, right-aligned.
      const clusterW = SEED_DIGITS * DIGIT_W + (SEED_DIGITS - 1) * DIGIT_GAP
      const clusterRight = ROW_W - ROW_PAD - reroll.width - STEPPER_GAP
      const clusterLeft = clusterRight - clusterW
      this.digitTexts = this.digits.map((d, i) => {
        const cx = clusterLeft + DIGIT_W / 2 + i * (DIGIT_W + DIGIT_GAP)
        const { cell, text } = this.makeDigit(d, () => this.tapDigit(i))
        cell.position.set(cx, ROW_H / 2)
        view.addChild(cell)
        return text
      })

      this.rows.push({ view, bg, label })
    }

    this.redrawRows()
  }

  /** One tap-to-increment digit cell. The returned `text` is the readout to
   * update; `cell` is the positioned, tappable container. */
  private makeDigit(value: number, onTap: () => void): { cell: Container; text: Text } {
    const bg = new Graphics()
      .roundRect(-DIGIT_W / 2, -DIGIT_H / 2, DIGIT_W, DIGIT_H, DIGIT_RADIUS)
      .fill({ color: 0x000000, alpha: 0.35 })
      .stroke({ color: ACCENT, width: 2, alpha: 0.7 })
    const text = new Text({
      text: String(value),
      style: { fill: WHITE, fontSize: 28, fontWeight: '700', fontFamily: FONT },
    })
    text.anchor.set(0.5)
    const cell = new Container()
    cell.addChild(bg, text)
    cell.eventMode = 'static'
    cell.cursor = 'pointer'
    cell.on('pointertap', (e: FederatedPointerEvent) => {
      e.stopPropagation()
      onTap()
    })
    return { cell, text }
  }

  /** A small "⟳ reroll" pill (centred on its own position). */
  private makeRerollButton(onTap: () => void): Container {
    const PAD_X = 16
    const H = 40
    const RADIUS = 8
    const label = new Text({
      text: '⟳ reroll',
      style: { fill: WHITE, fontSize: 20, fontWeight: '700', fontFamily: FONT },
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

  /** Tap a digit up 0→9→0 (no carry), persist, and refresh its readout. */
  private tapDigit(i: number): void {
    if (this.activated) return
    this.setSelected(this.randomIndex)
    const next = ((this.digits[i] ?? 0) + 1) % 10
    this.digits[i] = next
    const text = this.digitTexts[i]
    if (text) text.text = String(next)
    useHimeRunStore.getState().setLastRandomSeed(this.seedValue())
  }

  /** Replace the seed with a fresh one (deterministic via the scene rng, so no
   * `Math.random()`), persist it, and refresh every digit. */
  private reroll(): void {
    if (this.activated) return
    this.setSeed(this.rng.intRange(0, SEED_MOD - 1))
    this.digits.forEach((d, i) => {
      const text = this.digitTexts[i]
      if (text) text.text = String(d)
    })
    useHimeRunStore.getState().setLastRandomSeed(this.seedValue())
  }

  private setSelected(i: number): void {
    if (i === this.selected) return
    this.selected = i
    this.redrawRows()
  }

  private moveSelection(delta: number): void {
    const n = this.rows.length
    if (n === 0) return
    this.setSelected((this.selected + delta + n) % n)
  }

  /** Redraw row backgrounds for the current selection — only on change, not per
   * frame. Selected row gets an accent fill + border; the rest sit quiet. */
  private redrawRows(): void {
    this.rows.forEach((row, i) => {
      const on = i === this.selected
      row.bg.clear().roundRect(0, 0, ROW_W, ROW_H, ROW_RADIUS)
      if (on) {
        row.bg.fill({ color: ACCENT, alpha: 0.16 }).stroke({ color: ACCENT, width: 2, alpha: 0.9 })
      } else {
        row.bg.fill({ color: 0x000000, alpha: 0.35 })
      }
      row.label.alpha = on ? 1 : 0.8
    })
  }

  private activate(): void {
    if (this.activated) return
    const stage = this.stageAt(this.selected)
    if (!stage) return
    this.activated = true
    // The shown random seed is already persisted on every tap / reroll, so the
    // played seed reopens next session with no extra write here.
    this.options.onSelect(stage)
  }

  /** Resolve a row index to the stage it plays: a manifest course, or the
   * synthesised random stage (all seeds share `RANDOM_BEST_KEY` for best). */
  private stageAt(i: number): StageDef | undefined {
    if (i === this.randomIndex) {
      return { kind: 'random', id: RANDOM_BEST_KEY, name: 'Random', seed: this.seedValue() }
    }
    return this.courses[i]
  }

  override onUpdate(dt: SceneDelta): void {
    this.elapsed += dt.dtSec
    this.background.update(this.elapsed * BACKDROP_DRIFT, 0)

    if (!this.activated) {
      if (this.input.wasJustPressed('up')) this.moveSelection(-1)
      if (this.input.wasJustPressed('down')) this.moveSelection(1)
      if (this.input.wasJustPressed('select')) this.activate()
      // R rerolls, but only while the random row is highlighted.
      if (this.selected === this.randomIndex && this.input.wasJustPressed('reroll')) this.reroll()
      // Gentle pulse on the hint so the screen reads as live.
      this.hint.alpha = 0.6 + Math.sin(this.elapsed * 2.4) * 0.3
    }

    this.updateTweens(dt.dtMs)
    this.input.endFrame()
  }
}
