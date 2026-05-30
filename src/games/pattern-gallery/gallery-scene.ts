import { Container, Graphics, type Text } from 'pixi.js'
import { DESIGN_H, DESIGN_W } from '../../engine/constants'
import { makeVirtualKeypad, type VirtualKeypad } from '../../engine/input/virtual-keypad'
import { Scene, type SceneDelta } from '../../engine/scene'
import type { UiTheme } from '../../engine/ui-theme'
import { useRuntimeStore } from '../../store/runtime'
import {
  BINDINGS,
  COLORS,
  CONTENT_PAD,
  GAP,
  LABEL_H,
  LABEL_Y,
  MARGIN,
  MENU_X,
  PARAMS_W,
  PARAMS_X,
  RADIUS,
  STAGE_H,
  STAGE_W,
  STAGE_X,
  STAGE_Y,
} from './constants'
import { DEMOS, type DemoHandle } from './demo'
import { text } from './demo-util'
import { SPRITE_ASSETS } from './demos/sprites'
import { type Menu, makeMenu } from './menu'
import { makeParamPanel, type ParamPanel } from './param-panel'

/** The catalog: a left menu of named patterns and a stage that plays the
 * selected demo live, with a label bar naming it (display name + `id` token +
 * caption). Selecting swaps the demo; the previous one is disposed + destroyed. */
export class GalleryScene extends Scene {
  private readonly theme: UiTheme = useRuntimeStore.getState().uiTheme
  private menu!: Menu
  private demoLayer!: Container
  private nameText!: Text
  private idText!: Text
  private captionText!: Text
  private active?: DemoHandle
  private paramPanel?: ParamPanel
  /** On-screen pad for the current demo (rebuilt on select, if it declares
   * `controls`). Self-hides unless the virtual pad is enabled. */
  private keypad?: VirtualKeypad
  private stageMask!: Graphics
  private stageFrame!: Graphics
  private labelBar!: Graphics
  /** Right-column height, shared by the menu and the param panel. */
  private readonly columnH = DESIGN_H - STAGE_Y - MARGIN
  /** Stage width when a demo has no params — reclaims the param-panel column. */
  private readonly stageFullW = STAGE_W + GAP + PARAMS_W

  async onEnter(signal: AbortSignal): Promise<void> {
    this.bindInput(BINDINGS)
    // Preload the sprite assets the `image-fit` demo reads from the cache.
    await this.preload(SPRITE_ASSETS, signal)

    this.addChild(new Graphics().rect(0, 0, DESIGN_W, DESIGN_H).fill(COLORS.panelDeep))

    this.menu = makeMenu(DEMOS, this.columnH, this.theme, (id) => this.select(id))
    this.menu.view.position.set(MENU_X, STAGE_Y)
    this.use(this.menu)
    this.addChild(this.menu.view)

    // Stage: a clipped layer the demos draw into. The mask / frame / label bar
    // are (re)sized per demo in `select()` — a param-less demo widens the stage
    // to reclaim the param-panel column.
    const stageClip = new Container()
    stageClip.position.set(STAGE_X, STAGE_Y)
    this.stageMask = new Graphics()
    stageClip.addChild(this.stageMask)
    stageClip.mask = this.stageMask
    // Origin is reset per-demo in `select()` (padded vs. full-bleed).
    this.demoLayer = new Container()
    stageClip.addChild(this.demoLayer)
    this.addChild(stageClip)
    this.stageFrame = new Graphics()
    this.addChild(this.stageFrame)

    // Label bar (also resized in `select()`).
    this.labelBar = new Graphics()
    this.addChild(this.labelBar)
    this.nameText = text('', {
      fill: COLORS.text,
      fontSize: 22,
      fontFamily: this.theme.fontSans,
      fontWeight: 'bold',
    })
    this.nameText.position.set(STAGE_X + 18, LABEL_Y + 12)
    this.addChild(this.nameText)

    this.idText = text('', { fill: COLORS.accent, fontSize: 14, fontFamily: this.theme.fontMono })
    this.idText.position.set(STAGE_X + 20, LABEL_Y + 12)
    this.addChild(this.idText)

    this.captionText = text('', {
      fill: COLORS.muted,
      fontSize: 15,
      fontFamily: this.theme.fontSans,
    })
    this.captionText.position.set(STAGE_X + 18, LABEL_Y + 48)
    this.addChild(this.captionText)

    const first = DEMOS[0]
    if (first) this.select(first.id)
  }

  private select(id: string): void {
    const demo = DEMOS.find((d) => d.id === id)
    if (!demo) return

    // Tear down the previous demo + its param panel, then drop + destroy visuals.
    this.active?.dispose?.()
    this.active = undefined
    for (const child of this.demoLayer.removeChildren()) child.destroy({ children: true })
    if (this.paramPanel) {
      this.paramPanel.dispose()
      this.paramPanel.view.destroy({ children: true })
    }
    // Drop the previous demo's on-screen pad.
    this.keypad?.dispose()
    this.keypad = undefined

    // A param-less demo (e.g. the phase flows) widens the stage to fill the
    // param-panel column; otherwise the stage is narrower and the panel shows.
    const hasParams = (demo.params?.length ?? 0) > 0
    const contentW = hasParams ? STAGE_W : this.stageFullW

    this.stageMask.clear().rect(0, 0, contentW, STAGE_H).fill(0xffffff)
    this.stageFrame
      .clear()
      .rect(STAGE_X, STAGE_Y, contentW, STAGE_H)
      .stroke({ color: COLORS.border, width: 1 })
    this.labelBar
      .clear()
      .roundRect(STAGE_X, LABEL_Y, contentW, LABEL_H, RADIUS.panel)
      .fill(COLORS.panel)
      .stroke({ color: COLORS.border, width: 1 })

    // Fresh param panel (knobs reset to their defaults for the new demo). The
    // panel still provides the `params` accessor; its view is only shown when
    // the demo actually has knobs.
    this.paramPanel = makeParamPanel(demo.params ?? [], PARAMS_W, this.columnH, this.theme)
    if (hasParams) {
      this.paramPanel.view.position.set(PARAMS_X, STAGE_Y)
      this.addChild(this.paramPanel.view)
    }

    // Diagrams/explainers inset by CONTENT_PAD; full-screen demos draw edge-to-edge.
    const pad = demo.pad ? CONTENT_PAD : 0
    this.demoLayer.position.set(pad, pad)
    this.active = demo.mount({
      stage: this.demoLayer,
      rng: this.rng,
      input: this.input,
      theme: this.theme,
      params: this.paramPanel.params,
      width: contentW - 2 * pad,
      height: STAGE_H - 2 * pad,
    })

    // On-screen pad for demos that declare one. It self-hides unless the
    // virtual pad is enabled (settings / coarse pointer), and feeds the same
    // `BINDINGS` actions the keyboard does. Option taps drive the pause overlay.
    if (demo.controls) {
      const c = demo.controls
      this.keypad = makeVirtualKeypad(this.input, this.layout, {
        stick: c.stick,
        rightStick: c.rightStick,
        actions: { a: c.a, b: c.b },
        // Toggle the pause overlay — a second Option tap closes it (the pad
        // sits above the overlay in the viewport uiLayer, so it stays tappable).
        option: {
          tap: () => {
            const s = useRuntimeStore.getState()
            s.setGamePaused(!s.gamePaused)
          },
        },
      })
      this.layout.uiLayer.addChild(this.keypad.view)
    }

    this.nameText.text = demo.name
    // Place the token right after the name (measured at runtime).
    this.idText.position.x = this.nameText.position.x + this.nameText.width + 14
    this.idText.text = `#${demo.id}`
    this.captionText.text = demo.caption
    this.menu.setActive(id)
  }

  onUpdate(dt: SceneDelta): void {
    this.updateTweens(dt.dtMs)
    this.active?.update?.(dt)
    this.input.endFrame()
  }

  onExit(): void {
    this.active?.dispose?.()
    this.active = undefined
    this.paramPanel?.dispose()
    this.keypad?.dispose()
    this.keypad = undefined
  }
}
