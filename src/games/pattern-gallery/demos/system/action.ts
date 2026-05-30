import { Container, Graphics } from 'pixi.js'
import { COLORS } from '../../constants'
import type { PatternDemo } from '../../demo'
import { text } from '../../demo-util'
import { axis, clamp, FLOOR_INSET, hint } from './shared'

const breakout: PatternDemo = {
  id: 'breakout-style',
  controls: { stick: { left: 'left', right: 'right' } },
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

const aimLaunch: PatternDemo = {
  id: 'aim-launch-style',
  controls: {
    stick: { left: 'left', right: 'right' },
    a: { action: 'action', label: 'LAUNCH', labelSize: 16 },
  },
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
  controls: {
    stick: { left: 'moveLeft', right: 'moveRight', up: 'moveUp', down: 'moveDown' },
    rightStick: { left: 'aimLeft', right: 'aimRight', up: 'aimUp', down: 'aimDown' },
  },
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
  controls: { stick: { left: 'left', right: 'right', up: 'up', down: 'down' } },
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

const tank: PatternDemo = {
  id: 'tank-style',
  controls: { stick: { left: 'left', right: 'right', up: 'up', down: 'down' } },
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
  controls: { stick: { left: 'left', right: 'right', up: 'up' } },
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

const platformer: PatternDemo = {
  id: 'platformer-style',
  controls: {
    stick: { left: 'left', right: 'right' },
    a: { action: 'action', label: 'JUMP' },
    b: { action: 'dash', label: 'DASH' },
  },
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

export const actionDemos: PatternDemo[] = [
  breakout,
  aimLaunch,
  twinStick,
  singleStick,
  tank,
  inertia,
  platformer,
]
