import RAPIER from '@dimforge/rapier2d-compat'
import { Container, Graphics, Rectangle } from 'pixi.js'
import { DESIGN_H, DESIGN_W } from '../../engine/constants'
import { Scene, type SceneDelta } from '../../engine/scene'
import { Ball } from './ball'
import {
  BALL_DEATH_Y,
  BALL_LAUNCH_ANGLE_RANGE_DEG,
  BALL_LAUNCH_SPEED,
  BALL_MIN_BOUNCE_VY,
  BALL_PADDLE_VX_TRANSFER,
  BALL_RADIUS,
  BALL_RESET_DELAY_MS,
  BALL_START_Y,
  PADDLE_BOUNDS_LEFT,
  PADDLE_BOUNDS_RIGHT,
  PADDLE_FAST_MULT,
  PADDLE_GROUND_Y,
  PADDLE_HEIGHT,
  PADDLE_SPEED,
  PADDLE_WIDTH,
} from './constants'
import { HUD } from './hud'
import { Paddle } from './paddle'
import { BreakoutState } from './state'
import { createWalls } from './walls'

const BACKGROUND_COLOR = 0x0a0a14

type Phase = 'waiting' | 'playing' | 'resetting' | 'gameover'

export interface MainSceneOptions {
  onScoreChange?: (score: number) => void
  onGameOver?: (score: number) => void
  /** When set, scene starts in 'playing' (used by restart). */
  startImmediately?: boolean
  /** Called when the user requests a fresh run from the game-over screen.
   * Owner (game module) creates a new MainScene and hands it to
   * `SceneManager.changeTo`. */
  onRequestRestart?: () => void
}

const CENTER_X = (PADDLE_BOUNDS_LEFT + PADDLE_BOUNDS_RIGHT) / 2

export class MainScene extends Scene {
  private readonly state = new BreakoutState()
  private world!: RAPIER.World
  private paddle!: Paddle
  private ball!: Ball
  private hud!: HUD
  private phase: Phase = 'waiting'
  private resetCountdownMs = 0

  constructor(private readonly options: MainSceneOptions = {}) {
    super()
    this.sortableChildren = true
  }

  onEnter(signal: AbortSignal): void {
    signal.throwIfAborted()

    const bg = new Graphics().rect(0, 0, DESIGN_W, DESIGN_H).fill(BACKGROUND_COLOR)
    bg.zIndex = -100
    this.addChild(bg)

    // Zero-gravity world. The ball uses its own gravityScale=0; the paddle
    // is kinematic so gravity wouldn't affect it anyway.
    this.world = new RAPIER.World({ x: 0, y: 0 })
    createWalls(this.world)

    this.paddle = new Paddle(this.world, CENTER_X)
    this.paddle.zIndex = 10
    this.addChild(this.paddle)

    this.ball = new Ball(this.world, CENTER_X, BALL_START_Y)
    this.ball.zIndex = 10
    this.ball.freeze() // doesn't move until startGame()
    this.addChild(this.ball)

    this.hud = new HUD()
    this.addChild(this.hud)
    this.hud.setScore(this.state.score)
    this.hud.setLives(this.state.lives)

    this.bindInput({
      left: ['ArrowLeft', 'KeyA'],
      right: ['ArrowRight', 'KeyD'],
      fast: ['ShiftLeft', 'ShiftRight'],
      jump: ['Space'],
    })

    // Tap to start (and to launch from the game-over screen).
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

    // Start / restart triggers.
    if (this.phase === 'waiting' && jumpJustPressed) {
      this.startGame()
    } else if (this.phase === 'gameover' && jumpJustPressed) {
      this.options.onRequestRestart?.()
      // The manager will swap us out shortly.
    }

    this.updatePaddle()
    this.world.timestep = dtSec
    this.world.step()
    this.paddle.sync()
    this.ball.sync()

    if (this.phase === 'playing') {
      this.state.elapsedMs += dtMs
      this.hud.setElapsed(this.state.formattedElapsed())

      // Ball death check.
      if (this.ball.y > BALL_DEATH_Y) this.ballDied()

      // Apply post-bounce velocity rules: any contact with the paddle
      // gets a small horizontal kick from the paddle's velocity, plus a
      // minimum upward speed so the ball can't crawl along the paddle top.
      this.applyPaddleBounceShape()
    } else if (this.phase === 'resetting') {
      this.resetCountdownMs -= dtMs
      if (this.resetCountdownMs <= 0) this.respawnBall()
    }

    this.input.endFrame()
  }

  override onExit(): void {
    this.paddle?.removeFromWorld(this.world)
    this.ball?.removeFromWorld(this.world)
    this.world?.free()
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

  /** After Rapier's step, if the ball just contacted the paddle top, shape
   * the bounce: transfer 30% of paddle vx into ball vx and enforce a
   * minimum upward vy. Detected via overlap on the paddle-top band rather
   * than Rapier events (cheaper + simpler for this game). */
  private applyPaddleBounceShape(): void {
    const v = this.ball.velocity
    if (v.y >= 0) return // ball is moving down — not a bounce frame

    const bx = this.ball.x
    const by = this.ball.y
    const px = this.paddle.position.x
    const paddleTop = PADDLE_GROUND_Y - PADDLE_HEIGHT / 2
    // Narrow contact band just above the paddle top.
    const within =
      Math.abs(bx - px) <= PADDLE_WIDTH / 2 + BALL_RADIUS &&
      by >= paddleTop - BALL_RADIUS - 2 &&
      by <= paddleTop + 2

    if (!within) return

    const newVx = v.x + this.paddle.velocityX * BALL_PADDLE_VX_TRANSFER
    const newVy = Math.min(v.y, BALL_MIN_BOUNCE_VY)
    this.ball.setVelocity(newVx, newVy)
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
}
