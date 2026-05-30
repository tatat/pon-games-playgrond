import { Container, Graphics, type Text } from 'pixi.js'
import { COLORS } from '../constants'
import type { DemoContext, DemoHandle, PatternDemo } from '../demo'
import { text } from '../demo-util'

interface FlowNode {
  id: string
  col: number
  /** 0 = middle row, -1 = top branch, +1 = bottom branch. */
  band: -1 | 0 | 1
  /** Which Scene this state lives in. Nodes sharing a `scene` are the same
   * `Scene` instance (transitions between them are in-scene state changes);
   * an edge to a node in another scene is a `SceneManager.changeTo`. */
  scene: string
  /** Display label; defaults to `id`. */
  label?: string
}

interface Flow {
  id: string
  name: string
  caption: string
  nodes: FlowNode[]
  edges: ReadonlyArray<readonly [string, string]>
  /** Highlight sequences; one is picked at random each loop. */
  paths: string[][]
  /** Node the loop-back arrow returns to (defaults to the first node). RPG-like
   * flows loop back to the field, not the title. */
  loopTo?: string
}

/** Common game progression FSMs. Each splits its phases across Scenes
 * differently — that scene-vs-state boundary is the whole point of the demo. */
const FLOWS: Flow[] = [
  {
    id: 'phase-arcade',
    name: 'Arcade loop',
    caption: 'A Title scene, then ready/play/over/result as states inside one Game scene.',
    nodes: [
      { id: 'title', col: 0, band: 0, scene: 'Title' },
      { id: 'ready', col: 1, band: 0, scene: 'Game' },
      { id: 'play', col: 2, band: 0, scene: 'Game' },
      { id: 'over', col: 3, band: 0, scene: 'Game' },
      { id: 'result', col: 4, band: 0, scene: 'Game' },
    ],
    edges: [
      ['title', 'ready'],
      ['ready', 'play'],
      ['play', 'over'],
      ['over', 'result'],
    ],
    paths: [['title', 'ready', 'play', 'over', 'result']],
  },
  {
    id: 'phase-stage',
    name: 'Stage clear / retry',
    caption: 'play branches to clear/fail (in-scene); clearing changes to a Result scene.',
    nodes: [
      { id: 'title', col: 0, band: 0, scene: 'Title' },
      { id: 'play', col: 1, band: 0, scene: 'Stage' },
      { id: 'clear', col: 2, band: -1, scene: 'Stage' },
      { id: 'fail', col: 2, band: 1, scene: 'Stage' },
      { id: 'result', col: 3, band: 0, scene: 'Result' },
    ],
    edges: [
      ['title', 'play'],
      ['play', 'clear'],
      ['play', 'fail'],
      ['clear', 'result'],
      ['fail', 'play'],
    ],
    paths: [
      ['title', 'play', 'clear', 'result'],
      ['title', 'play', 'fail', 'play', 'clear', 'result'],
    ],
  },
  {
    id: 'phase-roguelike',
    name: 'Roguelike run',
    caption: 'Run scene holds run/death; meta-upgrade is its own scene between runs.',
    nodes: [
      { id: 'menu', col: 0, band: 0, scene: 'Menu' },
      { id: 'run', col: 1, band: 0, scene: 'Run' },
      { id: 'death', col: 2, band: 0, scene: 'Run' },
      { id: 'meta', col: 3, band: 0, scene: 'Meta', label: 'upgrade' },
    ],
    edges: [
      ['menu', 'run'],
      ['run', 'death'],
      ['death', 'meta'],
    ],
    paths: [['menu', 'run', 'death', 'meta']],
  },
  {
    id: 'phase-match',
    name: 'Match (PvP)',
    caption: 'lobby/countdown in one scene; match and result/rematch are separate scenes.',
    nodes: [
      { id: 'lobby', col: 0, band: 0, scene: 'Lobby' },
      { id: 'count', col: 1, band: 0, scene: 'Lobby', label: 'countdown' },
      { id: 'match', col: 2, band: 0, scene: 'Match' },
      { id: 'result', col: 3, band: 0, scene: 'Result' },
      { id: 'rematch', col: 4, band: 0, scene: 'Result' },
    ],
    edges: [
      ['lobby', 'count'],
      ['count', 'match'],
      ['match', 'result'],
      ['result', 'rematch'],
    ],
    paths: [['lobby', 'count', 'match', 'result', 'rematch']],
  },
  {
    id: 'phase-vn',
    name: 'Visual novel',
    caption: 'Almost all phases are states inside one Story scene; only enter/exit changeTo.',
    nodes: [
      { id: 'title', col: 0, band: 0, scene: 'Title' },
      { id: 'chapter', col: 1, band: 0, scene: 'Story' },
      { id: 'choice', col: 2, band: 0, scene: 'Story' },
      { id: 'routeA', col: 3, band: -1, scene: 'Story', label: 'route A' },
      { id: 'routeB', col: 3, band: 1, scene: 'Story', label: 'route B' },
      { id: 'ending', col: 4, band: 0, scene: 'Story' },
    ],
    edges: [
      ['title', 'chapter'],
      ['chapter', 'choice'],
      ['choice', 'routeA'],
      ['choice', 'routeB'],
      ['routeA', 'ending'],
      ['routeB', 'ending'],
    ],
    paths: [
      ['title', 'chapter', 'choice', 'routeA', 'ending'],
      ['title', 'chapter', 'choice', 'routeB', 'ending'],
    ],
  },
  {
    id: 'phase-rpg',
    name: 'RPG (field + battle)',
    caption: 'Field scene (explore + talk) changes to a separate Battle scene, then back.',
    nodes: [
      { id: 'title', col: 0, band: 0, scene: 'Title' },
      { id: 'explore', col: 1, band: 0, scene: 'Field' },
      { id: 'talk', col: 2, band: -1, scene: 'Field', label: 'event/talk' },
      { id: 'battle', col: 3, band: 0, scene: 'Battle' },
      { id: 'result', col: 4, band: 0, scene: 'Battle' },
    ],
    edges: [
      ['title', 'explore'],
      ['explore', 'talk'],
      ['explore', 'battle'],
      ['talk', 'battle'],
      ['battle', 'result'],
    ],
    paths: [
      ['title', 'explore', 'battle', 'result'],
      ['title', 'explore', 'talk', 'battle', 'result'],
    ],
    // Victory returns to the field, not the title.
    loopTo: 'explore',
  },
]

/** Dashed segment list pushed into `g` (stroke once afterwards). */
function dash(g: Graphics, x1: number, y1: number, x2: number, y2: number, len = 7): void {
  const dx = x2 - x1
  const dy = y2 - y1
  const total = Math.hypot(dx, dy)
  const steps = Math.max(1, Math.floor(total / (len * 2)))
  for (let i = 0; i < steps; i++) {
    const a = (i * 2 * len) / total
    const b = Math.min(1, (i * 2 * len + len) / total)
    g.moveTo(x1 + dx * a, y1 + dy * a).lineTo(x1 + dx * b, y1 + dy * b)
  }
}

/** Filled arrowhead at (tx,ty) pointing along the (fx,fy)→(tx,ty) direction. */
function arrowhead(
  g: Graphics,
  fx: number,
  fy: number,
  tx: number,
  ty: number,
  color: number,
): void {
  const ang = Math.atan2(ty - fy, tx - fx)
  const s = 8
  g.poly([
    tx,
    ty,
    tx - Math.cos(ang - 0.5) * s,
    ty - Math.sin(ang - 0.5) * s,
    tx - Math.cos(ang + 0.5) * s,
    ty - Math.sin(ang + 0.5) * s,
  ]).fill(color)
}

/** Time each highlighted state holds before advancing. */
const STEP_MS = 1100

function makeFlowDemo(flow: Flow): PatternDemo {
  return {
    id: flow.id,
    name: flow.name,
    caption: flow.caption,
    category: 'phases',
    pad: true,
    mount({ stage, width, height, theme, rng }: DemoContext): DemoHandle {
      const root = new Container()
      stage.addChild(root)

      const maxCol = Math.max(...flow.nodes.map((n) => n.col))
      // Leave enough column gap that adjacent scene frames never touch (frames
      // inset by padX each side, plus room for the changeTo arrow between them).
      const nodeW = Math.min(112, Math.floor(width / (maxCol + 1)) - 22)
      const nodeH = 44
      const colStep = maxCol > 0 ? (width - nodeW) / maxCol : 0
      const midY = height / 2 + 6
      const bandGap = nodeH + 28
      const byId = new Map(flow.nodes.map((n) => [n.id, n]))
      const center = (n: FlowNode): { x: number; y: number } => ({
        x: nodeW / 2 + n.col * colStep,
        y: midY + n.band * bandGap,
      })

      // ── Scene frames (back layer): group nodes sharing a `scene`. ──────────
      // Each scene spans a contiguous block of columns; framing each block to
      // the same inset keeps every inter-scene gap identical.
      const frames = new Graphics()
      root.addChild(frames)
      const scenes = [...new Set(flow.nodes.map((n) => n.scene))]
      const padX = 8
      const padBottom = 12
      const padTop = 26
      interface Bounds {
        minX: number
        maxX: number
        minY: number
        maxY: number
      }
      const bounds = new Map<string, Bounds>()
      for (const sc of scenes) {
        const members = flow.nodes.filter((n) => n.scene === sc).map(center)
        const b: Bounds = {
          minX: Math.min(...members.map((p) => p.x)) - nodeW / 2 - padX,
          maxX: Math.max(...members.map((p) => p.x)) + nodeW / 2 + padX,
          minY: Math.min(...members.map((p) => p.y)) - nodeH / 2 - padTop,
          maxY: Math.max(...members.map((p) => p.y)) + nodeH / 2 + padBottom,
        }
        bounds.set(sc, b)
        frames
          .roundRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY, 14)
          .fill({ color: 0xffffff, alpha: 0.03 })
          .stroke({ color: COLORS.faint, width: 1 })
        const tag = text(sc.toUpperCase(), {
          fill: COLORS.muted,
          fontSize: 11,
          fontFamily: theme.fontSans,
          letterSpacing: 1,
        })
        tag.position.set(b.minX + 10, b.minY + 7)
        root.addChild(tag)
      }

      // ── Edges: dashed = in-scene state change, solid+arrow = changeTo. ─────
      // Line strokes and arrowhead fills go in separate Graphics so the fills
      // never reset a pending stroke (which would chop the lines).
      const inScene = new Graphics()
      const cross = new Graphics()
      const arrows = new Graphics()
      root.addChild(inScene, cross, arrows)
      for (const [from, to] of flow.edges) {
        const a = byId.get(from)
        const b = byId.get(to)
        if (!a || !b) continue
        const pa = center(a)
        const pb = center(b)
        if (a.scene === b.scene) {
          // In-scene: connect node edge to node edge (within the same frame).
          dash(inScene, pa.x + nodeW / 2, pa.y, pb.x - nodeW / 2, pb.y)
        } else {
          // changeTo: span the gap between the two scene frames, so every
          // inter-scene arrow is the same length as the gap.
          const sb = bounds.get(a.scene)
          const db = bounds.get(b.scene)
          let sx = sb ? sb.maxX : pa.x + nodeW / 2
          let ex = db ? db.minX : pb.x - nodeW / 2
          // If frames touch/overlap (degenerate gap), fall back to node edges so
          // the arrow stays forward instead of reversing.
          if (ex <= sx + 2) {
            sx = pa.x + nodeW / 2
            ex = pb.x - nodeW / 2
          }
          cross.moveTo(sx, pa.y).lineTo(ex, pb.y)
          arrowhead(arrows, sx, pa.y, ex, pb.y, COLORS.accent)
        }
      }
      inScene.stroke({ color: COLORS.muted, width: 1.5 })
      cross.stroke({ color: COLORS.accent, width: 2 })

      // Loop-back edge (last column → loopTo, default the first node) is a
      // changeTo; routed below the graph.
      const first = flow.nodes.find((n) => n.col === 0 && n.band === 0) ?? flow.nodes[0]
      const last = flow.nodes.find((n) => n.col === maxCol) ?? flow.nodes[flow.nodes.length - 1]
      const loopTarget = (flow.loopTo && byId.get(flow.loopTo)) || first
      if (loopTarget && last) {
        const pf = center(loopTarget)
        const pl = center(last)
        const yBottom = height - 14
        const restart = new Graphics()
        restart
          .moveTo(pl.x, pl.y + nodeH / 2)
          .lineTo(pl.x, yBottom)
          .lineTo(pf.x, yBottom)
          .lineTo(pf.x, pf.y + nodeH / 2)
          .stroke({ color: COLORS.accent, width: 2 })
        arrowhead(arrows, pf.x, yBottom, pf.x, pf.y + nodeH / 2, COLORS.accent)
        root.addChild(restart)
      }

      // ── Nodes (front). ─────────────────────────────────────────────────────
      const nodeViews = new Map<string, { bg: Graphics; label: Text }>()
      for (const n of flow.nodes) {
        const c = center(n)
        const bg = new Graphics()
        bg.position.set(c.x - nodeW / 2, c.y - nodeH / 2)
        const label = text(n.label ?? n.id, {
          fill: COLORS.text,
          fontSize: 15,
          fontFamily: theme.fontMono,
        })
        label.anchor.set(0.5)
        label.position.set(c.x, c.y)
        const view = new Container()
        view.addChild(bg, label)
        root.addChild(view)
        nodeViews.set(n.id, { bg, label })
      }

      // Legend.
      const legend = text('▭ Scene   ── changeTo   ┈ in-scene state', {
        fill: COLORS.faint,
        fontSize: 11,
        fontFamily: theme.fontMono,
      })
      legend.position.set(0, 0)
      root.addChild(legend)

      const setActive = (activeId: string): void => {
        for (const [id, { bg, label }] of nodeViews) {
          const active = id === activeId
          bg.clear()
            .roundRect(0, 0, nodeW, nodeH, 10)
            .fill(active ? COLORS.rowActive : COLORS.panel)
            .stroke({ color: active ? COLORS.accent : COLORS.border, width: active ? 2 : 1 })
          label.tint = active ? COLORS.text : COLORS.muted
        }
      }

      let sequence: string[] = flow.paths[0] ?? []
      const repick = (): void => {
        sequence = rng.pick(flow.paths)
      }
      repick()
      let idx = 0
      let elapsed = 0
      setActive(sequence[0] ?? '')

      return {
        update: (dt) => {
          elapsed += dt.dtMs
          if (elapsed < STEP_MS) return
          elapsed = 0
          idx++
          if (idx >= sequence.length) {
            repick()
            idx = 0
          }
          setActive(sequence[idx] ?? '')
        },
      }
    },
  }
}

export const phasesDemos: PatternDemo[] = FLOWS.map(makeFlowDemo)
