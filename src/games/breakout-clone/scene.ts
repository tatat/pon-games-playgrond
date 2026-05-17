import RAPIER from '@dimforge/rapier2d-compat'
import { Container, Graphics, Rectangle } from 'pixi.js'
import { DESIGN_H, DESIGN_W } from '../../engine/constants'
import { Scene, type SceneDelta } from '../../engine/scene'
import { Ball } from './ball'
import type { Brick } from './brick'
import { BrickGenerator } from './brick-generator'
import {
  BALL_DEATH_Y,
  BALL_LAUNCH_ANGLE_RANGE_DEG,
  BALL_LAUNCH_SPEED,
  BALL_MIN_BOUNCE_VY,
  BALL_PADDLE_VX_TRANSFER,
  BALL_RESET_DELAY_MS,
  BALL_START_Y,
  BRICK_NAMES,
  BRICK_SIZES,
  PADDLE_BOUNDS_LEFT,
  PADDLE_BOUNDS_RIGHT,
  PADDLE_FAST_MULT,
  PADDLE_SPEED,
} from './constants'
import { HUD } from './hud'
import { Paddle } from './paddle'
import { Starfield } from './starfield'
import { BreakoutState } from './state'
import { createWalls } from './walls'

const BACKGROUND_COLOR = 0x0a0a14

/** New-brick spawn interval (ms). */
const BRICK_SPAWN_INTERVAL_MS = 5000

/** All-cleared bonus. */
const CLEAR_BONUS = 100

type Phase = 'waiting' | 'playing' | 'resetting' | 'gameover'

export interface MainSceneOptions {
  onScoreChange?: (score: number) => void
  onGameOver?: (score: number) => void
  /** Skip the start screen and begin in 'playing' (used by restart). */
  startImmediately?: boolean
  /** Called when the user requests a fresh run from the game-over screen. */
  onRequestRestart?: () => void
}

const CENTER_X = (PADDLE_BOUNDS_LEFT + PADDLE_BOUNDS_RIGHT) / 2

export class MainScene extends Scene {
  private readonly state = new BreakoutState()
  private world!: RAPIER.World
  private eventQueue!: RAPIER.EventQueue
  private paddle!: Paddle
  private ball!: Ball
  private hud!: HUD
  private bricks!: BrickGenerator
  private starfield!: Starfield
  private phase: Phase = 'waiting'
  private resetCountdownMs = 0
  private brickSpawnAccumulatorMs = 0
  private lastReportedScore = 0
  /** Map from collider handle → Brick, used by the contact-event handler
   * to look up which brick the ball struck. */
  private brickByCollider = new Map<number, Brick>()
  /** Cached collider handles for fast role checks in contact events. */
  private paddleColliderHandle = -1
  private ballColliderHandle = -1

  constructor(private readonly options: MainSceneOptions = {}) {
    super()
    this.sortableChildren = true
  }

  async onEnter(signal: AbortSignal): Promise<void> {
    const bg = new Graphics().rect(0, 0, DESIGN_W, DESIGN_H).fill(BACKGROUND_COLOR)
    bg.zIndex = -100
    this.addChild(bg)

    this.starfield = new Starfield(this.rng)
    this.starfield.zIndex = -90
    this.addChild(this.starfield)

    await this.preload(
      BRICK_NAMES.flatMap((name) =>
        BRICK_SIZES.map((size) => ({
          alias: `brick-${name}-${size}`,
          src: `games/breakout-clone/stickers/${name}-${size}@2x.png`,
        })),
      ),
      signal,
    )

    // Zero-gravity world: breakout has no falling-ball gravity.
    this.world = new RAPIER.World({ x: 0, y: 0 })
    this.eventQueue = new RAPIER.EventQueue(true)
    createWalls(this.world)

    this.paddle = new Paddle(this.world, CENTER_X)
    this.paddle.zIndex = 10
    this.addChild(this.paddle)
    this.paddleColliderHandle = this.paddle.colliderHandle

    this.ball = new Ball(this.world, CENTER_X, BALL_START_Y)
    this.ball.zIndex = 10
    this.ball.freeze()
    this.addChild(this.ball)
    this.ballColliderHandle = this.ball.colliderHandle

    this.hud = new HUD()
    this.addChild(this.hud)
    this.hud.setScore(this.state.score)
    this.hud.setLives(this.state.lives)

    // Bricks. Generator builds against the same world and tracks them by
    // collider handle through `onBrickAdded` so the scene's contact handler
    // can resolve handle → entity in O(1).
    this.bricks = new BrickGenerator(this.world, this, this.rng, {
      onBrickAdded: (brick) => {
        this.brickByCollider.set(brick.colliderHandle, brick)
      },
      onBrickRemoved: (brick) => {
        this.brickByCollider.delete(brick.colliderHandle)
      },
    })
    this.bricks.generateInitial()

    this.bindInput({
      left: ['ArrowLeft', 'KeyA'],
      right: ['ArrowRight', 'KeyD'],
      fast: ['ShiftLeft', 'ShiftRight'],
      jump: ['Space'],
    })

    // Tap anywhere to start / restart (also doubles as jump input).
    const tap = new Container()
    tap.eventMode = 'static'
    tap.hitArea = new Rectangle(0, 0, DESIGN_W, DESIGN_H)
    tap.zIndex = -1
    this.addChild(tap)
    const onTap = (): void => this.input.press('jump')
    const onRelease = (): void => this.input.release('jump')
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
    const jumpJustPressed = this.input.wasJustPressed('jump')

    if (this.phase === 'waiting' && jumpJustPressed) {
      this.startGame()
    } else if (this.phase === 'gameover' && jumpJustPressed) {
      this.options.onRequestRestart?.()
    } else if (this.phase === 'playing' && jumpJustPressed) {
      this.paddle.startJump()
    }

    this.starfield.update(dtSec)
    this.updatePaddle()
    this.paddle.updateJump(dtSec)

    // Step physics with the event queue so contact-start events come back
    // via `drainCollisionEvents` below. The earlier per-frame AABB scan
    // had no latch and applied the paddle kick multiple times per actual
    // collision; the event-driven path fires once per start.
    this.world.timestep = dtSec
    this.world.step(this.eventQueue)
    this.drainContacts()
    this.paddle.checkLanding()
    this.paddle.clampToBounds()
    this.paddle.syncView()
    this.ball.syncView()

    if (this.phase === 'playing') {
      this.state.elapsedMs += dtMs
      this.hud.setElapsed(this.state.formattedElapsed())

      if (this.ball.body.translation().y > BALL_DEATH_Y) this.ballDied()

      this.brickSpawnAccumulatorMs += dtMs
      if (this.brickSpawnAccumulatorMs >= BRICK_SPAWN_INTERVAL_MS) {
        this.brickSpawnAccumulatorMs -= BRICK_SPAWN_INTERVAL_MS
        this.bricks.addOne()
      }
    } else if (this.phase === 'resetting') {
      this.resetCountdownMs -= dtMs
      if (this.resetCountdownMs <= 0) this.respawnBall()
    }

    this.input.endFrame()
  }

  override onExit(): void {
    this.bricks?.clear()
    this.paddle?.removeFromWorld(this.world)
    this.ball?.removeFromWorld(this.world)
    this.world?.free()
  }

  // ── Contact events ──────────────────────────────────────────────────────

  private drainContacts(): void {
    this.eventQueue.drainCollisionEvents((h1, h2, started) => {
      if (!started) return
      // Identify the ball side of the pair.
      let other: number
      if (h1 === this.ballColliderHandle) other = h2
      else if (h2 === this.ballColliderHandle) other = h1
      else return

      if (other === this.paddleColliderHandle) {
        this.shapePaddleBounce()
      } else {
        const brick = this.brickByCollider.get(other)
        if (brick) this.onBrickHit(brick)
      }
    })
  }

  /** Apply the paddle bounce shape exactly once per contact-start. */
  private shapePaddleBounce(): void {
    const v = this.ball.body.linvel()
    const newVx = v.x + this.paddle.velocityX * BALL_PADDLE_VX_TRANSFER
    const newVy = Math.min(v.y, BALL_MIN_BOUNCE_VY)
    this.ball.setVelocity(newVx, newVy)
  }

  private onBrickHit(brick: Brick): void {
    this.state.addScore(brick.scoreValue)
    this.bricks.destroyBrick(brick)
    this.reportScore()
    if (this.bricks.count === 0) this.allBricksCleared()
  }

  private allBricksCleared(): void {
    this.state.addScore(CLEAR_BONUS)
    this.reportScore()
    // Repopulate the playfield for endless play.
    this.bricks.generateInitial()
    // Refresh the collider map (generateInitial fires onBrickAdded for each).
  }

  // ── Movement ────────────────────────────────────────────────────────────

  private updatePaddle(): void {
    if (this.phase === 'gameover') {
      this.paddle.setVelocityX(0)
      return
    }
    const left = this.input.isDown('left')
    const right = this.input.isDown('right')
    const fast = this.input.isDown('fast')
    const speed = PADDLE_SPEED * (fast ? PADDLE_FAST_MULT : 1)
    if (left && !right) this.paddle.setVelocityX(-speed)
    else if (right && !left) this.paddle.setVelocityX(speed)
    else this.paddle.setVelocityX(0)
  }

  // ── Phase transitions ───────────────────────────────────────────────────

  private startGame(): void {
    this.state.isGameStarted = true
    this.phase = 'playing'
    this.hud.showPlaying()
    this.ball.unfreeze()
    this.launchBallWithRandomAngle()
  }

  private launchBallWithRandomAngle(): void {
    const range = BALL_LAUNCH_ANGLE_RANGE_DEG
    const angleDeg = this.rng.intRange(-range, range)
    const radians = (angleDeg * Math.PI) / 180
    this.ball.setVelocity(
      Math.sin(radians) * BALL_LAUNCH_SPEED,
      -Math.cos(radians) * BALL_LAUNCH_SPEED,
    )
  }

  private ballDied(): void {
    if (this.phase !== 'playing') return
    this.state.loseLife()
    this.hud.setLives(this.state.lives)
    this.ball.freeze()
    this.ball.setPosition(CENTER_X, BALL_START_Y)

    if (this.state.lives <= 0) {
      this.enterGameOver()
    } else {
      this.phase = 'resetting'
      this.resetCountdownMs = BALL_RESET_DELAY_MS
    }
  }

  private respawnBall(): void {
    this.phase = 'playing'
    this.ball.unfreeze()
    this.launchBallWithRandomAngle()
  }

  private enterGameOver(): void {
    this.phase = 'gameover'
    this.state.isGameOver = true
    const final = this.state.score
    this.hud.showGameOver(final)
    this.options.onGameOver?.(final)
  }

  // Surfaces score-changed to both the HUD and the optional callback,
  // de-duplicated by integer value.
  private reportScore(): void {
    const v = this.state.score
    this.hud.setScore(v)
    if (v !== this.lastReportedScore) {
      this.lastReportedScore = v
      this.options.onScoreChange?.(v)
    }
  }
}
