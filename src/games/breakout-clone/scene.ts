import { Graphics, Text } from 'pixi.js'
import { DESIGN_H, DESIGN_W } from '../../engine/constants'
import { Scene, type SceneDelta } from '../../engine/scene'

const BACKGROUND_COLOR = 0x0a0a14

/** Skeleton scene. Real gameplay (paddle, ball, bricks, boss, sound) lands
 * in subsequent phases. For now it just draws the deep-space backdrop and a
 * placeholder notice so the route renders something verifiable. */
export class MainScene extends Scene {
  onEnter(signal: AbortSignal): void {
    signal.throwIfAborted()

    const bg = new Graphics().rect(0, 0, DESIGN_W, DESIGN_H).fill(BACKGROUND_COLOR)
    bg.zIndex = -100
    this.addChild(bg)

    const title = new Text({
      text: 'BREAKOUT CLONE',
      style: { fill: 0xffffff, fontSize: 48, fontFamily: 'system-ui', letterSpacing: 4 },
    })
    title.anchor.set(0.5)
    title.position.set(DESIGN_W / 2, DESIGN_H / 2 - 20)
    this.addChild(title)

    const sub = new Text({
      text: 'Skeleton scene — gameplay coming next',
      style: { fill: 0xa0a0a0, fontSize: 16, fontFamily: 'system-ui' },
    })
    sub.anchor.set(0.5)
    sub.position.set(DESIGN_W / 2, DESIGN_H / 2 + 24)
    this.addChild(sub)

    this.bindInput({})
  }

  override onUpdate(_dt: SceneDelta): void {
    this.input.endFrame()
  }
}
