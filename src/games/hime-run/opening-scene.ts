import { Container, Graphics, Text } from 'pixi.js'
import { DESIGN_H, DESIGN_W } from '../../engine/constants'
import { makeVirtualKeypad } from '../../engine/input/virtual-keypad'
import { Scene, type SceneDelta } from '../../engine/scene'
import { useRuntimeStore } from '../../store/runtime'
import { Background } from './background'
import { loadStageManifest, type StageDef } from './stage'
import { useHimeRunStore } from './store'

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
}

interface Row {
  view: Container
  bg: Graphics
  label: Text
}

/** Title + stage-select for hime-run. Lists the stages from the manifest; ↑/↓
 * move the highlight, SPACE/Enter or a tap commits. Reuses the ruined-dusk
 * parallax backdrop. */
export class OpeningScene extends Scene {
  private background!: Background
  private stages: StageDef[] = []
  private rows: Row[] = []
  private selected = 0
  private activated = false
  private elapsed = 0
  private hint!: Text

  constructor(private readonly options: OpeningSceneOptions) {
    super()
    this.sortableChildren = true
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
      text: '↑ ↓ to choose · SPACE / Enter or tap to play',
      style: { fill: WHITE, fontSize: 22, fontFamily: FONT, align: 'center' },
    })
    this.hint.anchor.set(0.5)
    this.hint.position.set(DESIGN_W / 2, DESIGN_H * 0.88)
    this.hint.zIndex = 10
    this.addChild(this.hint)

    // Load the stage catalog and build the list.
    const manifest = await loadStageManifest(signal)
    signal.throwIfAborted()
    this.stages = manifest.stages
    this.buildRows()

    this.bindInput({
      up: ['ArrowUp', 'KeyW'],
      down: ['ArrowDown', 'KeyS'],
      select: ['Space', 'Enter'],
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
    const n = this.stages.length
    const totalH = n * ROW_H + (n - 1) * ROW_GAP
    const startY = LIST_CENTER_Y - totalH / 2
    const rowX = (DESIGN_W - ROW_W) / 2

    this.stages.forEach((stage, i) => {
      const view = new Container()
      view.position.set(rowX, startY + i * (ROW_H + ROW_GAP))
      view.zIndex = 5
      view.eventMode = 'static'
      view.cursor = 'pointer'

      const bg = new Graphics()
      view.addChild(bg)

      const label = new Text({
        text: stage.name,
        style: { fill: WHITE, fontSize: 30, fontWeight: '700', fontFamily: FONT },
      })
      label.anchor.set(0, 0.5)
      label.position.set(ROW_PAD, ROW_H / 2)
      view.addChild(label)

      // Persisted best, right-aligned with matching clearance from the right
      // edge. Hidden when 0 (never played) so an unplayed row reads clean.
      const best = useHimeRunStore.getState().bests[stage.id] ?? 0
      const bestLabel = new Text({
        text: best > 0 ? `Best ${best}` : '',
        style: { fill: ACCENT, fontSize: 24, fontWeight: '700', fontFamily: FONT },
      })
      bestLabel.anchor.set(1, 0.5)
      bestLabel.position.set(ROW_W - ROW_PAD, ROW_H / 2)
      view.addChild(bestLabel)

      view.on('pointerover', () => this.setSelected(i))
      view.on('pointertap', () => {
        this.setSelected(i)
        this.activate()
      })

      this.addChild(view)
      this.rows.push({ view, bg, label })
    })
    this.redrawRows()
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
    const stage = this.stages[this.selected]
    if (!stage) return
    this.activated = true
    this.options.onSelect(stage)
  }

  override onUpdate(dt: SceneDelta): void {
    this.elapsed += dt.dtSec
    this.background.update(this.elapsed * BACKDROP_DRIFT, 0)

    if (!this.activated) {
      if (this.input.wasJustPressed('up')) this.moveSelection(-1)
      if (this.input.wasJustPressed('down')) this.moveSelection(1)
      if (this.input.wasJustPressed('select')) this.activate()
      // Gentle pulse on the hint so the screen reads as live.
      this.hint.alpha = 0.6 + Math.sin(this.elapsed * 2.4) * 0.3
    }

    this.updateTweens(dt.dtMs)
    this.input.endFrame()
  }
}
