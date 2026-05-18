import RAPIER from '@dimforge/rapier2d-compat'
import { Container, Graphics, Rectangle } from 'pixi.js'
import { DESIGN_H, DESIGN_W } from '../../engine/constants'
import { makeVirtualKeypad } from '../../engine/input/virtual-keypad'
import { Scene, type SceneDelta } from '../../engine/scene'
import { Easings, type Tween } from '../../engine/util/tween'
import { useRuntimeStore } from '../../store/runtime'
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
import { useBreakoutCloneStore } from './store'
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
  /** Infinite glow/pulse tweens per special ball — cancelled when the
   * ball is culled so they don't keep mutating destroyed sprites. */
  private specialBallTweens = new Map<SpecialBall, Tween[]>()

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

    // Debug mode: seed the score near the boss threshold so the boss
    // path is reachable without grinding bricks. Mirrors the Phaser
    // original's `initializeDebugMode`.
    if (useBreakoutCloneStore.getState().debugMode) {
      this.state.addScore(900)
    }

    this.hud = new HUD()
    this.addChild(this.hud)
    this.hud.setScore(this.state.score)
    this.hud.setLives(this.state.lives)

    // Bricks. Generator builds against the same world and tracks them by
    // collider handle through `onBrickAdded` so the scene's contact handler
    // can resolve handle → entity in O(1). Each new brick also spawn-fades
    // via the scene's tween system so generation (initial + 5s spawn
    // timer + boss-defeat regen) feels alive instead of popping in.
    this.bricks = new BrickGenerator(this.world, this, this.rng, {
      onBrickAdded: (brick) => {
        this.brickByCollider.set(brick.colliderHandle, brick)
        this.tweenBrickSpawnIn(brick)
      },
      onBrickRemoved: (brick) => {
        this.brickByCollider.delete(brick.colliderHandle)
      },
    })
    this.bricks.generateInitial()

    this.bossManager = new BossManager(this.world, this, this.rng, {
      onBossBattleWillStart: () => {
        // Fade the existing bricks out (1000ms) then destroy them. The
        // spawn delay (BOSS_SPAWN_DELAY_MS) is sized to cover the fade.
        this.fadeBricksOutAndClear(1000)
      },
      onBossStarted: (boss) => {
        this.bossColliderHandle = boss.colliderHandle
      },
      onBossDefeated: (_boss, bonus) => {
        this.bossColliderHandle = -1
        this.state.addScore(bonus)
        this.reportScore()
        // generateInitial fires onBrickAdded for each — the spawn-fade
        // tween wired there handles the post-boss fade-in by itself.
        this.bricks.generateInitial()
      },
    })

    this.bindInput({
      left: ['ArrowLeft', 'KeyA'],
      right: ['ArrowRight', 'KeyD'],
      fast: ['ShiftLeft', 'ShiftRight'],
      jump: ['Space'],
    })

    // Virtual keypad: stick for left/right, A=JUMP, B=FAST, Option=pause.
    // The engine module anchors widgets to viewport corners with
    // space-between padding, so they slide into the letterbox margins as
    // the viewport grows and overlap the playfield when margins are tight.
    const keypad = this.use(
      makeVirtualKeypad(this.input, this.layout, {
        stick: { left: 'left', right: 'right' },
        actions: {
          a: { action: 'jump', label: 'JUMP' },
          b: { action: 'fast', label: 'FAST' },
        },
        option: { tap: () => useRuntimeStore.getState().setGamePaused(true) },
      }),
    )
    this.layout.uiLayer.addChild(keypad.view)
    this.use(() => {
      this.layout.uiLayer.removeChild(keypad.view)
    })

    // Tap-to-start / tap-to-restart. The JUMP button (or Space) drives
    // the in-game jump itself, so this only fires the `jump` action in
    // 'waiting' / 'gameover' phases — otherwise a center-screen tap
    // would double-trigger the paddle hop during play.
    const tap = new Container()
    tap.eventMode = 'static'
    tap.hitArea = new Rectangle(0, 0, DESIGN_W, DESIGN_H)
    tap.zIndex = -1
    this.addChild(tap)
    const onTap = (): void => {
      if (this.phase !== 'playing') this.input.press('jump')
    }
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
      if (this.paddle.startJump()) this.tweenPaddleJumpSquash()
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
    if (this.paddle.checkLanding()) this.tweenPaddleLandSquash()
    this.paddle.clampToBounds()
    this.paddle.syncView()
    this.ball.syncView()

    this.updateTweens(dtMs)

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
    // Tweens are cancelled by `Scene.runTeardown` after `onExit`, but the
    // map keeps Pixi refs alive until then — drop them eagerly.
    this.specialBallTweens.clear()
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
   * Doesn't cost a life when it falls past the death line. The Phaser
   * original adds two infinite tweens for visual flair (alpha pulse +
   * scale pulse) — we mirror both via Scene.tween. */
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

    const alphaTween = this.tween({
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: Easings.easeInOutSine,
      onUpdate: (t) => {
        sb.alpha = 1 - t * 0.6
      },
    }).tween
    const scaleTween = this.tween({
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: Easings.easeInOutSine,
      onUpdate: (t) => {
        const s = 1 + t * 0.3
        sb.scale.set(s)
      },
    }).tween
    this.specialBallTweens.set(sb, [alphaTween, scaleTween])
  }

  private removeSpecialBall(index: number): void {
    const sb = this.specialBalls[index]
    if (!sb) return
    const tweens = this.specialBallTweens.get(sb)
    if (tweens) for (const t of tweens) t.cancel()
    this.specialBallTweens.delete(sb)
    this.specialBallHandles.delete(sb.colliderHandle)
    this.removeChild(sb)
    sb.removeFromWorld(this.world)
    sb.destroy({ children: true })
    this.specialBalls.splice(index, 1)
  }

  // ── Animation helpers ───────────────────────────────────────────────────

  /** Fade every current brick to alpha 0 over `durationMs` (Phaser Power2)
   * and destroy them once the tween completes. Used as the boss-battle
   * intro so the playfield smoothly empties for the boss spawn. */
  private fadeBricksOutAndClear(durationMs: number): void {
    const snapshot = [...this.bricks.bricks]
    if (snapshot.length === 0) return
    const startAlpha = snapshot.map((b) => b.alpha)
    // Disable each brick's physics immediately so the ball passes through
    // the fading corpses instead of either bouncing off them or competing
    // with `fadeBrickOutAndDestroy` for the same brick.
    for (const b of snapshot) {
      this.brickByCollider.delete(b.colliderHandle)
      this.world.getCollider(b.colliderHandle)?.setEnabled(false)
    }
    void this.tween({
      duration: durationMs,
      ease: Easings.power2,
      onUpdate: (t) => {
        for (let i = 0; i < snapshot.length; i++) {
          const b = snapshot[i]
          const a = startAlpha[i]
          if (b?.parent && a !== undefined) b.alpha = a * (1 - t)
        }
      },
      onComplete: () => {
        for (const b of snapshot) {
          if (b.parent) this.bricks.destroyBrick(b)
        }
      },
    }).promise
  }

  /** Phaser-original: bricks fade in from alpha 0 over 500ms when they
   * spawn (initial generation, every-5s spawn timer, post-boss regen). */
  private tweenBrickSpawnIn(brick: Brick): void {
    brick.alpha = 0
    void this.tween({
      duration: 500,
      ease: Easings.power2,
      onUpdate: (t) => {
        if (brick.parent) brick.alpha = t
      },
    }).promise
  }

  /** Per-hit destruction fade: disable physics + drop from contact map
   * immediately so the ball can't bounce off the corpse, then fade the
   * visual out over 200ms before actually destroying the brick. */
  private fadeBrickOutAndDestroy(brick: Brick): void {
    this.brickByCollider.delete(brick.colliderHandle)
    this.world.getCollider(brick.colliderHandle)?.setEnabled(false)
    const startAlpha = brick.alpha
    void this.tween({
      duration: 200,
      ease: Easings.power2,
      onUpdate: (t) => {
        if (brick.parent) brick.alpha = startAlpha * (1 - t)
      },
      onComplete: () => {
        if (brick.parent) this.bricks.destroyBrick(brick)
      },
    }).promise
  }

  /** Squash-and-stretch on jump start: scaleY 1 → 1.2 → 1. */
  private tweenPaddleJumpSquash(): void {
    void this.tween({
      duration: 150,
      yoyo: true,
      ease: Easings.power2,
      onUpdate: (t) => {
        this.paddle.scale.y = 1 + t * 0.2
      },
    }).promise
  }

  /** Squash on landing: scaleY 1 → 0.9 → 1. */
  private tweenPaddleLandSquash(): void {
    void this.tween({
      duration: 120,
      yoyo: true,
      ease: Easings.power2,
      onUpdate: (t) => {
        this.paddle.scale.y = 1 - t * 0.1
      },
    }).promise
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
    this.sounds.playRandomHit()
    this.reportScore()
    this.fadeBrickOutAndDestroy(brick)
    // `brickByCollider` is the set of *hittable* bricks (the fading
    // destroy-tween already removed `brick` from it). Once it's empty
    // every remaining brick is mid-fade-out and the playfield counts as
    // cleared for the bonus + regen.
    if (this.brickByCollider.size === 0) this.allBricksCleared()
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
