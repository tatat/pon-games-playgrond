import { Container, Graphics, type Text } from 'pixi.js'
import { DESIGN_H, DESIGN_W } from '../../engine/constants'
import { Scene, type SceneDelta } from '../../engine/scene'
import type { UiTheme } from '../../engine/ui-theme'
import { useRuntimeStore } from '../../store/runtime'
import {
  BINDINGS,
  COLORS,
  CONTENT_PAD,
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
  /** Right-column height, shared by the menu and the param panel. */
  private readonly columnH = DESIGN_H - STAGE_Y - MARGIN

  async onEnter(signal: AbortSignal): Promise<void> {
    this.bindInput(BINDINGS)
    // Preload the sprite assets the `image-fit` demo reads from the cache.
    await this.preload(SPRITE_ASSETS, signal)

    this.addChild(new Graphics().rect(0, 0, DESIGN_W, DESIGN_H).fill(COLORS.panelDeep))

    this.menu = makeMenu(DEMOS, this.columnH, this.theme, (id) => this.select(id))
    this.menu.view.position.set(MENU_X, STAGE_Y)
    this.use(this.menu)
    this.addChild(this.menu.view)

    // Stage: a clipped layer the demos draw into.
    const stageClip = new Container()
    stageClip.position.set(STAGE_X, STAGE_Y)
    const mask = new Graphics().rect(0, 0, STAGE_W, STAGE_H).fill(0xffffff)
    stageClip.addChild(mask)
    stageClip.mask = mask
    // Origin is reset per-demo in `select()` (padded vs. full-bleed).
    this.demoLayer = new Container()
    stageClip.addChild(this.demoLayer)
    this.addChild(stageClip)
    this.addChild(
      new Graphics()
        .rect(STAGE_X, STAGE_Y, STAGE_W, STAGE_H)
        .stroke({ color: COLORS.border, width: 1 }),
    )

    // Label bar.
    this.addChild(
      new Graphics()
        .roundRect(STAGE_X, LABEL_Y, STAGE_W, LABEL_H, RADIUS.panel)
        .fill(COLORS.panel)
        .stroke({ color: COLORS.border, width: 1 }),
    )
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

    // Fresh param panel (knobs reset to their defaults for the new demo).
    this.paramPanel = makeParamPanel(demo.params ?? [], PARAMS_W, this.columnH, this.theme)
    this.paramPanel.view.position.set(PARAMS_X, STAGE_Y)
    this.addChild(this.paramPanel.view)

    // Diagrams/explainers inset by CONTENT_PAD; full-screen demos draw edge-to-edge.
    const pad = demo.pad ? CONTENT_PAD : 0
    this.demoLayer.position.set(pad, pad)
    this.active = demo.mount({
      stage: this.demoLayer,
      rng: this.rng,
      input: this.input,
      theme: this.theme,
      params: this.paramPanel.params,
      width: STAGE_W - 2 * pad,
      height: STAGE_H - 2 * pad,
    })

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
  }
}
