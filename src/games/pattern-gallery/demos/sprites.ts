import { Assets, Container, Graphics, Sprite, type Texture } from 'pixi.js'
import type { AssetEntry } from '../../../engine/assets'
import { makeSegmentedControl } from '../../../engine/ui/segmented-control'
import { COLORS } from '../constants'
import type { DemoContext, DemoHandle, PatternDemo } from '../demo'
import { reactive, tag, text } from '../demo-util'

/** Sprite assets the gallery preloads for the `image-fit` demo. Declared here
 * (next to the only consumer) and preloaded by `GalleryScene.onEnter`, which
 * owns the `AbortSignal`. The `@2x` suffix is load-bearing: Pixi reads it and
 * sets `texture.source.resolution = 2`, so `texture.width/height` report the
 * *logical* size — exactly what the fit math below must use. */
export const SPRITE_ASSETS: AssetEntry[] = [
  { alias: 'pg-sample-wide', src: 'games/pattern-gallery/sample-wide@2x.png' },
  { alias: 'pg-sample-tall', src: 'games/pattern-gallery/sample-tall@2x.png' },
]

type FitMode = 'contain' | 'cover' | 'stretch'

/** Returns the per-axis scale for fitting a `texW×texH` source into a
 * `boxW×boxH` box under `mode`. This is the whole point of the demo. */
function fitScale(
  mode: FitMode,
  texW: number,
  texH: number,
  boxW: number,
  boxH: number,
): { sx: number; sy: number } {
  if (mode === 'stretch') return { sx: boxW / texW, sy: boxH / texH }
  const k =
    mode === 'contain' ? Math.min(boxW / texW, boxH / texH) : Math.max(boxW / texW, boxH / texH)
  return { sx: k, sy: k }
}

const imageFit: PatternDemo = {
  id: 'image-fit',
  name: 'Image fit (aspect ratio)',
  caption: 'contain / cover / stretch — preserve aspect ratio vs. distort.',
  category: 'sprites',
  pad: true,
  mount({ stage, width, height, theme }: DemoContext): DemoHandle {
    const root = new Container()
    stage.addChild(root)

    const mode = reactive<FitMode>('contain')
    const source = reactive<'pg-sample-wide' | 'pg-sample-tall'>('pg-sample-wide')

    // Top-aligned so the two readout lines + the note below the box stay
    // inside the stage instead of being clipped by its bottom mask.
    const box = Math.min(width * 0.44, height - 150)
    const boxX = 24
    const boxY = 28

    // Box frame + clip mask (so `cover` overflow is clipped, not bleeding).
    const frame = new Graphics()
      .rect(boxX, boxY, box, box)
      .stroke({ color: COLORS.accent, width: 2 })
    root.addChild(frame)

    const clip = new Container()
    const mask = new Graphics().rect(boxX, boxY, box, box).fill(0xffffff)
    clip.addChild(mask)
    clip.mask = mask
    root.addChild(clip)

    const sprite = new Sprite()
    sprite.anchor.set(0.5)
    sprite.position.set(boxX + box / 2, boxY + box / 2)
    clip.addChild(sprite)

    const readout = text('', { fill: COLORS.muted, fontSize: 14, fontFamily: theme.fontMono })
    readout.position.set(boxX, boxY + box + 14)
    root.addChild(readout)

    const note = text('stretch = set sprite.width/height directly → distorts', {
      fill: COLORS.faint,
      fontSize: 13,
      fontFamily: theme.fontMono,
    })
    note.position.set(boxX, boxY + box + 56)
    root.addChild(note)

    const apply = (): void => {
      const tex = Assets.get<Texture>(source.get())
      sprite.texture = tex
      const tw = tex.width
      const th = tex.height
      const { sx, sy } = fitScale(mode.get(), tw, th, box, box)
      sprite.scale.set(sx, sy)
      readout.text =
        `texture ${tw}×${th}  ·  box ${box | 0}×${box | 0}\n` +
        `${mode.get()} → scaleX ${sx.toFixed(3)}  scaleY ${sy.toFixed(3)}`
    }

    // ── Controls (to the right of the box; sized to fit the remaining width) ──
    const ctrlX = boxX + box + 28
    let cy = boxY

    const modeTag = tag('FIT MODE', theme.fontSans)
    modeTag.position.set(ctrlX, cy)
    root.addChild(modeTag)
    cy += 24
    const modeCtl = makeSegmentedControl<FitMode>({
      choices: [
        { label: 'contain', value: 'contain' },
        { label: 'cover', value: 'cover' },
        { label: 'stretch', value: 'stretch' },
      ],
      getValue: mode.get,
      onChange: (v) => mode.set(v),
      subscribe: mode.subscribe,
      theme,
      buttonW: 64,
      buttonH: 30,
      fontSize: 15,
    })
    modeCtl.view.position.set(ctrlX, cy)
    root.addChild(modeCtl.view)
    cy += 70

    const srcTag = tag('SOURCE', theme.fontSans)
    srcTag.position.set(ctrlX, cy)
    root.addChild(srcTag)
    cy += 24
    const srcCtl = makeSegmentedControl<'pg-sample-wide' | 'pg-sample-tall'>({
      choices: [
        { label: 'wide 16:9', value: 'pg-sample-wide' },
        { label: 'tall 3:4', value: 'pg-sample-tall' },
      ],
      getValue: source.get,
      onChange: (v) => source.set(v),
      subscribe: source.subscribe,
      theme,
      buttonW: 90,
      buttonH: 30,
      fontSize: 15,
    })
    srcCtl.view.position.set(ctrlX, cy)
    root.addChild(srcCtl.view)

    const unsub = [mode.subscribe(apply), source.subscribe(apply)]
    apply()

    return {
      dispose: () => {
        for (const u of unsub) u()
        modeCtl.dispose()
        srcCtl.dispose()
      },
    }
  },
}

export const spritesDemos: PatternDemo[] = [imageFit]
