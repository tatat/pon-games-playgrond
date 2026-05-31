import { Assets, Container, Graphics, Rectangle, Sprite, type Texture } from 'pixi.js'
import { makeVirtualKeypad } from '../../engine/input/virtual-keypad'
import { Scene, type SceneDelta } from '../../engine/scene'
import { useRuntimeStore } from '../../store/runtime'
import { Background } from './background'
import {
  COIN_COLOR,
  COIN_RADIUS,
  DESIGN_H,
  DESIGN_W,
  DISTANCE_SCORE_FACTOR,
  DOUBLE_JUMP_VELOCITY,
  FALL_DEATH_Y,
  GRAVITY,
  GROUND_Y,
  HAZARD_COLOR,
  JUMP_CUT,
  JUMP_VELOCITY,
  LEDGE_COLOR,
  MAX_JUMPS,
  PLAYER_DISPLAY_H,
  PLAYER_FRAME_SIZE,
  PLAYER_HIT_FRAME_CX,
  PLAYER_HIT_FRAME_CY,
  PLAYER_HIT_RADIUS,
  PLAYER_MIN_X,
  PLAYER_RECOVER_ACCEL,
  PLAYER_RECOVER_DELAY,
  PLAYER_RECOVER_RATE,
  PLAYER_RECOVER_SPEED,
  PLAYER_X,
  SPEED_MAX,
  SPEED_RAMP_DISTANCE,
  SPEED_START,
  TERRAIN_COLOR,
  TERRAIN_LIP_COLOR,
} from './constants'
import { type Block, CourseWalker, SAMPLE_COURSE, SAMPLE_LOOP_START } from './course'
import { HUD } from './hud'
import { circleRectMTV, touchesLethal } from './obstacles'

type Phase = 'title' | 'playing' | 'gameover'

/** The hime run-cycle frames, in order. Loaded in `onEnter` via `preload`. */
const FRAME_ALIASES = [
  'hime-run-1',
  'hime-run-2',
  'hime-run-3',
  'hime-run-4',
  'hime-run-5',
  'hime-run-6',
] as const

/** Run-cycle playback rate (frames/sec) at the scroll speed. */
const ANIM_FPS = 12
/** Mid-stride pose held while airborne. */
const AIRBORNE_FRAME = 1
/** Restart isn't armed until this long after the killing input, so the tap
 * that ended the run doesn't instantly start the next one. */
const RESTART_ARM_MS = 350

/** Survives across restarts (each retry builds a fresh `MainScene`). */
export interface HimeSession {
  best: number
}

export interface MainSceneOptions {
  session: HimeSession
  onScoreChange?: (score: number) => void
  onGameOver?: (score: number) => void
  onRequestRestart?: () => void
}

export class MainScene extends Scene {
  private background!: Background
  private worldLayer!: Container
  private shadow = new Graphics()
  private blockGfx = new Graphics()
  private player!: Sprite
  private frames: Texture[] = []
  private hud!: HUD

  private phase: Phase = 'title'
  /** Feet y: a support surface (terrain / ledge top) at rest, larger while
   * falling, smaller while airborne. */
  private feetY = GROUND_Y
  private vy = 0
  private onGround = true
  private jumpsUsed = 0
  /** Runner's screen x. Home is `PLAYER_X`; shoved left when blocked by a
   * terrain side, drifts back when free. Squeezed off the left edge = death. */
  private playerX = PLAYER_X
  /** Seconds left before a shoved runner starts easing back home (reset on every
   * push, so recovery only begins once she's been free for a beat). */
  private recoverDelayLeft = 0
  /** Current homeward glide speed (px/s); ramps up from 0 so recovery eases in
   * rather than snapping to full speed. Zeroed on each push. */
  private recoverVel = 0
  private elapsed = 0
  private animTime = 0
  private score = 0
  private lastReportedScore = 0
  /** Distance travelled this run (px). Drives the speed ramp, so speed is a pure
   * function of distance and every run stays deterministic. */
  private distance = 0

  /** Live blocks on screen (terrain/ledge/hazard/pit/coin), screen-space x. */
  private blocks: Block[] = []
  /** Walks the authored course, emitting blocks as the world scrolls. Rebuilt on
   * each run start so the fixed course always plays from the top. */
  private walker = new CourseWalker(SAMPLE_COURSE, SAMPLE_LOOP_START)
  private gameOverAtMs = 0

  /** Tracks the jump button's held state across frames so a release can cut
   * the ascent (variable jump height). */
  private jumpHeld = false

  constructor(private readonly options: MainSceneOptions) {
    super()
    this.sortableChildren = true
  }

  async onEnter(signal: AbortSignal): Promise<void> {
    // Parallax ruined-city backdrop: scrolls with the run's distance to sell
    // forward motion (set each frame from `distance`).
    this.background = new Background()
    this.background.zIndex = -100
    this.addChild(this.background)

    await this.preload(
      FRAME_ALIASES.map((alias) => ({ alias, src: `games/hime-run/${alias}.png` })),
      signal,
    )
    this.frames = FRAME_ALIASES.map((alias) => Assets.get<Texture>(alias))

    // World layer holds the scrolling blocks, ground marks, shadow and runner.
    // The runner holds near a fixed x; the course scrolls toward her.
    this.worldLayer = new Container()
    this.worldLayer.zIndex = 0
    this.addChild(this.worldLayer)
    this.worldLayer.addChild(this.blockGfx, this.shadow)

    this.player = new Sprite(this.frames[0])
    // Anchor at the body circle's centre, so placing the sprite at the circle
    // centre (see syncPlayer) overlays the measured hit circle on the art — the
    // circle's bottom then sits at the feet.
    this.player.anchor.set(
      PLAYER_HIT_FRAME_CX / PLAYER_FRAME_SIZE,
      PLAYER_HIT_FRAME_CY / PLAYER_FRAME_SIZE,
    )
    this.player.height = PLAYER_DISPLAY_H
    this.player.scale.set(this.player.scale.y) // keep square aspect from height
    this.player.x = this.playerX
    this.worldLayer.addChild(this.player)

    this.hud = new HUD()
    this.addChild(this.hud)

    this.bindInput({ jump: ['Space', 'ArrowUp', 'KeyW'] })

    const keypad = this.use(
      makeVirtualKeypad(this.input, this.layout, {
        actions: { a: { action: 'jump', label: 'JUMP' } },
        option: { tap: () => useRuntimeStore.getState().toggleGamePaused() },
      }),
    )
    this.layout.uiLayer.addChild(keypad.view)
    this.use(() => {
      this.layout.uiLayer.removeChild(keypad.view)
    })

    // Tap anywhere on the playfield to jump (press) / cut the jump (release).
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

    // Fill the screen with the opening patterns so the player starts on ground.
    this.blocks = this.walker.step(0)
    this.redrawBlocks()
    this.syncPlayer()
    this.redrawShadow()
    this.hud.showTitle(this.options.session.best)
  }

  override onUpdate(dt: SceneDelta): void {
    const { dtSec } = dt

    const jumpDown = this.input.isDown('jump')
    const jumpJustPressed = this.input.wasJustPressed('jump')

    if (jumpJustPressed) {
      if (this.phase === 'title') {
        this.startGame()
      } else if (this.phase === 'playing') {
        this.jump()
      } else if (
        this.phase === 'gameover' &&
        this.elapsed * 1000 - this.gameOverAtMs >= RESTART_ARM_MS
      ) {
        this.options.onRequestRestart?.()
      }
    }
    // Releasing while still rising cuts the ascent → variable jump height.
    if (this.phase === 'playing' && this.jumpHeld && !jumpDown && this.vy < 0) {
      this.vy *= JUMP_CUT
    }
    this.jumpHeld = jumpDown

    this.elapsed += dtSec

    if (this.phase === 'playing') {
      this.stepPlaying(dtSec)
    }

    this.background.update(this.distance)
    this.advanceAnimation(dtSec)
    this.syncPlayer()
    this.input.endFrame()
  }

  override onExit(): void {
    // All display objects are children of the scene container; SceneManager
    // destroys them. Registered `use` cleanups detach the keypad + tap handlers.
  }

  // ── Phase transitions ──────────────────────────────────────────────────────

  private startGame(): void {
    this.phase = 'playing'
    this.score = 0
    this.lastReportedScore = 0
    this.distance = 0
    this.feetY = GROUND_Y
    this.vy = 0
    this.onGround = true
    this.jumpsUsed = 0
    this.playerX = PLAYER_X
    this.recoverDelayLeft = 0
    // Fresh walker so the fixed course restarts from pattern 0 every run; step(0)
    // fills the screen with the opening patterns under the player.
    this.walker = new CourseWalker(SAMPLE_COURSE, SAMPLE_LOOP_START)
    this.blocks = this.walker.step(0)
    this.hud.showPlaying()
    this.hud.setScore(0)
  }

  private jump(): void {
    if (this.onGround) {
      this.vy = JUMP_VELOCITY
      this.onGround = false
      this.jumpsUsed = 1
    } else if (this.jumpsUsed < MAX_JUMPS) {
      this.vy = DOUBLE_JUMP_VELOCITY
      this.jumpsUsed += 1
    }
  }

  private die(): void {
    this.phase = 'gameover'
    this.gameOverAtMs = this.elapsed * 1000
    const final = Math.floor(this.score)
    this.options.session.best = Math.max(this.options.session.best, final)
    this.hud.showGameOver(final, this.options.session.best)
    this.options.onGameOver?.(final)
  }

  // ── Per-frame simulation while playing ──────────────────────────────────────

  private stepPlaying(dtSec: number): void {
    // Vertical integration. `prevFeetY` decides landing on a surface from above.
    const prevFeetY = this.feetY
    this.vy += GRAVITY * dtSec
    this.feetY += this.vy * dtSec

    // Scroll the world; speed ramps with distance (pure function of distance, so
    // the run stays deterministic). Advance distance and score by the same dx.
    const t = Math.min(1, this.distance / SPEED_RAMP_DISTANCE)
    const speed = SPEED_START + (SPEED_MAX - SPEED_START) * t
    const dx = speed * dtSec
    this.distance += dx
    this.score += dx * DISTANCE_SCORE_FACTOR
    this.reportScore()

    // Emit the authored course's next blocks as the world scrolls; move and cull.
    this.blocks.push(...this.walker.step(dx))
    for (const b of this.blocks) b.x -= dx
    this.blocks = this.blocks.filter((b) => b.x + b.width > -60)

    // Collision: the runner is ONE body circle, and every block is resolved with
    // the same circle-vs-rect push-out (circleRectMTV). The push's dominant axis
    // says what the contact is: a mostly-vertical push up = landing on top; a
    // mostly-horizontal push = the climb-and-squeeze side shove. No feet-point or
    // half-width special cases — landing, squeeze, death and coins all read the
    // same circle.
    const R = PLAYER_HIT_RADIUS

    // Vertical pass: land on the highest block the circle is resting on. terrain
    // supports from any side; ledge only when descending onto it from above.
    let landFeetY = Number.POSITIVE_INFINITY
    {
      const cy = this.feetY - R
      for (const b of this.blocks) {
        if (b.type !== 'terrain' && b.type !== 'ledge') continue
        const mtv = circleRectMTV(this.playerX, cy, R, b.x, b.y, b.width, b.height)
        if (!mtv) continue
        if (mtv.y >= 0 || Math.abs(mtv.y) < Math.abs(mtv.x)) continue // not an upward landing
        if (b.type === 'ledge' && prevFeetY > b.y) continue // one-way: only from above
        landFeetY = Math.min(landFeetY, this.feetY + mtv.y)
      }
    }
    const wasOnGround = this.onGround
    if (landFeetY !== Number.POSITIVE_INFINITY && this.vy >= 0) {
      this.feetY = landFeetY
      this.vy = 0
      this.onGround = true
      this.jumpsUsed = 0
      // Touching down after being airborne re-arms the recovery delay, so she
      // pauses a beat before drifting home (recovery is frozen mid-air anyway).
      if (!wasOnGround) this.recoverDelayLeft = PLAYER_RECOVER_DELAY
    } else {
      this.onGround = false
    }

    // Death: the body circle touches a lethal block (a pit one cell down, or a
    // hazard), or a safety-net fall well below the screen. The circle's bottom is
    // the feet (`feetY`), same circle as landing — so a 1-cell pit kills one cell
    // down.
    if (this.feetY > FALL_DEATH_Y || touchesLethal(this.blocks, this.playerX, this.feetY - R, R)) {
      this.die()
      return
    }

    // Horizontal pass — climb-and-squeeze: a terrain block the circle hits side-on
    // (and hasn't gotten on top of) shoves her left; off it she drifts back toward
    // home. Squeezed off the left edge is the only non-lethal-block death.
    let push = 0
    {
      const cy = this.feetY - R
      for (const b of this.blocks) {
        if (b.type !== 'terrain') continue
        const mtv = circleRectMTV(this.playerX, cy, R, b.x, b.y, b.width, b.height)
        if (!mtv) continue
        if (mtv.x >= 0 || Math.abs(mtv.x) < Math.abs(mtv.y)) continue // not a leftward side hit
        push = Math.max(push, -mtv.x)
      }
    }
    if (push > 0) {
      this.playerX -= push
      // Hold recovery off until she's been free of the block for a beat, and
      // start the next glide from a standstill so it eases back in.
      this.recoverDelayLeft = PLAYER_RECOVER_DELAY
      this.recoverVel = 0
    } else if (this.onGround && this.playerX < PLAYER_X) {
      // Only recover while grounded — a jump freezes her drift back home (and the
      // delay) until she lands.
      if (this.recoverDelayLeft > 0) {
        this.recoverDelayLeft -= dtSec
      } else {
        // Drift home: ramp the glide speed up from 0 (ease-in), cap it, and slow
        // it as she nears home (ease-out); snap the last sub-pixel.
        const remaining = PLAYER_X - this.playerX
        this.recoverVel = Math.min(
          PLAYER_RECOVER_SPEED,
          this.recoverVel + PLAYER_RECOVER_ACCEL * dtSec,
        )
        const speed = Math.min(this.recoverVel, remaining * PLAYER_RECOVER_RATE)
        this.playerX += speed * dtSec
        if (PLAYER_X - this.playerX < 0.5) {
          this.playerX = PLAYER_X
          this.recoverVel = 0
        }
      }
    }
    if (this.playerX <= PLAYER_MIN_X) {
      this.playerX = PLAYER_MIN_X
      this.die()
      return
    }

    this.redrawBlocks()
    this.redrawShadow()
  }

  private reportScore(): void {
    const v = Math.floor(this.score)
    if (v !== this.lastReportedScore) {
      this.lastReportedScore = v
      this.hud.setScore(v)
      this.options.onScoreChange?.(v)
    }
  }

  // ── Rendering ───────────────────────────────────────────────────────────────

  private advanceAnimation(dtSec: number): void {
    if (this.phase === 'playing' && !this.onGround) {
      this.setFrame(AIRBORNE_FRAME)
      return
    }
    this.animTime += dtSec
    this.setFrame(Math.floor(this.animTime * ANIM_FPS) % this.frames.length)
  }

  private setFrame(index: number): void {
    const tex = this.frames[index]
    if (tex) this.player.texture = tex
  }

  private syncPlayer(): void {
    this.player.x = this.playerX
    // Sprite is anchored at the body circle's centre, so place it there: at
    // playerX, one radius above feetY (the circle's bottom = the feet).
    this.player.y = this.feetY - PLAYER_HIT_RADIUS
  }

  /** Draw every block by type. `pit` blocks are invisible (the hole reads as a
   * hole because no terrain is drawn there). */
  private redrawBlocks(): void {
    const g = this.blockGfx
    g.clear()
    // terrain — solid fill + a brighter top lip on the standable surface.
    for (const b of this.blocks) {
      if (b.type === 'terrain') g.rect(b.x, b.y, b.width, b.height)
    }
    g.fill(TERRAIN_COLOR)
    for (const b of this.blocks) {
      if (b.type === 'terrain') g.rect(b.x, b.y, b.width, 5)
    }
    g.fill(TERRAIN_LIP_COLOR)
    // ledge — one-way slab.
    for (const b of this.blocks) {
      if (b.type === 'ledge') g.roundRect(b.x, b.y, b.width, b.height, 6)
    }
    g.fill(LEDGE_COLOR)
    // hazard — visible lethal.
    for (const b of this.blocks) {
      if (b.type === 'hazard') g.roundRect(b.x, b.y, b.width, b.height, 6)
    }
    g.fill(HAZARD_COLOR)
    // coin — disc centred in its cell.
    for (const b of this.blocks) {
      if (b.type === 'coin') g.circle(b.x + b.width / 2, b.y + b.height / 2, COIN_RADIUS)
    }
    g.fill(COIN_COLOR)
  }

  /** Top y of the terrain/ledge surface directly beneath the runner at screen
   * `x` (the highest one at/below her feet), or null over a hole. The shadow is
   * cast onto this, so it sits on whatever she is actually above. */
  private shadowSurface(x: number, feetY: number): number | null {
    let top: number | null = null
    for (const b of this.blocks) {
      if (b.type !== 'terrain' && b.type !== 'ledge') continue
      if (x < b.x || x > b.x + b.width) continue
      if (b.y < feetY) continue // surface above her feet — not ground below
      if (top === null || b.y < top) top = b.y
    }
    return top
  }

  private redrawShadow(): void {
    this.shadow.clear()
    // Cast on the surface beneath her; over a hole there is none, so no shadow.
    const surface = this.shadowSurface(this.playerX, this.feetY)
    if (surface === null) return
    // Shrink and fade with height above that surface.
    const airborne = Math.min(1, (surface - this.feetY) / 280)
    const s = 1 - 0.6 * airborne
    this.shadow.ellipse(this.playerX, surface + 6, 46 * s, 12 * s).fill({
      color: 0x000000,
      alpha: 0.28 * s,
    })
  }
}
