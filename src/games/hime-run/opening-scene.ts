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

/** A slow parallax drift so the backdrop isn't dead on the menu (px/s of faux
 * forward travel fed to the same scroll the run uses). */
const BACKDROP_DRIFT = 40

export interface OpeningSceneOptions {
  /** Fired when the player commits to a stage. The owner swaps in `MainScene`. */
  onSelect(stage: StageDef): void
  /** A seed pinned via the URL `?seed=`, if any. When set it is the random entry's
   * starting seed, overriding the persisted last-used one. */
  pinnedSeed?: number
}

interface Row {
  view: Container
  bg: Graphics
  label: Text
}

/** Title + stage-select for hime-run. Lists the manifest courses, then a seeded
 * random entry (name + seed + reroll) as the last row. ↑/↓ move the highlight,
 * SPACE/Enter or a tap commits, R rerolls the random seed. Reuses the ruined-dusk
 * parallax backdrop. */
export class OpeningScene extends Scene {
  private background!: Background
  private courses: CourseStageDef[] = []
  private rows: Row[] = []
  private selected = 0
  private activated = false
  private elapsed = 0
  private hint!: Text
  /** Current seed shown on the random row (pinned > persisted > default). */
  private randomSeed = DEFAULT_RANDOM_SEED
  /** The random row's seed readout, updated on reroll. */
  private randomSeedLabel!: Text

  constructor(private readonly options: OpeningSceneOptions) {
    super()
    this.sortableChildren = true
  }

  /** Row index of the synthesised random entry (always last). */
  private get randomIndex(): number {
    return this.courses.length
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
      text: '↑ ↓ choose · SPACE / Enter or tap to play · R rerolls the random seed',
      style: { fill: WHITE, fontSize: 22, fontFamily: FONT, align: 'center' },
    })
    this.hint.anchor.set(0.5)
    this.hint.position.set(DESIGN_W / 2, DESIGN_H * 0.88)
    this.hint.zIndex = 10
    this.addChild(this.hint)

    // The random entry starts on the pinned URL seed, else the persisted last seed,
    // else a fixed default — so a first-ever visit is reproducible.
    this.randomSeed =
      this.options.pinnedSeed ?? useHimeRunStore.getState().lastRandomSeed ?? DEFAULT_RANDOM_SEED

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

    // Course rows: name (left) + persisted best (right), best hidden when 0.
    this.courses.forEach((stage, i) => {
      const { view, bg } = placeRow(i)
      const label = new Text({
        text: stage.name,
        style: { fill: WHITE, fontSize: 30, fontWeight: '700', fontFamily: FONT },
      })
      label.anchor.set(0, 0.5)
      label.position.set(ROW_PAD, ROW_H / 2)
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

    // Random row: name (left) + seed readout and a reroll button (right).
    {
      const { view, bg } = placeRow(this.randomIndex)
      const label = new Text({
        text: 'Random',
        style: { fill: WHITE, fontSize: 30, fontWeight: '700', fontFamily: FONT },
      })
      label.anchor.set(0, 0.5)
      label.position.set(ROW_PAD, ROW_H / 2)
      view.addChild(label)

      // Reroll pill, right-aligned; consumes its own tap so the row's tap-to-play
      // behind it doesn't also fire.
      const reroll = this.makeRerollButton(() => this.reroll())
      reroll.position.set(ROW_W - ROW_PAD - reroll.width / 2, ROW_H / 2)
      view.addChild(reroll)

      this.randomSeedLabel = new Text({
        text: this.seedText(),
        style: { fill: ACCENT, fontSize: 24, fontWeight: '700', fontFamily: FONT },
      })
      this.randomSeedLabel.anchor.set(1, 0.5)
      // Sit to the left of the reroll pill with a comfortable gap.
      this.randomSeedLabel.position.set(ROW_W - ROW_PAD - reroll.width - 16, ROW_H / 2)
      view.addChild(this.randomSeedLabel)

      this.rows.push({ view, bg, label })
    }

    this.redrawRows()
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

  private seedText(): string {
    return `seed ${this.randomSeed}`
  }

  /** Replace the random seed with a fresh one (deterministic via the scene rng, so
   * no `Math.random()`), persist it, and update the readout. */
  private reroll(): void {
    if (this.activated) return
    this.randomSeed = this.rng.intRange(1, 0x7ffffffe)
    useHimeRunStore.getState().setLastRandomSeed(this.randomSeed)
    this.randomSeedLabel.text = this.seedText()
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
    if (stage.kind === 'random') {
      // Remember the played seed so the random entry reopens on it next session.
      useHimeRunStore.getState().setLastRandomSeed(stage.seed)
    }
    this.options.onSelect(stage)
  }

  /** Resolve a row index to the stage it plays: a manifest course, or the
   * synthesised random stage (all seeds share `RANDOM_BEST_KEY` for best). */
  private stageAt(i: number): StageDef | undefined {
    if (i === this.randomIndex) {
      return { kind: 'random', id: RANDOM_BEST_KEY, name: 'Random', seed: this.randomSeed }
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
