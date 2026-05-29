import RAPIER from '@dimforge/rapier2d-compat'
import { Container, Graphics, Rectangle } from 'pixi.js'
import { DESIGN_H, DESIGN_W } from '../../engine/constants'
import { makeVirtualKeypad } from '../../engine/input/virtual-keypad'
import { Scene, type SceneDelta } from '../../engine/scene'
import { useRuntimeStore } from '../../store/runtime'
import { Ball } from './ball'
import type { Block } from './block'
import { BlockSpawner } from './block-spawner'
import { Ceiling } from './ceiling'
import {
  BALL_DEATH_Y,
  BALL_LAUNCH_SPEED,
  BALL_RESET_DELAY_MS,
  BALL_START_Y,
  BLOCK_SCORE,
  BRICK_NAMES,
  CAMERA_FOLLOW_LEFT,
  CAMERA_FOLLOW_RIGHT,
  DISTANCE_SCORE_FACTOR,
  PADDLE_BOUNCE_INFLUENCE,
  PADDLE_START_X,
  PADDLE_WIDTH,
  SCROLL_BRICK_SIZES,
  STARTING_LIVES,
  WALL_THICKNESS,
} from './constants'
import { HUD } from './hud'
import { Paddle } from './paddle'
import { Starfield } from './starfield'

const BACKGROUND_COLOR = 0x0a0a14
const DEG_TO_RAD = Math.PI / 180

type Phase = 'waiting' | 'playing' | 'resetting' | 'gameover'

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
  private hud!: HUD
  private starfield!: Starfield
  private ceiling!: Ceiling
  private blockSpawner!: BlockSpawner
  private walls: Wall[] = []
  private phase: Phase = 'waiting'
  private lives = STARTING_LIVES
  private blockBonus = 0
  private lastReportedScore = 0
  /** World scroll offset; the camera follows the paddle. */
  private cameraX = 0
  private resetCountdownMs = 0
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

    this.ceiling = new Ceiling()
    this.ceiling.zIndex = -5
    this.addChild(this.ceiling)

    await this.preload(
      BRICK_NAMES.flatMap((name) =>
        SCROLL_BRICK_SIZES.map((size) => ({
          alias: `scroll-brick-${name}-${size}`,
          src: `games/breakout-clone/stickers/${name}-${size}@2x.png`,
        })),
      ),
      signal,
    )

    this.worldLayer = new Container()
    this.worldLayer.sortableChildren = true
    this.worldLayer.zIndex = 0
    this.addChild(this.worldLayer)

    this.world = new RAPIER.World({ x: 0, y: 0 })
    this.eventQueue = new RAPIER.EventQueue(true)
    this.createWalls()

    this.paddle = new Paddle(this.world, PADDLE_START_X)
    this.paddle.zIndex = 10
    this.worldLayer.addChild(this.paddle)
    this.paddleColliderHandle = this.paddle.colliderHandle

    this.ball = new Ball(this.world, PADDLE_START_X, BALL_START_Y)
    this.ball.zIndex = 10
    this.ball.freeze()
    this.worldLayer.addChild(this.ball)
    this.ballColliderHandle = this.ball.colliderHandle

    this.blockSpawner = new BlockSpawner(this.world, this.worldLayer, {
      onBlockAdded: (b) => this.blockByCollider.set(b.colliderHandle, b),
      onBlockRemoved: (b) => this.blockByCollider.delete(b.colliderHandle),
    })
    // Populate the course ahead so it's visible on the start screen.
    this.blockSpawner.ensureAhead(this.cameraX, this.rng)

    this.hud = new HUD()
    this.addChild(this.hud)
    this.hud.setScore(0)
    this.hud.setLives(this.lives)

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
        option: { tap: () => useRuntimeStore.getState().setGamePaused(true) },
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
    const launchJustPressed = this.input.wasJustPressed('launch')

    if (this.phase === 'waiting' && launchJustPressed) {
      this.startGame()
    } else if (this.phase === 'gameover' && launchJustPressed) {
      this.options.onRequestRestart?.()
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

    // Walls track the visible window; set before the step (kinematic bodies).
    this.updateWalls()
    this.world.timestep = dtSec
    this.world.step(this.eventQueue)
    this.drainContacts()
    this.paddle.clampToBounds()

    const prevCameraX = this.cameraX
    this.updateCamera()
    this.worldLayer.x = -this.cameraX

    this.paddle.syncView()
    if (this.phase === 'waiting' || this.phase === 'resetting') {
      this.ball.setPosition(this.paddle.worldX, BALL_START_Y)
    }
    this.ball.syncView()
    this.starfield.update(this.cameraX - prevCameraX)
    this.ceiling.update(dtMs)

    this.updateTweens(dtMs)

    if (this.phase === 'playing') {
      this.blockSpawner.ensureAhead(this.cameraX, this.rng)
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
   * scrolling when it pushes an edge. Never scrolls before world x = 0. */
  private updateCamera(): void {
    const screenX = this.paddle.worldX - this.cameraX
    if (screenX > CAMERA_FOLLOW_RIGHT) {
      this.cameraX += screenX - CAMERA_FOLLOW_RIGHT
    } else if (screenX < CAMERA_FOLLOW_LEFT) {
      this.cameraX -= CAMERA_FOLLOW_LEFT - screenX
    }
    if (this.cameraX < 0) this.cameraX = 0
  }

  // ── Contact handling ────────────────────────────────────────────────────

  private drainContacts(): void {
    this.eventQueue.drainCollisionEvents((h1, h2, started) => {
      if (!started) return
      const isBall1 = h1 === this.ballColliderHandle
      const isBall2 = h2 === this.ballColliderHandle
      if (!isBall1 && !isBall2) return
      const other = isBall1 ? h2 : h1

      if (other === this.paddleColliderHandle) {
        this.shapePaddleBounce()
        return
      }
      const block = this.blockByCollider.get(other)
      if (block) {
        this.onBlockHit(block)
      }
    })
  }

  /** Dome-angle bounce, measured from the horizontal so edge hits send the
   * ball sideways (toward the blocks) rather than just up.
   * relX=+1 (right edge) → 20°, 0 (center) → 90° (straight up), -1 → 160°.
   * The paddle's own horizontal velocity is added as english, so a moving
   * paddle steers (and speeds) the bounce instead of the speed being constant. */
  private shapePaddleBounce(): void {
    const ballX = this.ball.body.translation().x
    const paddleX = this.paddle.body.translation().x
    const relX = Math.max(-1, Math.min(1, (ballX - paddleX) / (PADDLE_WIDTH / 2)))
    const angleDeg = 90 - relX * 70
    const angleRad = angleDeg * DEG_TO_RAD
    const vx =
      Math.cos(angleRad) * BALL_LAUNCH_SPEED + this.paddle.velocityX * PADDLE_BOUNCE_INFLUENCE
    const vy = -Math.sin(angleRad) * BALL_LAUNCH_SPEED
    this.ball.setVelocity(vx, vy)
  }

  private onBlockHit(block: Block): void {
    this.blockBonus += BLOCK_SCORE
    this.reportScore()
    this.blockSpawner.destroyBlock(block)
  }

  // ── Phase transitions ───────────────────────────────────────────────────

  private startGame(): void {
    this.phase = 'playing'
    this.hud.showPlaying()
    this.ball.unfreeze()
    this.launchBall()
  }

  private launchBall(): void {
    // Launch up-and-to-the-right (~60° from horizontal) with slight jitter,
    // so the ball heads toward the incoming blocks from the start.
    const angleDeg = 60 + this.rng.intRange(-15, 15)
    const angleRad = angleDeg * DEG_TO_RAD
    this.ball.setVelocity(
      Math.cos(angleRad) * BALL_LAUNCH_SPEED,
      -Math.sin(angleRad) * BALL_LAUNCH_SPEED,
    )
  }

  private ballDied(): void {
    if (this.phase !== 'playing') return
    this.lives--
    this.hud.setLives(this.lives)
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
    // Distance the ball has carried forward from the start point; the ball
    // falling back (or being left behind) lowers the score.
    const distance = Math.max(0, this.ball.body.translation().x - PADDLE_START_X)
    return Math.floor(distance * DISTANCE_SCORE_FACTOR) + this.blockBonus
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
