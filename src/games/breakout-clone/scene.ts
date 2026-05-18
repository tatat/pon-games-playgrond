import RAPIER from '@dimforge/rapier2d-compat'
import { Container, Graphics, Rectangle } from 'pixi.js'
import { DESIGN_H, DESIGN_W } from '../../engine/constants'
import { Scene, type SceneDelta } from '../../engine/scene'
import { Ball } from './ball'
import { BossManager } from './boss-manager'
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
  BOSS_SPAWN_DELAY_MS,
  BRICK_NAMES,
  BRICK_SIZES,
  PADDLE_BOUNDS_LEFT,
  PADDLE_BOUNDS_RIGHT,
  PADDLE_FAST_MULT,
  PADDLE_SPEED,
  SPECIAL_BALL_INTERVAL_MS,
  SPECIAL_BALL_SPEED,
} from './constants'
import { HUD } from './hud'
import { Paddle } from './paddle'
import { SoundManager } from './sound-manager'
import { SpecialBall } from './special-ball'
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
  private sounds!: SoundManager
  private bossManager!: BossManager
  private specialBalls: SpecialBall[] = []
  private phase: Phase = 'waiting'
  private resetCountdownMs = 0
  private brickSpawnAccumulatorMs = 0
  private specialBallAccumulatorMs = 0
  private lastReportedScore = 0
  /** Map from collider handle → Brick, used by the contact-event handler
   * to look up which brick the ball struck. */
  private brickByCollider = new Map<number, Brick>()
  /** Special-ball collider handles, used to identify which side of a
   * contact event is the ball when neither is the main ball. */
  private specialBallHandles = new Set<number>()
  /** Cached collider handles for fast role checks in contact events. */
  private paddleColliderHandle = -1
  private ballColliderHandle = -1
  /** Boss collider handle when alive; -1 otherwise. */
  private bossColliderHandle = -1

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

    // Audio is registered via @pixi/sound directly (lazy-loaded on first
    // play) — keeping it off Pixi.Assets.load avoids the "could not decode"
    // error that turned up when mp3s rode through the image pipeline.
    SoundManager.registerHits()
    this.sounds = new SoundManager(this.rng)

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

    this.bossManager = new BossManager(this.world, this, this.rng, {
      onBossBattleWillStart: () => {
        // Clear bricks so the boss has the playfield to itself.
        this.bricks.clear()
      },
      onBossStarted: (boss) => {
        this.bossColliderHandle = boss.colliderHandle
      },
      onBossDefeated: (_boss, bonus) => {
        this.bossColliderHandle = -1
        this.state.addScore(bonus)
        this.reportScore()
        this.bricks.generateInitial()
      },
    })

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

    // Boss + special balls tick regardless of phase so defeat animations
    // can still finish during game-over screens. Special-ball physics
    // tracks alongside the main ball.
    this.bossManager.tick(dtMs)
    for (const sb of this.specialBalls) sb.syncView()

    if (this.phase === 'playing') {
      this.state.elapsedMs += dtMs
      this.hud.setElapsed(this.state.formattedElapsed())

      if (this.ball.body.translation().y > BALL_DEATH_Y) this.ballDied()

      // Cull special balls that fall past the death line (no life lost).
      for (let i = this.specialBalls.length - 1; i >= 0; i--) {
        const sb = this.specialBalls[i]
        if (!sb) continue
        if (sb.bodyY > BALL_DEATH_Y) this.removeSpecialBall(i)
      }

      // Brick spawn (suspended during boss battle).
      if (!this.bossManager.active) {
        this.brickSpawnAccumulatorMs += dtMs
        if (this.brickSpawnAccumulatorMs >= BRICK_SPAWN_INTERVAL_MS) {
          this.brickSpawnAccumulatorMs -= BRICK_SPAWN_INTERVAL_MS
          this.bricks.addOne()
        }
      }

      // Special-ball spawn every SPECIAL_BALL_INTERVAL_MS.
      this.specialBallAccumulatorMs += dtMs
      if (this.specialBallAccumulatorMs >= SPECIAL_BALL_INTERVAL_MS) {
        this.specialBallAccumulatorMs -= SPECIAL_BALL_INTERVAL_MS
        this.spawnSpecialBall()
      }

      // Boss-battle threshold check.
      if (this.bossManager.shouldStart(this.state.score)) {
        this.bossManager.startBattle(BOSS_SPAWN_DELAY_MS)
      }
    } else if (this.phase === 'resetting') {
      this.resetCountdownMs -= dtMs
      if (this.resetCountdownMs <= 0) this.respawnBall()
    }

    this.input.endFrame()
  }

  override onExit(): void {
    for (const sb of this.specialBalls) {
      this.removeChild(sb)
      sb.removeFromWorld(this.world)
      sb.destroy({ children: true })
    }
    this.specialBalls.length = 0
    this.specialBallHandles.clear()
    this.bossManager?.dispose()
    this.bricks?.clear()
    this.paddle?.removeFromWorld(this.world)
    this.ball?.removeFromWorld(this.world)
    this.eventQueue?.free()
    this.world?.free()
  }

  // ── Special balls ───────────────────────────────────────────────────────

  /** Spawn a single secondary ball at the paddle, fired at a random angle.
   * Doesn't cost a life when it falls past the death line. */
  private spawnSpecialBall(): void {
    const px = this.paddle.position.x
    const py = this.paddle.position.y - 30
    const range = BALL_LAUNCH_ANGLE_RANGE_DEG
    const angleDeg = this.rng.intRange(-range, range)
    const radians = (angleDeg * Math.PI) / 180
    const vx = Math.sin(radians) * SPECIAL_BALL_SPEED
    const vy = -Math.cos(radians) * SPECIAL_BALL_SPEED
    const sb = new SpecialBall(this.world, px, py, vx, vy)
    sb.zIndex = 11
    this.addChild(sb)
    this.specialBalls.push(sb)
    this.specialBallHandles.add(sb.colliderHandle)
  }

  private removeSpecialBall(index: number): void {
    const sb = this.specialBalls[index]
    if (!sb) return
    this.specialBallHandles.delete(sb.colliderHandle)
    this.removeChild(sb)
    sb.removeFromWorld(this.world)
    sb.destroy({ children: true })
    this.specialBalls.splice(index, 1)
  }

  // ── Contact events ──────────────────────────────────────────────────────

  private drainContacts(): void {
    this.eventQueue.drainCollisionEvents((h1, h2, started) => {
      if (!started) return
      // Identify which side of the contact is one of "our" balls (main or
      // special). Bosses, paddle, walls, and bricks never touch each other
      // in this game, so a contact without a ball is uninteresting.
      const ball1 = h1 === this.ballColliderHandle || this.specialBallHandles.has(h1)
      const ball2 = h2 === this.ballColliderHandle || this.specialBallHandles.has(h2)
      if (!ball1 && !ball2) return
      const ballHandle = ball1 ? h1 : h2
      const other = ball1 ? h2 : h1
      const isMainBall = ballHandle === this.ballColliderHandle

      if (other === this.paddleColliderHandle) {
        // Only the main ball gets its bounce reshaped (paddle vx transfer +
        // upward floor). Special balls just bounce naturally.
        if (isMainBall) this.shapePaddleBounce()
        this.sounds.playRandomHit()
        return
      }
      if (other === this.bossColliderHandle) {
        const defeated = this.bossManager.hitCurrent()
        this.sounds.playRandomHit()
        if (defeated) this.bossColliderHandle = -1
        return
      }
      const brick = this.brickByCollider.get(other)
      if (brick) {
        this.onBrickHit(brick)
        return
      }
      // Wall hit.
      this.sounds.playRandomHit()
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
    this.sounds.playRandomHit()
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
