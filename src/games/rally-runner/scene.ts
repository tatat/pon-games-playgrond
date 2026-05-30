import RAPIER from '@dimforge/rapier2d-compat'
import { Assets, Container, Graphics, Rectangle } from 'pixi.js'
import { DESIGN_H, DESIGN_W } from '../../engine/constants'
import { makeVirtualKeypad } from '../../engine/input/virtual-keypad'
import { Rng } from '../../engine/rng'
import { Scene, type SceneDelta } from '../../engine/scene'
import { Easings } from '../../engine/util/tween'
import { useRuntimeStore } from '../../store/runtime'
import { Ball } from './ball'
import type { Block } from './block'
import { BlockSpawner } from './block-spawner'
import { ChevronBand } from './chevron-band'
import {
  AIM_ALPHA_MAX,
  AIM_ALPHA_MIN,
  AIM_DEFAULT_DEG,
  AIM_LINE_LEN,
  AIM_MAX_DEG,
  AIM_MIN_DEG,
  AIM_PULSE_PERIOD_SEC,
  AIM_ROTATE_SPEED,
  BALL_DEATH_Y,
  BALL_LAUNCH_SPEED,
  BALL_RADIUS,
  BALL_RESET_DELAY_MS,
  BALL_START_Y,
  BRICK_NAMES,
  CAMERA_FOLLOW_LEFT,
  CAMERA_FOLLOW_RIGHT,
  CEILING_BAND_H,
  CEILING_Y,
  DISTANCE_SCORE_FACTOR,
  FIXED_COURSE_SEED,
  PADDLE_START_X,
  PADDLE_STICKER,
  PADDLE_STICKER_SIZE,
  SCROLL_BRICK_SIZES,
  STARTING_LIVES,
  WALL_THICKNESS,
  WORLD_MIN_X,
} from './constants'
import { HUD, loadScoreFont } from './hud'
import { Paddle } from './paddle'
import { Starfield } from './starfield'
import { useRallyRunnerStore } from './store'

const BACKGROUND_COLOR = 0x0a0a14
const DEG_TO_RAD = Math.PI / 180

type Phase = 'title' | 'aiming' | 'playing' | 'resetting' | 'gameover'

interface Wall {
  body: RAPIER.RigidBody
  offsetX: number
  y: number
}

export interface MainSceneOptions {
  onScoreChange?: (score: number) => void
  onGameOver?: (score: number) => void
  startImmediately?: boolean
  onRequestRestart?: () => void
}

export class MainScene extends Scene {
  private world!: RAPIER.World
  private eventQueue!: RAPIER.EventQueue
  /** Camera layer: holds paddle, ball and blocks in world space. */
  private worldLayer!: Container
  private paddle!: Paddle
  private ball!: Ball
  /** Aim guide shown before launch; left/right rotate launchAngleDeg. */
  private aim!: Graphics
  private launchAngleDeg = AIM_DEFAULT_DEG
  /** Drives the aim guide's slow opacity pulse. */
  private aimPulseSec = 0
  private hud!: HUD
  private starfield!: Starfield
  /** Chevron rails along the top and bottom edges. */
  private ceiling!: ChevronBand
  private floor!: ChevronBand
  private blockSpawner!: BlockSpawner
  /** RNG for the obstacle layout — a fixed seed (same course every run) or the
   * session RNG (fresh each run), per the player's setting. */
  private blockRng!: Rng
  private walls: Wall[] = []
  private phase: Phase = 'title'
  private lives = STARTING_LIVES
  private lastReportedScore = 0
  /** World scroll offset; the camera follows the paddle. */
  private cameraX = 0
  private resetCountdownMs = 0
  /** Wall-clock since scene start, driving the block bob. */
  private elapsedSec = 0
  private paddleColliderHandle = -1
  private ballColliderHandle = -1
  private blockByCollider = new Map<number, Block>()

  constructor(private readonly options: MainSceneOptions = {}) {
    super()
    this.sortableChildren = true
  }

  async onEnter(signal: AbortSignal): Promise<void> {
    const bg = new Graphics().rect(0, 0, DESIGN_W, DESIGN_H).fill(BACKGROUND_COLOR)
    bg.zIndex = -100
    this.addChild(bg)

    this.starfield = new Starfield(this.rng)
    this.starfield.zIndex = -50
    this.addChild(this.starfield)

    this.ceiling = new ChevronBand(CEILING_Y)
    this.ceiling.zIndex = -5
    this.addChild(this.ceiling)

    this.floor = new ChevronBand(DESIGN_H - CEILING_BAND_H)
    this.floor.zIndex = -5
    this.addChild(this.floor)

    await this.preload(
      [
        ...BRICK_NAMES.flatMap((name) =>
          SCROLL_BRICK_SIZES.map((size) => ({
            alias: `scroll-brick-${name}-${size}`,
            src: `games/rally-runner/stickers/${name}-${size}@2x.png`,
          })),
        ),
        {
          alias: 'scroll-player',
          src: `games/rally-runner/stickers/${PADDLE_STICKER}-${PADDLE_STICKER_SIZE}@2x.png`,
        },
      ],
      signal,
    )

    this.worldLayer = new Container()
    this.worldLayer.sortableChildren = true
    this.worldLayer.zIndex = 0
    this.addChild(this.worldLayer)

    this.world = new RAPIER.World({ x: 0, y: 0 })
    this.eventQueue = new RAPIER.EventQueue(true)
    this.createWalls()

    this.paddle = new Paddle(this.world, PADDLE_START_X, Assets.get('scroll-player'))
    this.paddle.zIndex = 10
    this.worldLayer.addChild(this.paddle)
    this.paddleColliderHandle = this.paddle.colliderHandle

    this.ball = new Ball(this.world, PADDLE_START_X, BALL_START_Y)
    this.ball.zIndex = 10
    this.ball.freeze()
    this.worldLayer.addChild(this.ball)
    this.ballColliderHandle = this.ball.colliderHandle

    // Aim guide: a simple dashed line along +x, drawn once and rotated to the
    // launch angle each frame while aiming. Lives in the world layer at the ball.
    this.aim = new Graphics()
    const dash = 7
    const gap = 6
    for (let x = 0; x < AIM_LINE_LEN; x += dash + gap) {
      this.aim.moveTo(x, 0).lineTo(Math.min(x + dash, AIM_LINE_LEN), 0)
    }
    this.aim.stroke({ width: 3, color: 0xffffff, alpha: 1, cap: 'round' })
    this.aim.zIndex = 9
    this.aim.visible = false
    this.worldLayer.addChild(this.aim)

    this.blockSpawner = new BlockSpawner(this.world, this.worldLayer, {
      onBlockAdded: (b) => this.blockByCollider.set(b.colliderHandle, b),
      onBlockRemoved: (b) => this.blockByCollider.delete(b.colliderHandle),
    })
    // Fixed-course setting → a constant seed so every run/restart is identical;
    // otherwise use the session RNG so each run is fresh.
    this.blockRng = this.pickBlockRng()
    // Populate the course from the start; FIRST_COLUMN_X keeps the near 4/5
    // (and the start/aim text) clear, so blocks only appear toward the right.
    this.blockSpawner.ensureAhead(this.cameraX, this.blockRng)

    // Re-roll the course live when the fixed-course setting is toggled, but only
    // while it's static (title / aim) — mid-run we leave it for the next run.
    this.use(
      useRallyRunnerStore.subscribe((s, prev) => {
        if (s.fixedCourse === prev.fixedCourse) return
        if (this.phase !== 'title' && this.phase !== 'aiming') return
        this.blockRng = this.pickBlockRng()
        this.blockSpawner.reset()
        this.blockSpawner.ensureAhead(this.cameraX, this.blockRng)
      }),
    )

    // Make sure the Orbitron score font is ready before the HUD text is built.
    await loadScoreFont()
    this.hud = new HUD()
    this.addChild(this.hud)
    this.hud.setScore(0)

    this.bindInput({
      left: ['ArrowLeft', 'KeyA'],
      right: ['ArrowRight', 'KeyD'],
      fast: ['ShiftLeft', 'ShiftRight'],
      launch: ['Space'],
    })

    const keypad = this.use(
      makeVirtualKeypad(this.input, this.layout, {
        stick: { left: 'left', right: 'right' },
        actions: {
          a: { action: 'launch', label: 'START' },
          b: { action: 'fast', label: 'FAST' },
        },
        option: { tap: () => useRuntimeStore.getState().toggleGamePaused() },
      }),
    )
    this.layout.uiLayer.addChild(keypad.view)
    this.use(() => {
      this.layout.uiLayer.removeChild(keypad.view)
    })

    const tap = new Container()
    tap.eventMode = 'static'
    tap.hitArea = new Rectangle(0, 0, DESIGN_W, DESIGN_H)
    tap.zIndex = -1
    this.addChild(tap)
    const onTap = (): void => {
      if (this.phase !== 'playing') this.input.press('launch')
    }
    const onRelease = (): void => this.input.release('launch')
    tap.on('pointerdown', onTap)
    tap.on('pointerup', onRelease)
    tap.on('pointerupoutside', onRelease)
    tap.on('pointercancel', onRelease)
    this.use(() => {
      tap.off('pointerdown', onTap)
      tap.off('pointerup', onRelease)
      tap.off('pointerupoutside', onRelease)
      tap.off('pointercancel', onRelease)
    })

    if (this.options.startImmediately) this.startGame()
    else this.hud.showStart()
  }

  override onUpdate(dt: SceneDelta): void {
    const { dtMs, dtSec } = dt
    this.elapsedSec += dtSec
    const launchJustPressed = this.input.wasJustPressed('launch')

    if (launchJustPressed) {
      if (this.phase === 'title') {
        // First press dismisses the opening screen and enters aim mode.
        this.phase = 'aiming'
        this.hud.showAiming()
      } else if (this.phase === 'aiming') {
        // Second press launches along the chosen angle.
        this.startGame()
      } else if (this.phase === 'playing') {
        // While playing, the action button makes the avatar hop.
        this.paddle.jump()
      } else if (this.phase === 'gameover') {
        this.options.onRequestRestart?.()
      }
    }

    const left = this.input.isDown('left')
    const right = this.input.isDown('right')
    const fast = this.input.isDown('fast')
    // Steering is only live while actually playing. The paddle holds still on
    // the start / game-over screens (so pre-start drift can't score) and during
    // the post-miss reset countdown (so the player re-centres before resuming).
    if (this.phase === 'playing') {
      this.paddle.applyInput(left, right, fast)
    } else {
      this.paddle.applyInput(false, false, false)
    }

    // Push paddle velocity (input + jump arc) to the body before the step.
    this.paddle.applyMotion(dtSec)
    // Bob the blocks (kinematic) and track walls — both set before the step.
    this.blockSpawner.bobAll(this.elapsedSec)
    this.updateWalls()
    this.world.timestep = dtSec
    this.world.step(this.eventQueue)
    this.drainContacts()
    this.paddle.clampToBounds()
    this.blockSpawner.syncViews()

    const prevCameraX = this.cameraX
    this.updateCamera()
    this.worldLayer.x = -this.cameraX

    this.paddle.syncView()
    this.paddle.animate(dtSec)
    // Ball rides the paddle on the title / aim / reset screens.
    const onPaddle = this.phase === 'title' || this.phase === 'aiming' || this.phase === 'resetting'
    if (onPaddle) {
      this.ball.setPosition(this.paddle.worldX, BALL_START_Y)
    }
    this.ball.syncView()
    this.ball.animate(dtSec)
    // Aiming (guide + angle steering) is only live once past the title screen.
    const aiming = this.phase === 'aiming' || this.phase === 'resetting'
    this.updateAim(aiming, left, right, dtSec)
    this.starfield.update(this.cameraX - prevCameraX)
    this.ceiling.update(dtMs)
    this.floor.update(dtMs)

    this.updateTweens(dtMs)

    if (this.phase === 'playing') {
      this.maintainBallSpeed()
      this.blockSpawner.ensureAhead(this.cameraX, this.blockRng)
      this.blockSpawner.cullBehind(this.cameraX)

      this.reportScore()

      // Floor (bottom) or the left edge of the visible window both kill the ball.
      const ballPos = this.ball.body.translation()
      if (ballPos.y > BALL_DEATH_Y || ballPos.x < this.cameraX) this.ballDied()
    } else if (this.phase === 'resetting') {
      this.resetCountdownMs -= dtMs
      if (this.resetCountdownMs <= 0) this.respawnBall()
    }

    this.input.endFrame()
  }

  override onExit(): void {
    this.blockSpawner?.clear()
    this.paddle?.removeFromWorld(this.world)
    this.ball?.removeFromWorld(this.world)
    this.eventQueue?.free()
    this.world?.free()
  }

  // ── Physics walls (kinematic, track the visible window) ──────────────────

  private createWalls(): void {
    const t = WALL_THICKNESS
    // No left wall: the left edge of the visible window is deadly (treated like
    // the floor). Leaving the ball behind by advancing too fast drops it.
    const specs = [
      { offsetX: DESIGN_W + t / 2, y: DESIGN_H / 2, w: t, h: DESIGN_H * 2 }, // right
      { offsetX: DESIGN_W / 2, y: -t / 2, w: DESIGN_W * 2, h: t }, // top
    ]
    for (const s of specs) {
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.cameraX + s.offsetX, s.y),
      )
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(s.w / 2, s.h / 2)
          .setRestitution(1)
          .setFriction(0),
        body,
      )
      this.walls.push({ body, offsetX: s.offsetX, y: s.y })
    }
  }

  private updateWalls(): void {
    for (const w of this.walls) {
      w.body.setNextKinematicTranslation({ x: this.cameraX + w.offsetX, y: w.y })
    }
  }

  // ── Camera ───────────────────────────────────────────────────────────────

  /** Free two-way follow: keep the paddle inside a screen-space dead-zone by
   * scrolling when it pushes an edge. Never scrolls before WORLD_MIN_X. */
  private updateCamera(): void {
    const screenX = this.paddle.worldX - this.cameraX
    if (screenX > CAMERA_FOLLOW_RIGHT) {
      this.cameraX += screenX - CAMERA_FOLLOW_RIGHT
    } else if (screenX < CAMERA_FOLLOW_LEFT) {
      this.cameraX -= CAMERA_FOLLOW_LEFT - screenX
    }
    if (this.cameraX < WORLD_MIN_X) this.cameraX = WORLD_MIN_X
  }

  // ── Contact handling ────────────────────────────────────────────────────

  private drainContacts(): void {
    this.eventQueue.drainCollisionEvents((h1, h2, started) => {
      if (!started) return
      const isBall1 = h1 === this.ballColliderHandle
      const isBall2 = h2 === this.ballColliderHandle
      if (!isBall1 && !isBall2) return
      const other = isBall1 ? h2 : h1

      // Juicy feedback on every bounce — walls, paddle and blocks alike.
      this.spawnBounceFx()

      // The paddle bounce is left entirely to the physics (circular collider,
      // restitution 1); the contact only drives a visual "boing".
      if (other === this.paddleColliderHandle) {
        this.paddle.pop()
        return
      }
      const block = this.blockByCollider.get(other)
      if (block) {
        this.onBlockHit(block)
      }
    })
  }

  /** A bounce pop on the ball plus an expanding ring at the impact point. The
   * ring is redrawn each frame at a growing radius with a constant line width,
   * so the outline stays crisp instead of softening as it would if scaled. */
  private spawnBounceFx(): void {
    this.ball.pop()
    const t = this.ball.body.translation()
    const ring = new Graphics()
    ring.position.set(t.x, t.y)
    ring.zIndex = 8
    this.worldLayer.addChild(ring)
    const r0 = BALL_RADIUS + 2
    void this.tween({
      duration: 240,
      ease: Easings.easeOutQuad,
      onUpdate: (k) => {
        ring
          .clear()
          .circle(0, 0, r0 + k * 26)
          .stroke({ width: 3, color: 0xffffff, alpha: 0.85 * (1 - k) })
      },
      onComplete: () => ring.destroy(),
    })
  }

  /** Keep the ball at a steady speed: the physics decides the direction (so the
   * circular paddle, walls and dashing all bounce naturally), and this clamps
   * the magnitude so dashing can't pump it out of control or grazes stall it. */
  private maintainBallSpeed(): void {
    const v = this.ball.body.linvel()
    const speed = Math.hypot(v.x, v.y)
    if (speed < 1) return
    const k = BALL_LAUNCH_SPEED / speed
    this.ball.setVelocity(v.x * k, v.y * k)
  }

  /** A fresh fixed-seed RNG (same course every run) or the session RNG (fresh
   * each run), per the player's setting. */
  private pickBlockRng(): Rng {
    return useRallyRunnerStore.getState().fixedCourse ? new Rng(FIXED_COURSE_SEED) : this.rng
  }

  private onBlockHit(block: Block): void {
    // Blocks are obstacles only — no points. Detach from the sim, then play a
    // quick "burst" (scale up + fade) on the leftover view before destroying it.
    this.blockSpawner.detachBlock(block)
    void this.tween({
      duration: 170,
      ease: Easings.easeOutQuad,
      onUpdate: (t) => {
        block.scale.set(1 + t * 0.7)
        block.alpha = 1 - t
      },
      onComplete: () => block.destroy({ children: true }),
    })
  }

  // ── Phase transitions ───────────────────────────────────────────────────

  private startGame(): void {
    this.phase = 'playing'
    this.hud.showPlaying()
    this.ball.unfreeze()
    this.launchBall()
  }

  private launchBall(): void {
    // Fire along the angle the player aimed before launching.
    const angleRad = this.launchAngleDeg * DEG_TO_RAD
    this.aim.visible = false
    this.ball.setVelocity(
      Math.cos(angleRad) * BALL_LAUNCH_SPEED,
      -Math.sin(angleRad) * BALL_LAUNCH_SPEED,
    )
  }

  /** While aiming (aim / reset screens), left/right rotate the launch angle and
   * the guide is drawn from the ball along it. Hidden once the ball is in play. */
  private updateAim(aiming: boolean, left: boolean, right: boolean, dtSec: number): void {
    if (!aiming) {
      this.aim.visible = false
      return
    }
    // Right key leans the aim rightward (toward the horizon), left key leftward.
    const dir = (left ? 1 : 0) - (right ? 1 : 0)
    if (dir !== 0) {
      const next = this.launchAngleDeg + dir * AIM_ROTATE_SPEED * dtSec
      this.launchAngleDeg = Math.max(AIM_MIN_DEG, Math.min(AIM_MAX_DEG, next))
    }
    const t = this.ball.body.translation()
    this.aim.position.set(t.x, t.y)
    this.aim.rotation = -this.launchAngleDeg * DEG_TO_RAD
    // Slow opacity pulse (blink) to draw the eye to the aim.
    this.aimPulseSec += dtSec
    const k = 0.5 + 0.5 * Math.sin((this.aimPulseSec / AIM_PULSE_PERIOD_SEC) * 2 * Math.PI)
    this.aim.alpha = AIM_ALPHA_MIN + (AIM_ALPHA_MAX - AIM_ALPHA_MIN) * k
    this.aim.visible = true
  }

  private ballDied(): void {
    if (this.phase !== 'playing') return
    this.lives--
    this.ball.freeze()

    if (this.lives <= 0) {
      this.enterGameOver()
    } else {
      this.ball.setPosition(this.paddle.worldX, BALL_START_Y)
      this.phase = 'resetting'
      this.resetCountdownMs = BALL_RESET_DELAY_MS
    }
  }

  private respawnBall(): void {
    this.phase = 'playing'
    this.ball.unfreeze()
    this.launchBall()
  }

  private enterGameOver(): void {
    this.phase = 'gameover'
    const final = this.currentScore()
    this.hud.showGameOver(final)
    this.options.onGameOver?.(final)
  }

  private currentScore(): number {
    // Signed distance from the start point: backing up past the start (into the
    // negative region) drives the score below zero.
    const distance = this.ball.body.translation().x - PADDLE_START_X
    return Math.trunc(distance * DISTANCE_SCORE_FACTOR)
  }

  private reportScore(): void {
    const v = this.currentScore()
    this.hud.setScore(v)
    if (v !== this.lastReportedScore) {
      this.lastReportedScore = v
      this.options.onScoreChange?.(v)
    }
  }
}
