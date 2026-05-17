import RAPIER from '@dimforge/rapier2d-compat'
import { Assets, Container, Graphics, Rectangle } from 'pixi.js'
import { DESIGN_H, DESIGN_W } from '../../engine/constants'
import { Scene, type SceneDelta } from '../../engine/scene'
import { useUserStore } from '../../store/user'
import {
  GAME_ID,
  GRAVITY,
  OBSTACLE_SPAWN_RATE_MS,
  PLAYER_RADIUS,
  STICKER_SIZES,
  STICKERS,
} from './constants'
import { Debris } from './debris'
import { gameSpeedIncrement, scoreIncrement, spawnIntervalMs } from './difficulty'
import { makeFloatPad } from './float-pad'
import { HUD } from './hud'
import { Obstacle } from './obstacle'
import { Player } from './player'
import { Starfield } from './starfield'
import { playerHitsWall, Walls } from './walls'

type Phase = 'waiting' | 'playing' | 'dying' | 'gameover'

const BACKGROUND_COLOR = 0x1a1a2e

export interface MainSceneOptions {
  /** When true, skip the start screen and begin playing immediately. Used by
   * the restart path. */
  startImmediately?: boolean
  /** Called when the user presses (or taps) while the game-over screen is up.
   * The owner (GameModule.start) restarts the scene by handing a fresh
   * MainScene instance to its SceneManager. */
  onRequestRestart?: () => void
  /** Fires once when this run ends. */
  onGameOver?: (score: number) => void
  /** Fires when the displayed (floored) score changes. */
  onScoreChange?: (score: number) => void
}

export class MainScene extends Scene {
  private phase: Phase = 'waiting'
  private world!: RAPIER.World
  private player!: Player
  private starfield!: Starfield
  private hud!: HUD
  private obstacles: Obstacle[] = []
  private debrisList: Debris[] = []
  private score = 0
  private gameSpeed = 1
  private timeSinceSpawnMs = 0
  private dyingElapsedMs = 0
  private lastReportedScore = 0

  constructor(private readonly options: MainSceneOptions = {}) {
    super()
    this.sortableChildren = true
  }

  async onEnter(signal: AbortSignal): Promise<void> {
    // Solid dark-blue backdrop covering the full logical viewport.
    const bg = new Graphics().rect(0, 0, DESIGN_W, DESIGN_H).fill(BACKGROUND_COLOR)
    bg.zIndex = -100
    this.addChild(bg)

    await this.preload(
      STICKERS.flatMap((name) =>
        STICKER_SIZES.map((size) => ({
          alias: `${name}-${size}`,
          src: `games/sticker-drift/stickers/${name}-${size}@2x.png`,
        })),
      ),
      signal,
    )

    // Rapier world treats pixels as meters. Gravity 500 px/s² ≈ feel of the
    // original Phaser game without any unit conversion. The world's timestep
    // is overwritten per frame in onUpdate (variable-step physics).
    this.world = new RAPIER.World({ x: 0, y: GRAVITY })

    this.starfield = new Starfield(this.rng)
    this.addChild(this.starfield)

    this.addChild(new Walls())

    this.player = new Player(this.world, Assets.get('d1-64'))
    this.addChild(this.player)

    this.hud = new HUD()
    this.addChild(this.hud)
    this.hud.showStart()

    this.bindInput({ float: ['Space'] }, signal)

    // Full-viewport hit area for tap/click. Doubles as the "any new press"
    // detector for Start and Restart.
    const tap = new Container()
    tap.eventMode = 'static'
    tap.hitArea = new Rectangle(0, 0, DESIGN_W, DESIGN_H)
    tap.zIndex = -1
    this.addChild(tap)
    const onDown = (): void => this.input.press('float')
    const onUp = (): void => this.input.release('float')
    tap.on('pointerdown', onDown)
    tap.on('pointerup', onUp)
    tap.on('pointerupoutside', onUp)
    tap.on('pointercancel', onUp)
    signal.addEventListener(
      'abort',
      () => {
        tap.off('pointerdown', onDown)
        tap.off('pointerup', onUp)
        tap.off('pointerupoutside', onUp)
        tap.off('pointercancel', onUp)
      },
      { once: true },
    )

    // Touch buttons. Two attach points:
    //  - `uiMargin` → uiLayer, visible when a letterbox margin has room.
    //  - `gameOverlay` → inside the game viewport, holds the small fallback
    //    pause button shown when the margin pad isn't visible.
    const floatPad = makeFloatPad(this.input, this.layout, signal)
    floatPad.gameOverlay.zIndex = 50
    this.addChild(floatPad.gameOverlay)
    this.layout.uiLayer.addChild(floatPad.uiMargin)
    signal.addEventListener('abort', () => this.layout.uiLayer.removeChild(floatPad.uiMargin), {
      once: true,
    })

    if (this.options.startImmediately) this.startPlaying()
  }

  override onUpdate(dt: SceneDelta): void {
    const { dtMs, dtSec } = dt
    const justPressed = this.input.wasJustPressed('float')

    if (this.phase === 'waiting' && justPressed) {
      this.startPlaying()
    } else if (this.phase === 'gameover' && justPressed) {
      this.options.onRequestRestart?.()
      // The manager will swap us out shortly; nothing more to do this frame.
    }

    if (this.phase === 'playing') {
      this.player.setFloating(this.input.isDown('float'))

      this.score += scoreIncrement(dtMs)
      this.gameSpeed += gameSpeedIncrement(dtMs)
      this.hud.setScore(this.score)
      const displayed = Math.floor(this.score)
      if (displayed !== this.lastReportedScore) {
        this.lastReportedScore = displayed
        this.options.onScoreChange?.(displayed)
      }

      this.timeSinceSpawnMs += dtMs
      const interval = spawnIntervalMs(OBSTACLE_SPAWN_RATE_MS, this.gameSpeed)
      while (this.timeSinceSpawnMs >= interval) {
        this.spawnObstacle()
        this.timeSinceSpawnMs -= interval
      }

      // Variable-step physics for the player. `dtSec` is already capped by
      // SceneManager (MAX_DT_SEC), so we just hand it straight to Rapier.
      this.player.applyInput(dtSec)
      this.world.timestep = dtSec
      this.world.step()

      for (const o of this.obstacles) o.update(dtSec, this.player.y, this.gameSpeed)
      this.cullObstacles()

      const px = this.player.x
      const py = this.player.y
      if (playerHitsWall(py, PLAYER_RADIUS)) {
        this.handleCollision()
      } else {
        for (const o of this.obstacles) {
          if (o.collidesWith(px, py, PLAYER_RADIUS)) {
            this.handleCollision()
            break
          }
        }
      }
    } else if (this.phase === 'dying') {
      this.dyingElapsedMs += dtMs
      // Obstacles keep flying through the death animation.
      for (const o of this.obstacles) o.update(dtSec, this.player.y, this.gameSpeed)
      this.cullObstacles()
      if (this.dyingElapsedMs >= 1000) this.enterGameOver()
    }

    if (this.phase === 'playing' || this.phase === 'dying') {
      this.starfield.update(dtSec, this.gameSpeed)
      this.player.syncFromBody(dtMs)
    }

    if (this.debrisList.length > 0) {
      this.debrisList = this.debrisList.filter((d) => {
        const alive = d.update(dtMs)
        if (!alive) this.removeChild(d)
        return alive
      })
    }

    this.input.endFrame()
  }

  override onExit(): void {
    this.world?.free()
    this.obstacles = []
    this.debrisList = []
  }

  // ── Phase transitions ───────────────────────────────────────────────────

  private startPlaying(): void {
    this.phase = 'playing'
    this.hud.showPlaying()
  }

  private handleCollision(): void {
    if (this.phase !== 'playing') return
    this.phase = 'dying'
    const debris = new Debris(this.player.x, this.player.y)
    this.debrisList.push(debris)
    this.addChild(debris)
    this.player.kill()
  }

  private enterGameOver(): void {
    this.phase = 'gameover'
    const finalScore = Math.floor(this.score)
    this.hud.showGameOver(finalScore)
    useUserStore.getState().setHighScore(GAME_ID, finalScore)
    this.options.onGameOver?.(finalScore)
  }

  // ── Obstacles ───────────────────────────────────────────────────────────

  private spawnObstacle(): void {
    const o = new Obstacle({
      rng: this.rng,
      getTexture: (alias) => Assets.get(alias),
      playerX: this.player.x,
      playerY: this.player.y,
      gameSpeed: this.gameSpeed,
    })
    this.obstacles.push(o)
    this.addChild(o)
  }

  private cullObstacles(): void {
    let i = 0
    while (i < this.obstacles.length) {
      const o = this.obstacles[i]
      if (o?.isOffScreen()) {
        this.removeChild(o)
        o.destroy({ children: true })
        this.obstacles.splice(i, 1)
      } else {
        i++
      }
    }
  }
}
