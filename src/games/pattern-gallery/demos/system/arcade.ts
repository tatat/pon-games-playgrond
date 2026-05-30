import { Container, Graphics } from 'pixi.js'
import type { Rng } from '../../../../engine/rng'
import { COLORS } from '../../constants'
import type { PatternDemo } from '../../demo'
import { text } from '../../demo-util'
import { axis, clamp, FLOOR_INSET, hint } from './shared'

const endlessDodge: PatternDemo = {
  id: 'endless-dodge-style',
  controls: { stick: { left: 'left', right: 'right', up: 'up', down: 'down' } },
  name: 'Endless-dodge-style',
  caption: 'Steer with ← → ↑ ↓ / WASD; obstacles scroll in endlessly.',
  category: 'system',
  params: [
    { key: 'rate', label: 'Scroll rate', min: 0.3, max: 2.5, step: 0.1, default: 1, unit: '×' },
  ],
  mount(ctx) {
    const { width, height, params, input } = ctx
    const root = new Container()
    ctx.stage.addChild(root)
    hint(ctx, '← → ↑ ↓ / WASD : move')

    const player = new Graphics().circle(0, 0, 14).fill(COLORS.accent)
    let px = width * 0.25
    let py = height / 2
    root.addChild(player)

    interface Ob {
      g: Graphics
      x: number
      y: number
      speed: number
      size: number
    }
    const obstacles: Ob[] = []
    const spawn = (rng: Rng): Ob => {
      const size = rng.intRange(20, 46)
      const g = new Graphics().roundRect(-size / 2, -size / 2, size, size, 5).fill(COLORS.rowActive)
      root.addChild(g)
      return {
        g,
        x: width + size,
        y: rng.intRange(20, height - 20),
        speed: rng.intRange(160, 320),
        size,
      }
    }
    for (let i = 0; i < 6; i++) {
      const o = spawn(ctx.rng)
      o.x = ctx.rng.intRange(0, width)
      obstacles.push(o)
    }

    return {
      update: (dt) => {
        const rate = params.get('rate')
        const sp = 300 * dt.dtSec
        px = clamp(px + axis(input, 'left', 'right') * sp, 14, width - 14)
        py = clamp(py + axis(input, 'up', 'down') * sp, 14, height - FLOOR_INSET - 14)
        player.position.set(px, py)
        for (const o of obstacles) {
          o.x -= o.speed * rate * dt.dtSec
          if (o.x < -o.size) {
            o.x = width + o.size
            o.y = ctx.rng.intRange(20, height - 20)
            o.speed = ctx.rng.intRange(160, 320)
          }
          o.g.position.set(o.x, o.y)
        }
      },
    }
  },
}

const verticalScroller: PatternDemo = {
  id: 'vertical-scroller-style',
  controls: { stick: { left: 'left', right: 'right' } },
  name: 'Vertical-scroller-style',
  caption: 'Steer the bottom ship with ← → / A D; obstacles descend endlessly.',
  category: 'system',
  params: [
    { key: 'scroll', label: 'Scroll rate', min: 0.3, max: 2.5, step: 0.1, default: 1, unit: '×' },
  ],
  mount(ctx) {
    const { width, height, params, input } = ctx
    const root = new Container()
    ctx.stage.addChild(root)
    hint(ctx, '← → / A D : steer')

    const stars: { g: Graphics; x: number; y: number; speed: number }[] = []
    for (let i = 0; i < 40; i++) {
      const g = new Graphics().circle(0, 0, ctx.rng.chance(0.5) ? 1.5 : 2.5).fill(COLORS.faint)
      root.addChild(g)
      stars.push({
        g,
        x: ctx.rng.intRange(0, width),
        y: ctx.rng.intRange(0, height),
        speed: ctx.rng.intRange(60, 200),
      })
    }

    const ship = new Graphics().poly([0, -16, 12, 12, -12, 12]).fill(COLORS.accent)
    let sx = width / 2
    ship.position.set(sx, height - FLOOR_INSET - 12)
    root.addChild(ship)

    interface Ob {
      g: Graphics
      x: number
      y: number
      speed: number
      size: number
    }
    const obstacles: Ob[] = []
    const respawn = (o: Ob): void => {
      o.size = ctx.rng.intRange(22, 44)
      o.x = ctx.rng.intRange(20, width - 20)
      o.y = -o.size
      o.speed = ctx.rng.intRange(120, 260)
      // Redraw only when the size changes (here), not every frame.
      o.g
        .clear()
        .roundRect(-o.size / 2, -o.size / 2, o.size, o.size, 5)
        .fill(COLORS.rowActive)
    }
    for (let i = 0; i < 5; i++) {
      const g = new Graphics()
      root.addChild(g)
      const o: Ob = { g, x: 0, y: 0, speed: 0, size: 0 }
      respawn(o)
      o.y = ctx.rng.intRange(0, height)
      obstacles.push(o)
    }

    return {
      update: (dt) => {
        const rate = params.get('scroll')
        const s = dt.dtSec
        for (const st of stars) {
          st.y += st.speed * rate * s
          if (st.y > height) {
            st.y = 0
            st.x = ctx.rng.intRange(0, width)
          }
          st.g.position.set(st.x, st.y)
        }
        sx = clamp(sx + axis(input, 'left', 'right') * 320 * s, 14, width - 14)
        ship.x = sx
        for (const o of obstacles) {
          o.y += o.speed * rate * s
          if (o.y > height + o.size) respawn(o)
          o.g.position.set(o.x, o.y)
        }
      },
    }
  },
}

const shmup: PatternDemo = {
  id: 'shmup-style',
  controls: { stick: { left: 'left', right: 'right', up: 'up', down: 'down' } },
  name: 'Shmup-style',
  caption: 'Move + auto-fire; enemies spray radial bullet patterns (bullet-hell).',
  category: 'system',
  params: [
    { key: 'speed', label: 'Move speed', min: 160, max: 520, step: 20, default: 320, unit: 'px/s' },
    { key: 'fire', label: 'Fire rate', min: 2, max: 18, step: 1, default: 8, unit: '/s' },
    { key: 'spray', label: 'Enemy spray', min: 4, max: 24, step: 1, default: 12, unit: '' },
  ],
  mount(ctx) {
    const { width, height, input, params } = ctx
    const root = new Container()
    ctx.stage.addChild(root)
    hint(ctx, '← → ↑ ↓ / WASD : move · auto-fire')

    const floor = height - FLOOR_INSET
    const ship = new Graphics().poly([0, -14, 11, 11, -11, 11]).fill(COLORS.accent)
    let sx = width / 2
    let sy = floor * 0.75
    root.addChild(ship)

    interface Dot {
      g: Graphics
      x: number
      y: number
      vx: number
      vy: number
      live: boolean
    }
    const shots: Dot[] = []
    const bullets: Dot[] = []
    const makePool = (n: number, color: number, r: number): Dot[] => {
      const pool: Dot[] = []
      for (let i = 0; i < n; i++) {
        const g = new Graphics().circle(0, 0, r).fill(color)
        g.visible = false
        root.addChild(g)
        pool.push({ g, x: 0, y: 0, vx: 0, vy: 0, live: false })
      }
      return pool
    }
    shots.push(...makePool(40, COLORS.text, 3))
    bullets.push(...makePool(160, 0xff6bd1, 4))
    const fire = (pool: Dot[], x: number, y: number, vx: number, vy: number): void => {
      const d = pool.find((p) => !p.live)
      if (!d) return
      d.live = true
      d.x = x
      d.y = y
      d.vx = vx
      d.vy = vy
      d.g.visible = true
    }

    // Two enemies sweeping near the top.
    const enemies = [0.32, 0.68].map((fx) => {
      const g = new Graphics().rect(-16, -12, 32, 24).fill(COLORS.rowActive)
      g.position.set(width * fx, floor * 0.18)
      root.addChild(g)
      return { g, baseX: width * fx, t: ctx.rng.next() * 6 }
    })

    let fireT = 0
    let enemyT = 0
    return {
      update: (dt) => {
        const s = dt.dtSec
        const move = params.get('speed') * s
        sx = clamp(sx + axis(input, 'left', 'right') * move, 12, width - 12)
        sy = clamp(sy + axis(input, 'up', 'down') * move, 12, floor - 12)
        ship.position.set(sx, sy)

        // Player auto-fire upward.
        fireT -= s
        if (fireT <= 0) {
          fireT = 1 / params.get('fire')
          fire(shots, sx, sy - 16, 0, -640)
        }
        for (const d of shots) {
          if (!d.live) continue
          d.y += d.vy * s
          if (d.y < -10) {
            d.live = false
            d.g.visible = false
          }
          d.g.position.set(d.x, d.y)
        }

        // Enemies sweep and periodically spray a ring of bullets.
        for (const e of enemies) {
          e.t += s
          e.g.x = e.baseX + Math.sin(e.t) * 70
        }
        enemyT -= s
        if (enemyT <= 0) {
          enemyT = 1.1
          const n = Math.round(params.get('spray'))
          for (const e of enemies) {
            for (let i = 0; i < n; i++) {
              const a = (i / n) * Math.PI * 2
              fire(bullets, e.g.x, e.g.y, Math.cos(a) * 150, Math.sin(a) * 150)
            }
          }
        }
        for (const b of bullets) {
          if (!b.live) continue
          b.x += b.vx * s
          b.y += b.vy * s
          if (b.x < -10 || b.x > width + 10 || b.y < -10 || b.y > floor + 10) {
            b.live = false
            b.g.visible = false
          }
          b.g.position.set(b.x, b.y)
        }
      },
    }
  },
}

const autoRunner: PatternDemo = {
  id: 'auto-runner-style',
  controls: { a: { action: 'action', label: 'JUMP' } },
  name: 'Auto-runner-style',
  caption: 'The world scrolls itself; your only verb is a timed jump (Flappy / runner).',
  category: 'system',
  params: [
    { key: 'speed', label: 'Run speed', min: 120, max: 520, step: 20, default: 300, unit: 'px/s' },
    { key: 'jump', label: 'Jump power', min: 400, max: 1000, step: 20, default: 700, unit: 'px/s' },
  ],
  mount(ctx) {
    const { width, height, input, params } = ctx
    const root = new Container()
    ctx.stage.addChild(root)
    hint(ctx, 'Space : jump (auto-running)')

    const groundY = height - FLOOR_INSET
    const GRAVITY = 2200
    root.addChild(new Graphics().rect(0, groundY, width, height - groundY).fill(COLORS.border))

    const runnerX = width * 0.28
    const player = new Graphics().roundRect(-11, -30, 22, 30, 5).fill(COLORS.accent)
    let py = groundY
    let vy = 0
    let grounded = true
    player.position.set(runnerX, py)
    root.addChild(player)

    interface Block {
      g: Graphics
      x: number
      h: number
    }
    const blocks: Block[] = []
    const respawn = (b: Block, fromX: number): void => {
      b.h = ctx.rng.intRange(26, 64)
      b.x = fromX + ctx.rng.intRange(220, 360)
      b.g.clear().roundRect(-16, -b.h, 32, b.h, 5).fill(COLORS.rowActive)
    }
    let lastX = width
    for (let i = 0; i < 4; i++) {
      const g = new Graphics()
      root.addChild(g)
      const b: Block = { g, x: 0, h: 0 }
      respawn(b, lastX)
      lastX = b.x
      blocks.push(b)
    }

    return {
      update: (dt) => {
        const s = dt.dtSec
        const speed = params.get('speed')
        if (grounded && input.wasJustPressed('action')) {
          vy = -params.get('jump')
          grounded = false
        }
        vy += GRAVITY * s
        py += vy * s
        if (py >= groundY) {
          py = groundY
          vy = 0
          grounded = true
        }
        player.position.set(runnerX, py)

        const rightmost = () => blocks.reduce((m, b) => Math.max(m, b.x), 0)
        for (const b of blocks) {
          b.x -= speed * s
          if (b.x < -40) respawn(b, rightmost())
          b.g.position.set(b.x, groundY)
        }
      },
    }
  },
}

const snake: PatternDemo = {
  id: 'snake-style',
  controls: { stick: { left: 'left', right: 'right', up: 'up', down: 'down' } },
  name: 'Snake-style',
  caption: 'Grid snake: turn with ← → ↑ ↓ (no reverse), eat to grow, crash to reset.',
  category: 'system',
  params: [
    { key: 'speed', label: 'Step interval', min: 60, max: 320, step: 10, default: 130, unit: 'ms' },
  ],
  mount(ctx) {
    const { width, input, params, theme, rng } = ctx
    const root = new Container()
    ctx.stage.addChild(root)
    hint(ctx, '← → ↑ ↓ : turn (no reverse) · eat to grow')

    const top = 24
    const fieldH = ctx.height - FLOOR_INSET - 6 - top
    const cols = 15
    const rows = 11
    const cell = Math.floor(Math.min(width / cols, fieldH / rows))
    const gx = Math.floor((width - cols * cell) / 2)
    const gy = top + Math.floor((fieldH - rows * cell) / 2)
    root.addChild(
      new Graphics()
        .rect(gx, gy, cols * cell, rows * cell)
        .stroke({ color: COLORS.border, width: 1 }),
    )
    const g = new Graphics()
    root.addChild(g)
    const scoreText = text('LEN 3', {
      fill: COLORS.accent,
      fontSize: 15,
      fontFamily: theme.fontMono,
    })
    scoreText.position.set(gx, 2)
    root.addChild(scoreText)

    interface Cell {
      c: number
      r: number
    }
    let body: Cell[] = []
    let dir = { c: 1, r: 0 }
    let pending = { c: 1, r: 0 }
    let food: Cell = { c: 0, r: 0 }

    const placeFood = (): void => {
      for (let tries = 0; tries < 200; tries++) {
        const c = rng.intRange(0, cols - 1)
        const r = rng.intRange(0, rows - 1)
        if (!body.some((s) => s.c === c && s.r === r)) {
          food = { c, r }
          return
        }
      }
    }
    const reset = (): void => {
      const cr = Math.floor(rows / 2)
      body = [
        { c: 4, r: cr },
        { c: 3, r: cr },
        { c: 2, r: cr },
      ]
      dir = { c: 1, r: 0 }
      pending = { c: 1, r: 0 }
      placeFood()
    }

    const render = (): void => {
      g.clear()
      g.roundRect(gx + food.c * cell + 2, gy + food.r * cell + 2, cell - 4, cell - 4, 4).fill(
        0xff6bd1,
      )
      body.forEach((s, i) => {
        g.roundRect(gx + s.c * cell + 1, gy + s.r * cell + 1, cell - 2, cell - 2, 4).fill(
          i === 0 ? COLORS.text : COLORS.accent,
        )
      })
      scoreText.text = `LEN ${body.length}`
    }
    reset()
    render()

    let stepT = 0
    return {
      update: (dt) => {
        // Queue a turn (ignore reversals).
        const nx = axis(input, 'left', 'right')
        const ny = axis(input, 'up', 'down')
        if (input.wasJustPressed('left') || input.wasJustPressed('right')) {
          if (nx !== 0 && nx !== -dir.c) pending = { c: nx, r: 0 }
        }
        if (input.wasJustPressed('up') || input.wasJustPressed('down')) {
          if (ny !== 0 && ny !== -dir.r) pending = { c: 0, r: ny }
        }

        stepT += dt.dtMs
        if (stepT < params.get('speed')) return
        stepT = 0
        dir = pending
        const head = body[0]
        if (!head) return
        const nh = { c: head.c + dir.c, r: head.r + dir.r }
        const grow = nh.c === food.c && nh.r === food.r
        const hitWall = nh.c < 0 || nh.c >= cols || nh.r < 0 || nh.r >= rows
        const checkAgainst = grow ? body : body.slice(0, -1)
        const hitSelf = checkAgainst.some((s) => s.c === nh.c && s.r === nh.r)
        if (hitWall || hitSelf) {
          reset()
          render()
          return
        }
        body.unshift(nh)
        if (grow) placeFood()
        else body.pop()
        render()
      },
    }
  },
}

export const arcadeDemos: PatternDemo[] = [endlessDodge, verticalScroller, shmup, autoRunner, snake]
