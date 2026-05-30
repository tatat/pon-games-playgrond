import { Container, Graphics, type Text as PixiText, SplitText } from 'pixi.js'
import type { Rng } from '../../../engine/rng'
import { COLORS, RADIUS } from '../constants'
import type { DemoContext, PatternDemo } from '../demo'
import { text } from '../demo-util'

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

/** Gap from the bottom edge to the hint line. */
const HINT_GAP = 6
/** Bottom strip reserved for the hint (≈ hint height + a gap above it). A
 * bottom-anchored player's lowest point sits at `height - FLOOR_INSET`, leaving
 * ~6px of clearance above the hint text. */
const FLOOR_INSET = 30

/** Footer line naming the controls. The archetypes are keyboard-only — there
 * is no pointer-driven gameplay in this catalog. */
function hint(ctx: DemoContext, message: string): void {
  const t = text(message, { fill: COLORS.faint, fontSize: 13, fontFamily: ctx.theme.fontMono })
  t.anchor.set(0.5, 1)
  t.position.set(ctx.width / 2, ctx.height - HINT_GAP)
  ctx.stage.addChild(t)
}

/** -1 / 0 / +1 from a pair of held actions. */
const axis = (input: DemoContext['input'], neg: string, pos: string): number =>
  (input.isDown(pos) ? 1 : 0) - (input.isDown(neg) ? 1 : 0)

const breakout: PatternDemo = {
  id: 'breakout-style',
  name: 'Breakout-style',
  caption: 'Paddle + bouncing ball + brick grid. Move with ← → / A D.',
  category: 'system',
  params: [
    {
      key: 'ballSpeed',
      label: 'Ball speed',
      min: 120,
      max: 560,
      step: 20,
      default: 300,
      unit: 'px/s',
    },
    {
      key: 'paddleW',
      label: 'Paddle width',
      min: 60,
      max: 240,
      step: 10,
      default: 120,
      unit: 'px',
    },
  ],
  mount(ctx) {
    const { width, height, params, input } = ctx
    const root = new Container()
    ctx.stage.addChild(root)
    hint(ctx, '← → / A D : move paddle')

    const ph = 14
    let curPw = params.get('paddleW')
    const paddle = new Graphics()
    const drawPaddle = (w: number): void => {
      paddle
        .clear()
        .roundRect(-w / 2, -ph / 2, w, ph, 6)
        .fill(COLORS.accent)
    }
    drawPaddle(curPw)
    paddle.position.set(width / 2, height - FLOOR_INSET - ph / 2)
    root.addChild(paddle)

    const r = 9
    const ball = new Graphics().circle(0, 0, r).fill(COLORS.text)
    root.addChild(ball)
    let bx = width / 2
    let by = height / 2
    let vx = 180
    let vy = -240

    interface Brick {
      g: Graphics
      x: number
      y: number
      w: number
      h: number
      alive: boolean
    }
    const cols = 8
    const rows = 3
    const gap = 8
    const bw = (width - gap * (cols + 1)) / cols
    const bh = 22
    const bricks: Brick[] = []
    const buildBricks = (): void => {
      for (const b of bricks) b.g.destroy()
      bricks.length = 0
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = gap + col * (bw + gap)
          const y = 8 + row * (bh + gap)
          const g = new Graphics().roundRect(0, 0, bw, bh, 4).fill(COLORS.rowActive)
          g.position.set(x, y)
          root.addChild(g)
          bricks.push({ g, x, y, w: bw, h: bh, alive: true })
        }
      }
    }
    buildBricks()

    const reset = (): void => {
      bx = width / 2
      by = height / 2
      const sp = params.get('ballSpeed')
      vx = (ctx.rng.chance(0.5) ? 1 : -1) * sp * 0.6
      vy = -sp * 0.8
    }

    return {
      update: (dt) => {
        const s = dt.dtSec
        const pw = params.get('paddleW')
        if (pw !== curPw) {
          curPw = pw
          drawPaddle(pw)
        }
        // Keep direction, scale magnitude to the live target speed.
        const target = params.get('ballSpeed')
        const cur = Math.hypot(vx, vy) || 1
        const k = target / cur
        vx *= k
        vy *= k

        paddle.x = clamp(paddle.x + axis(input, 'left', 'right') * 520 * s, pw / 2, width - pw / 2)
        bx += vx * s
        by += vy * s
        if (bx < r) {
          bx = r
          vx = Math.abs(vx)
        } else if (bx > width - r) {
          bx = width - r
          vx = -Math.abs(vx)
        }
        if (by < r) {
          by = r
          vy = Math.abs(vy)
        }
        const ptop = paddle.y - ph / 2
        if (
          vy > 0 &&
          by + r >= ptop &&
          by + r <= ptop + ph + 12 &&
          Math.abs(bx - paddle.x) <= pw / 2 + r
        ) {
          by = ptop - r
          vy = -Math.abs(vy)
          vx += (bx - paddle.x) * 2
        }
        let aliveCount = 0
        for (const b of bricks) {
          if (!b.alive) continue
          aliveCount++
          if (bx + r > b.x && bx - r < b.x + b.w && by + r > b.y && by - r < b.y + b.h) {
            b.alive = false
            b.g.visible = false
            vy = -vy
          }
        }
        if (aliveCount === 0) buildBricks()
        if (by - r > height) reset()
        ball.position.set(bx, by)
      },
    }
  },
}

const endlessDodge: PatternDemo = {
  id: 'endless-dodge-style',
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

const aimLaunch: PatternDemo = {
  id: 'aim-launch-style',
  name: 'Aim-launch-style',
  caption: 'Aim with ← →, launch with Space; the ball bounces then resets.',
  category: 'system',
  params: [
    {
      key: 'power',
      label: 'Launch power',
      min: 200,
      max: 900,
      step: 20,
      default: 520,
      unit: 'px/s',
    },
  ],
  mount(ctx) {
    const { width, height, params, input } = ctx
    const root = new Container()
    ctx.stage.addChild(root)
    hint(ctx, '← → : aim · Space : launch')

    const origin = { x: width / 2, y: height - FLOOR_INSET - 6 }
    const aim = new Graphics()
    root.addChild(aim)
    const ball = new Graphics().circle(0, 0, 10).fill(COLORS.accent)
    ball.visible = false
    root.addChild(ball)
    const phaseLabel = text('AIM', {
      fill: COLORS.muted,
      fontSize: 16,
      fontFamily: ctx.theme.fontMono,
    })
    phaseLabel.position.set(0, 0)
    root.addChild(phaseLabel)

    let angle = -Math.PI / 2 // straight up
    let flying = false
    let bx = origin.x
    let by = origin.y
    let vx = 0
    let vy = 0
    let flightMs = 0
    // Only re-rasterize the label / redraw the aim line when they change.
    let phaseText = ''
    let lastAngle = Number.NaN
    const setPhase = (t: string): void => {
      if (phaseText === t) return
      phaseText = t
      phaseLabel.text = t
    }

    return {
      update: (dt) => {
        if (!flying) {
          setPhase('AIM')
          // Sweep the aim left/right within an upward cone.
          angle = clamp(
            angle + axis(input, 'left', 'right') * 2.4 * dt.dtSec,
            -Math.PI * 0.92,
            -Math.PI * 0.08,
          )
          const ux = Math.cos(angle)
          const uy = Math.sin(angle)
          if (angle !== lastAngle) {
            lastAngle = angle
            aim
              .clear()
              .moveTo(origin.x, origin.y)
              .lineTo(origin.x + ux * 90, origin.y + uy * 90)
              .stroke({ color: COLORS.accent, width: 3 })
            aim.circle(origin.x, origin.y, 6).fill(COLORS.text)
          }
          if (input.wasJustPressed('action')) {
            flying = true
            flightMs = 0
            bx = origin.x
            by = origin.y
            const speed = params.get('power')
            vx = ux * speed
            vy = uy * speed
            ball.visible = true
          }
        } else {
          if (phaseText !== 'FLY') {
            setPhase('FLY')
            aim.clear()
            lastAngle = Number.NaN
          }
          flightMs += dt.dtMs
          const s = dt.dtSec
          bx += vx * s
          by += vy * s
          const r = 10
          if (bx < r || bx > width - r) vx = -vx
          if (by < r || by > height - r) vy = -vy
          bx = clamp(bx, r, width - r)
          by = clamp(by, r, height - r)
          ball.position.set(bx, by)
          if (flightMs > 2500) {
            flying = false
            ball.visible = false
          }
        }
      },
    }
  },
}

const twinStick: PatternDemo = {
  id: 'twin-stick-style',
  name: 'Twin-stick-style',
  caption: 'Move with WASD, aim with the arrow keys (independent clusters).',
  category: 'system',
  params: [
    { key: 'speed', label: 'Move speed', min: 120, max: 480, step: 20, default: 260, unit: 'px/s' },
  ],
  mount(ctx) {
    const { width, height, input, params } = ctx
    const root = new Container()
    ctx.stage.addChild(root)
    hint(ctx, 'WASD : move · ← → ↑ ↓ : aim')

    const ship = new Graphics().poly([18, 0, -12, 12, -4, 0, -12, -12]).fill(COLORS.accent)
    let sx = width / 2
    let sy = height / 2
    let aim = 0
    root.addChild(ship)

    return {
      update: (dt) => {
        const speed = params.get('speed') * dt.dtSec
        sx = clamp(sx + axis(input, 'moveLeft', 'moveRight') * speed, 16, width - 16)
        sy = clamp(sy + axis(input, 'moveUp', 'moveDown') * speed, 16, height - FLOOR_INSET - 16)
        ship.position.set(sx, sy)
        // Aim cluster (arrows) sets the facing; hold to keep it.
        const ax = axis(input, 'aimLeft', 'aimRight')
        const ay = axis(input, 'aimUp', 'aimDown')
        if (ax !== 0 || ay !== 0) aim = Math.atan2(ay, ax)
        ship.rotation = aim
      },
    }
  },
}

const singleStick: PatternDemo = {
  id: 'single-stick-style',
  name: 'Single-stick-style',
  caption: 'Move with ← → ↑ ↓ / WASD; the ship turns to face its travel direction.',
  category: 'system',
  params: [
    { key: 'speed', label: 'Move speed', min: 120, max: 480, step: 20, default: 260, unit: 'px/s' },
  ],
  mount(ctx) {
    const { width, height, input, params } = ctx
    const root = new Container()
    ctx.stage.addChild(root)
    hint(ctx, '← → ↑ ↓ / WASD : move (faces travel)')

    const ship = new Graphics().poly([18, 0, -12, 12, -4, 0, -12, -12]).fill(COLORS.accent)
    let sx = width / 2
    let sy = height / 2
    let facing = 0
    root.addChild(ship)

    return {
      update: (dt) => {
        const speed = params.get('speed') * dt.dtSec
        const mx = axis(input, 'left', 'right')
        const my = axis(input, 'up', 'down')
        sx = clamp(sx + mx * speed, 16, width - 16)
        sy = clamp(sy + my * speed, 16, height - FLOOR_INSET - 16)
        ship.position.set(sx, sy)
        // Single stick: heading follows movement (only when actually moving).
        if (mx !== 0 || my !== 0) facing = Math.atan2(my, mx)
        ship.rotation = facing
      },
    }
  },
}

const platformer: PatternDemo = {
  id: 'platformer-style',
  name: 'Platformer-style',
  caption: 'Run, multi-jump, dash, wall-cling + wall-jump — side-scroll Metroidvania kit.',
  category: 'system',
  params: [
    { key: 'speed', label: 'Move speed', min: 120, max: 420, step: 20, default: 220, unit: 'px/s' },
    { key: 'jump', label: 'Jump power', min: 400, max: 1000, step: 20, default: 680, unit: 'px/s' },
    { key: 'jumps', label: 'Max jumps', min: 1, max: 3, step: 1, default: 2, unit: '×' },
    { key: 'dash', label: 'Dash speed', min: 0, max: 900, step: 30, default: 540, unit: 'px/s' },
  ],
  mount(ctx) {
    const { width, height, input, params } = ctx
    const root = new Container()
    ctx.stage.addChild(root)
    hint(ctx, '← → run · Space jump (multi) · Shift / J dash')

    const groundY = height - FLOOR_INSET
    const worldW = Math.max(width * 2.2, 1200)
    const GRAVITY = 2000

    const bg = new Container()
    root.addChild(bg)
    for (let x = 40; x < worldW; x += 160) {
      const ph = ctx.rng.intRange(60, 180)
      bg.addChild(new Graphics().rect(x, groundY - ph, 60, ph).fill(0x20222e))
    }

    const world = new Container()
    root.addChild(world)
    world.addChild(new Graphics().rect(0, groundY, worldW, height - groundY).fill(COLORS.border))

    // One-way platforms (land from above); `y` is the top surface.
    const platforms = [
      { x: 140, y: groundY - 88, w: 120 },
      { x: 360, y: groundY - 158, w: 150 },
      { x: 660, y: groundY - 96, w: 120 },
      { x: 880, y: groundY - 196, w: 160 },
      { x: 1120, y: groundY - 120, w: 130 },
    ]
    for (const p of platforms) {
      world.addChild(new Graphics().roundRect(p.x, p.y, p.w, 14, 6).fill(COLORS.rowActive))
    }
    // A wall-jump shaft: two solid pillars to cling to and kick between.
    const walls = [
      { x: 506, y: groundY - 230, w: 14, h: 230 },
      { x: 560, y: groundY - 230, w: 14, h: 230 },
    ]
    for (const w of walls) {
      world.addChild(new Graphics().rect(w.x, w.y, w.w, w.h).fill(COLORS.faint))
    }

    const pw = 22
    const phh = 30
    const player = new Container()
    const body = new Graphics().roundRect(-pw / 2, -phh, pw, phh, 5).fill(COLORS.accent)
    const eye = new Graphics().rect(0, -phh + 6, 6, 6).fill(COLORS.panelDeep)
    player.addChild(body, eye)
    world.addChild(player)

    let px = width * 0.4
    let py = groundY
    let vy = 0
    let facing = 1
    let grounded = true
    let jumpsLeft = 2
    let touchingWall = 0 // -1 wall on left, +1 wall on right, 0 none
    let overrideVX = 0
    let overrideTimer = 0
    let dashCd = 0

    return {
      update: (dt) => {
        const s = dt.dtSec
        const moveSpeed = params.get('speed')
        const jumpV = params.get('jump')
        const maxJumps = Math.round(params.get('jumps'))
        const dashSpeed = params.get('dash')

        const mx = axis(input, 'left', 'right')
        if (mx !== 0) facing = mx

        // Dash: a brief horizontal burst that overrides input.
        dashCd -= s
        if (input.wasJustPressed('dash') && dashSpeed > 0 && dashCd <= 0) {
          overrideVX = facing * dashSpeed
          overrideTimer = 0.16
          dashCd = 0.6
        }
        // Jump: wall-jump > ground/air jump (capped by Max jumps).
        if (input.wasJustPressed('action')) {
          if (touchingWall !== 0 && !grounded) {
            vy = -jumpV
            overrideVX = -touchingWall * moveSpeed * 1.2
            overrideTimer = 0.18
            jumpsLeft = maxJumps - 1
          } else if (grounded) {
            vy = -jumpV
            jumpsLeft = maxJumps - 1
          } else if (jumpsLeft > 0) {
            vy = -jumpV
            jumpsLeft--
          }
        }

        // Horizontal move (override beats input while a dash/kick is active).
        overrideTimer -= s
        const vx = overrideTimer > 0 ? overrideVX : mx * moveSpeed
        const prevPx = px
        px = clamp(px + vx * s, pw / 2, worldW - pw / 2)

        // Gravity, with wall-slide damping when pressing into a wall.
        const prevFeet = py
        vy += GRAVITY * s
        if (!grounded && touchingWall !== 0 && Math.sign(mx) === touchingWall && vy > 0) {
          vy = Math.min(vy, 90)
        }
        py += vy * s

        // Land on the ground, platform tops, or wall tops.
        grounded = false
        if (py >= groundY && vy >= 0) {
          py = groundY
          vy = 0
          grounded = true
        }
        if (vy >= 0) {
          for (const p of [...platforms, ...walls.map((w) => ({ x: w.x, y: w.y, w: w.w }))]) {
            if (px > p.x && px < p.x + p.w && prevFeet <= p.y && py >= p.y) {
              py = p.y
              vy = 0
              grounded = true
            }
          }
        }
        if (grounded) jumpsLeft = maxJumps

        // Resolve wall sides (after the final feet height is known).
        touchingWall = 0
        for (const w of walls) {
          if (py - phh < w.y + w.h && py > w.y && px + pw / 2 > w.x && px - pw / 2 < w.x + w.w) {
            if (prevPx <= w.x) {
              px = w.x - pw / 2
              touchingWall = 1
            } else if (prevPx >= w.x + w.w) {
              px = w.x + w.w + pw / 2
              touchingWall = -1
            }
          }
        }

        player.position.set(px, py)
        eye.x = facing > 0 ? 2 : -8

        const camX = clamp(px - width / 2, 0, worldW - width)
        world.x = -camX
        bg.x = -camX * 0.5
      },
    }
  },
}

const tank: PatternDemo = {
  id: 'tank-style',
  name: 'Tank-style',
  caption: 'Rotate with ← →, drive forward/back with ↑ ↓ (tank controls).',
  category: 'system',
  params: [
    { key: 'speed', label: 'Drive speed', min: 80, max: 360, step: 20, default: 200, unit: 'px/s' },
    { key: 'turn', label: 'Turn rate', min: 60, max: 360, step: 20, default: 180, unit: '°/s' },
  ],
  mount(ctx) {
    const { width, height, input, params } = ctx
    const root = new Container()
    ctx.stage.addChild(root)
    hint(ctx, '← → : turn · ↑ ↓ : drive')

    const ship = new Graphics().poly([18, 0, -12, 12, -4, 0, -12, -12]).fill(COLORS.accent)
    let x = width / 2
    let y = (height - FLOOR_INSET) / 2
    let angle = -Math.PI / 2
    root.addChild(ship)

    return {
      update: (dt) => {
        angle += axis(input, 'left', 'right') * (params.get('turn') * (Math.PI / 180)) * dt.dtSec
        const fwd = axis(input, 'down', 'up') * params.get('speed') * dt.dtSec
        x = clamp(x + Math.cos(angle) * fwd, 16, width - 16)
        y = clamp(y + Math.sin(angle) * fwd, 16, height - FLOOR_INSET - 16)
        ship.position.set(x, y)
        ship.rotation = angle
      },
    }
  },
}

const inertia: PatternDemo = {
  id: 'inertia-style',
  name: 'Inertia-style',
  caption: 'Asteroids thrust: turn, accelerate along facing, drift with momentum.',
  category: 'system',
  params: [
    { key: 'thrust', label: 'Thrust', min: 200, max: 1400, step: 50, default: 700, unit: 'px/s²' },
    { key: 'turn', label: 'Turn rate', min: 90, max: 540, step: 20, default: 280, unit: '°/s' },
    { key: 'drag', label: 'Drag', min: 0, max: 2, step: 0.1, default: 0.6, unit: '/s' },
  ],
  mount(ctx) {
    const { width, height, input, params } = ctx
    const root = new Container()
    ctx.stage.addChild(root)
    hint(ctx, '← → : turn · ↑ : thrust (wraps at edges)')

    const ship = new Graphics().poly([16, 0, -10, 9, -10, -9]).fill(COLORS.accent)
    const floor = height - FLOOR_INSET
    let x = width / 2
    let y = floor / 2
    let angle = -Math.PI / 2
    let vx = 0
    let vy = 0
    root.addChild(ship)

    return {
      update: (dt) => {
        const s = dt.dtSec
        angle += axis(input, 'left', 'right') * (params.get('turn') * (Math.PI / 180)) * s
        if (input.isDown('up')) {
          const a = params.get('thrust')
          vx += Math.cos(angle) * a * s
          vy += Math.sin(angle) * a * s
        }
        const drag = Math.max(0, 1 - params.get('drag') * s)
        vx *= drag
        vy *= drag
        x = (x + vx * s + width) % width
        y = (y + vy * s + floor) % floor
        ship.position.set(x, y)
        ship.rotation = angle
      },
    }
  },
}

const autoRunner: PatternDemo = {
  id: 'auto-runner-style',
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

const shmup: PatternDemo = {
  id: 'shmup-style',
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

const gridMove: PatternDemo = {
  id: 'grid-move-style',
  name: 'Grid-move-style',
  caption: 'Step cell-to-cell on a tile grid (top-down Zelda / roguelike movement).',
  category: 'system',
  params: [
    { key: 'cell', label: 'Cell size', min: 28, max: 72, step: 4, default: 44, unit: 'px' },
    { key: 'step', label: 'Step time', min: 60, max: 320, step: 20, default: 130, unit: 'ms' },
  ],
  mount(ctx) {
    const { width, height, input, params } = ctx
    const root = new Container()
    ctx.stage.addChild(root)
    hint(ctx, '← → ↑ ↓ / WASD : step (cell by cell)')

    const floor = height - FLOOR_INSET
    const grid = new Graphics()
    root.addChild(grid)
    const player = new Graphics().roundRect(-14, -14, 28, 28, 6).fill(COLORS.accent)
    root.addChild(player)

    // Cell-indexed position; the sprite lerps from previous to target cell.
    let cell = params.get('cell')
    let cols = Math.floor(width / cell)
    let rows = Math.floor(floor / cell)
    let cx = Math.floor(cols / 2)
    let cy = Math.floor(rows / 2)
    let fromX = 0
    let fromY = 0
    let moveT = 1 // 1 = settled
    const cellCenter = (i: number, n: number, span: number): number =>
      (span - n * cell) / 2 + i * cell + cell / 2

    const drawGrid = (): void => {
      grid.clear()
      for (let i = 0; i <= cols; i++) {
        const x = (width - cols * cell) / 2 + i * cell
        grid.moveTo(x, (floor - rows * cell) / 2).lineTo(x, (floor - rows * cell) / 2 + rows * cell)
      }
      for (let j = 0; j <= rows; j++) {
        const y = (floor - rows * cell) / 2 + j * cell
        grid.moveTo((width - cols * cell) / 2, y).lineTo((width - cols * cell) / 2 + cols * cell, y)
      }
      grid.stroke({ color: COLORS.border, width: 1 })
    }
    let lastCell = cell
    drawGrid()

    return {
      update: (dt) => {
        cell = params.get('cell')
        if (cell !== lastCell) {
          lastCell = cell
          cols = Math.floor(width / cell)
          rows = Math.floor(floor / cell)
          cx = clamp(cx, 0, cols - 1)
          cy = clamp(cy, 0, rows - 1)
          drawGrid()
        }
        const stepMs = params.get('step')
        moveT = Math.min(1, moveT + dt.dtMs / stepMs)
        if (moveT >= 1) {
          // 4-directional: take one axis per step (horizontal wins ties), so
          // holding two keys never produces a diagonal move.
          const dx = axis(input, 'left', 'right')
          const dy = axis(input, 'up', 'down')
          let tx = cx
          let ty = cy
          if (dx !== 0) tx = clamp(cx + Math.sign(dx), 0, cols - 1)
          else if (dy !== 0) ty = clamp(cy + Math.sign(dy), 0, rows - 1)
          if (tx !== cx || ty !== cy) {
            fromX = cx
            fromY = cy
            cx = tx
            cy = ty
            moveT = 0
          }
        }
        const ease = moveT * moveT * (3 - 2 * moveT)
        const ix = fromX + (cx - fromX) * ease
        const iy = fromY + (cy - fromY) * ease
        player.position.set(cellCenter(ix, cols, width), cellCenter(iy, rows, floor))
      },
    }
  },
}

const adv: PatternDemo = {
  id: 'adv-style',
  name: 'ADV / novel-style',
  caption: 'Typewriter dialogue you advance line by line — tap-to-progress (mobile VN).',
  category: 'system',
  params: [
    { key: 'cps', label: 'Type speed', min: 8, max: 80, step: 2, default: 36, unit: 'c/s' },
    { key: 'auto', label: 'Auto-advance', min: 0, max: 4000, step: 200, default: 0, unit: 'ms' },
  ],
  mount(ctx) {
    const { width, height, input, params, theme } = ctx
    const root = new Container()
    ctx.stage.addChild(root)
    hint(ctx, 'Space : advance (reveal-all, then next line)')

    const script = [
      {
        who: 0,
        name: 'ユウ',
        text: 'ねえ……今、足音しなかった？ この階、私たちしかいないはずだよね。',
      },
      {
        who: 1,
        name: 'アキ',
        text: '……気のせいだよ。ね、そう言ってよ。さっきから廊下の電気、点いたままだし。',
      },
      {
        who: 0,
        name: 'ユウ',
        text: '私、さっき確かに消したの。三番目の部屋の前で。なのに、どうして……。',
      },
      { who: 1, name: 'アキ', text: 'ユウ。……後ろ、振り向かないで。ゆっくり、私の手を握って。' },
    ]

    const boxH = 120
    // Sit the balloon above the hint with the same gap the hint has below it:
    //   hint bottom = height - HINT_GAP, hint is ~16px tall, then another
    //   HINT_GAP above it → boxBottom = height - 2*HINT_GAP - 16.
    const boxBottom = height - 2 * HINT_GAP - 16
    const boxY = boxBottom - boxH
    const boxX = 12
    const boxW = width - 24

    // Bust silhouette (waist/chest up). Drawn as a single white shape and
    // recoloured by `tint`, so active/inactive never relies on alpha — that
    // avoids the seam where head meets shoulders, and the busts are placed far
    // enough apart not to overlap each other. The dialogue box (added after)
    // crops the lower torso for a natural bust framing.
    const DIM = 0x40445a
    const CYAN = 0x6ad1ff
    const PINK = 0xff6bd1
    // Origin sits at the dialogue-box top; the bust is drawn upward from there
    // so the box crops the lower torso. The head top lands at height/3, so the
    // figure occupies the bottom two-thirds of the stage. Pushed to the edges.
    const headR = 55
    const headCy = height / 3 + headR - boxY
    const makeBust = (): Graphics => {
      const g = new Graphics()
      g.circle(0, headCy, headR).fill(0xffffff)
      // Torso overlaps the head bottom by ~6px (head raised to sit on the neck).
      g.roundRect(-72, headCy + headR - 6, 144, 360, 62).fill(0xffffff)
      return g
    }
    const left = makeBust()
    left.position.set(width * 0.17, boxY)
    const right = makeBust()
    right.position.set(width * 0.83, boxY)
    root.addChild(left, right)

    root.addChild(
      new Graphics()
        .roundRect(boxX, boxY, boxW, boxH, RADIUS.panel)
        .fill({ color: COLORS.panel, alpha: 0.96 })
        .stroke({ color: COLORS.border, width: 1 }),
    )
    const chip = new Graphics()
    root.addChild(chip)
    const name = text('', { fill: COLORS.text, fontSize: 15, fontFamily: theme.fontSans })
    root.addChild(name)
    // The body is a SplitText: the line is laid out (and wrapped) once into
    // per-character Text nodes, then revealed by toggling each char's `visible`.
    // That keeps the line breaks fixed (no reflow) and costs no re-rasterization
    // while typing — unlike re-assigning `Text.text` every character. (Per the
    // pixijs-scene-text skill: changing `Text.text` is HIGH cost; SplitText's
    // visibility toggles are free.)
    const bodyStyle = {
      fill: COLORS.text,
      fontSize: 18,
      fontFamily: theme.fontSans,
      lineHeight: 27,
      wordWrap: true,
      wordWrapWidth: boxW - 36,
      breakWords: true,
    }
    const bodyX = boxX + 18
    const bodyY = boxY + 16
    let split: SplitText | null = null
    let chars: PixiText[] = []
    const indicator = text('▼', { fill: COLORS.accent, fontSize: 16, fontFamily: theme.fontSans })
    indicator.anchor.set(1, 1)
    indicator.position.set(boxX + boxW - 14, boxY + boxH - 8)
    root.addChild(indicator)

    let i = 0
    let revealed = 0
    let lastShown = -1
    let autoTimer = 0
    let blink = 0
    const applyLine = (): void => {
      const line = script[i] ?? script[0]
      if (!line) return
      const color = line.who === 0 ? CYAN : PINK
      // Rebuild the body for the new line (laid out + wrapped once).
      if (split) split.destroy({ children: true })
      split = new SplitText({ text: line.text, style: bodyStyle })
      split.position.set(bodyX, bodyY)
      root.addChild(split)
      chars = split.chars
      for (const c of chars) c.visible = false
      name.text = line.name
      // Dark name plate with a coloured speaker bar + white name, so it reads
      // clearly over the same-coloured portrait behind it.
      const plateY = boxY - 32
      chip
        .clear()
        .roundRect(boxX + 16, plateY, name.width + 30, 28, RADIUS.chip)
        .fill(COLORS.panelDeep)
        .stroke({ color, width: 1.5 })
        .rect(boxX + 25, plateY + 8, 4, 12)
        .fill(color)
      name.position.set(boxX + 38, plateY + 6)
      left.tint = line.who === 0 ? CYAN : DIM
      right.tint = line.who === 1 ? PINK : DIM
      revealed = 0
      lastShown = -1
      autoTimer = 0
    }
    const next = (): void => {
      i = (i + 1) % script.length
      applyLine()
    }
    applyLine()

    return {
      update: (dt) => {
        // Reveal characters by flipping `visible`; the layout (and wrapping) is
        // fixed from construction, so lines never reflow and nothing re-renders.
        const full = chars.length
        if (revealed < full) revealed = Math.min(full, revealed + params.get('cps') * dt.dtSec)
        const shown = Math.floor(revealed)
        if (shown !== lastShown) {
          for (let k = Math.max(0, lastShown); k < shown; k++) {
            const c = chars[k]
            if (c) c.visible = true
          }
          lastShown = shown
        }
        const complete = shown >= full

        if (input.wasJustPressed('action')) {
          if (!complete) revealed = full
          else next()
        }

        const auto = params.get('auto')
        if (complete && auto > 0) {
          autoTimer += dt.dtMs
          if (autoTimer >= auto) next()
        }

        blink += dt.dtMs
        indicator.visible = complete && Math.floor(blink / 400) % 2 === 0
      },
    }
  },
}

const verticalScroller: PatternDemo = {
  id: 'vertical-scroller-style',
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

export const systemDemos: PatternDemo[] = [
  breakout,
  endlessDodge,
  verticalScroller,
  shmup,
  aimLaunch,
  twinStick,
  singleStick,
  tank,
  inertia,
  gridMove,
  platformer,
  autoRunner,
  adv,
]
