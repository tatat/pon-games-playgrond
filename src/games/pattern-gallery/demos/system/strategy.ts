import { Container, Graphics } from 'pixi.js'
import { COLORS } from '../../constants'
import type { PatternDemo } from '../../demo'
import { text } from '../../demo-util'
import { axis, clamp, FLOOR_INSET, hint } from './shared'

const towerDefense: PatternDemo = {
  id: 'tower-defense-style',
  name: 'Tower-defense-style',
  caption: 'Pick a slot ← →, build with Space; towers auto-fire at enemies on the path.',
  category: 'system',
  params: [
    { key: 'range', label: 'Tower range', min: 1, max: 5, step: 1, default: 2, unit: 'cells' },
    {
      key: 'spawn',
      label: 'Spawn interval',
      min: 300,
      max: 2000,
      step: 100,
      default: 900,
      unit: 'ms',
    },
  ],
  mount(ctx) {
    const { width, input, params, theme } = ctx
    const root = new Container()
    ctx.stage.addChild(root)
    hint(ctx, '← → ↑ ↓ : move cursor · Space : build')

    const COST = 50
    const REWARD = 20
    let gold = 150

    // ── Grid ────────────────────────────────────────────────────────────────
    const cols = 11
    const rows = 7
    const fieldTop = 26
    const fieldH = ctx.height - FLOOR_INSET - 6 - fieldTop
    const cell = Math.floor(Math.min(width / cols, fieldH / rows))
    const gx = Math.floor((width - cols * cell) / 2)
    const gy = fieldTop + Math.floor((fieldH - rows * cell) / 2)
    const ccx = (c: number): number => gx + c * cell + cell / 2
    const ccy = (r: number): number => gy + r * cell + cell / 2

    const pathCells: [number, number][] = [
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
      [3, 2],
      [3, 3],
      [3, 4],
      [4, 4],
      [5, 4],
      [6, 4],
      [7, 4],
      [7, 3],
      [7, 2],
      [7, 1],
      [8, 1],
      [9, 1],
      [10, 1],
    ]
    const pathSet = new Set(pathCells.map(([c, r]) => `${c},${r}`))
    const pathPx = pathCells.map(([c, r]) => ({ x: ccx(c), y: ccy(r) }))
    const END = pathPx.length - 1

    // Static grid + path track.
    const gridG = new Graphics()
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const isPath = pathSet.has(`${c},${r}`)
        gridG
          .rect(gx + c * cell, gy + r * cell, cell, cell)
          .fill(isPath ? { color: COLORS.border, alpha: 0.9 } : { color: 0xffffff, alpha: 0.015 })
          .stroke({ color: COLORS.border, width: 1, alpha: isPath ? 0 : 0.5 })
      }
    }
    root.addChild(gridG)

    // ── HUD (gold + cost) ─────────────────────────────────────────────────
    const goldText = text(`GOLD ${gold}`, {
      fill: 0xffd166,
      fontSize: 15,
      fontFamily: theme.fontMono,
    })
    goldText.position.set(0, 2)
    root.addChild(goldText)
    const costText = text(`TOWER ${COST} · kill +${REWARD}`, {
      fill: COLORS.muted,
      fontSize: 14,
      fontFamily: theme.fontMono,
    })
    costText.anchor.set(1, 0)
    costText.position.set(width, 3)
    root.addChild(costText)
    let lastGold = gold

    // ── Towers + cursor ──────────────────────────────────────────────────
    const towerG = new Graphics()
    const cursorG = new Graphics()
    root.addChild(towerG, cursorG)
    interface Tower {
      c: number
      r: number
      cool: number
    }
    const towers: Tower[] = []
    const occupied = new Set<string>()
    let cc = 0
    let cr = 0 // cursor cell (0,0 is buildable — the path starts at row 1)

    const buildable = (c: number, r: number): boolean =>
      !pathSet.has(`${c},${r}`) && !occupied.has(`${c},${r}`)
    // Range is a Manhattan radius in cells → a diamond block of cells.
    const fillRange = (
      g: Graphics,
      tc: number,
      tr: number,
      range: number,
      color: number,
      alpha: number,
    ): void => {
      for (let dr = -range; dr <= range; dr++) {
        for (let dc = -range; dc <= range; dc++) {
          if (Math.abs(dc) + Math.abs(dr) > range) continue
          const c = tc + dc
          const r = tr + dr
          if (c < 0 || c >= cols || r < 0 || r >= rows) continue
          g.rect(gx + c * cell, gy + r * cell, cell, cell).fill({ color, alpha })
        }
      }
    }
    const redrawTowers = (): void => {
      towerG.clear()
      const range = params.get('range')
      for (const t of towers) fillRange(towerG, t.c, t.r, range, COLORS.accent, 0.08)
      for (const t of towers) {
        towerG
          .roundRect(ccx(t.c) - cell * 0.3, ccy(t.r) - cell * 0.3, cell * 0.6, cell * 0.6, 4)
          .fill(COLORS.accent)
      }
    }
    const redrawCursor = (): void => {
      cursorG.clear()
      const ok = buildable(cc, cr)
      const afford = gold >= COST
      const col = !ok ? COLORS.faint : afford ? 0x6ee7b7 : 0xf4978e
      if (ok && afford) fillRange(cursorG, cc, cr, params.get('range'), col, 0.14)
      cursorG
        .rect(gx + cc * cell + 1, gy + cr * cell + 1, cell - 2, cell - 2)
        .stroke({ color: col, width: 3 })
    }

    // ── Enemy + shot pools ───────────────────────────────────────────────
    interface Enemy {
      g: Graphics
      alive: boolean
      p: number
      hp: number
    }
    const enemies: Enemy[] = Array.from({ length: 12 }, () => {
      const g = new Graphics().circle(0, 0, Math.min(11, cell * 0.34)).fill(COLORS.rowActive)
      g.visible = false
      root.addChild(g)
      return { g, alive: false, p: 0, hp: 3 }
    })
    const posOf = (p: number): { x: number; y: number } => {
      const i = Math.max(0, Math.min(Math.floor(p), pathPx.length - 2))
      const a = pathPx[i]
      const b = pathPx[i + 1]
      if (!a || !b) return a ?? { x: 0, y: 0 }
      const t = p - i
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    }
    interface Shot {
      g: Graphics
      alive: boolean
      x: number
      y: number
      target: Enemy | null
    }
    const shots: Shot[] = Array.from({ length: 24 }, () => {
      const g = new Graphics().circle(0, 0, 4).fill(COLORS.text)
      g.visible = false
      root.addChild(g)
      return { g, alive: false, x: 0, y: 0, target: null }
    })

    redrawTowers()
    redrawCursor()

    const ENEMY_SPEED = 2.4 // cells/sec
    const SHOT_SPEED = 360
    const FIRE_CD = 0.5
    let spawnT = 0
    let lastRange = params.get('range')

    return {
      update: (dt) => {
        const s = dt.dtSec
        let cursorDirty = false
        const range = params.get('range')
        if (range !== lastRange) {
          lastRange = range
          redrawTowers()
          cursorDirty = true
        }

        const mx = axis(input, 'left', 'right')
        const my = axis(input, 'up', 'down')
        if (input.wasJustPressed('left') || input.wasJustPressed('right')) {
          cc = clamp(cc + mx, 0, cols - 1)
          cursorDirty = true
        }
        if (input.wasJustPressed('up') || input.wasJustPressed('down')) {
          cr = clamp(cr + my, 0, rows - 1)
          cursorDirty = true
        }
        if (input.wasJustPressed('action') && buildable(cc, cr) && gold >= COST) {
          towers.push({ c: cc, r: cr, cool: 0 })
          occupied.add(`${cc},${cr}`)
          gold -= COST
          redrawTowers()
          cursorDirty = true
        }

        // Spawn.
        spawnT += dt.dtMs
        if (spawnT >= params.get('spawn')) {
          spawnT = 0
          const e = enemies.find((en) => !en.alive)
          if (e) {
            e.alive = true
            e.p = 0
            e.hp = 3
            e.g.visible = true
          }
        }

        // Move enemies along the grid path.
        for (const e of enemies) {
          if (!e.alive) continue
          e.p += ENEMY_SPEED * s
          if (e.p >= END) {
            e.alive = false
            e.g.visible = false
            continue
          }
          const p = posOf(e.p)
          e.g.position.set(p.x, p.y)
        }

        // Towers fire at an enemy whose cell is within Manhattan `range`
        // (the highlighted diamond), picking the closest one to aim at.
        for (const t of towers) {
          t.cool -= s
          if (t.cool > 0) continue
          const tx = ccx(t.c)
          const ty = ccy(t.r)
          let best: Enemy | null = null
          let bestD = Number.POSITIVE_INFINITY
          for (const e of enemies) {
            if (!e.alive) continue
            const p = posOf(e.p)
            const ec = clamp(Math.floor((p.x - gx) / cell), 0, cols - 1)
            const er = clamp(Math.floor((p.y - gy) / cell), 0, rows - 1)
            if (Math.abs(ec - t.c) + Math.abs(er - t.r) > range) continue
            const d = Math.hypot(p.x - tx, p.y - ty)
            if (d < bestD) {
              bestD = d
              best = e
            }
          }
          if (best) {
            const sh = shots.find((x) => !x.alive)
            if (sh) {
              sh.alive = true
              sh.x = tx
              sh.y = ty
              sh.target = best
              sh.g.visible = true
              t.cool = FIRE_CD
            }
          }
        }

        // Move projectiles; damage + reward gold on a kill.
        for (const sh of shots) {
          if (!sh.alive) continue
          const tgt = sh.target
          if (!tgt?.alive) {
            sh.alive = false
            sh.g.visible = false
            continue
          }
          const p = posOf(tgt.p)
          const dx = p.x - sh.x
          const dy = p.y - sh.y
          const d = Math.hypot(dx, dy) || 1
          const step = SHOT_SPEED * s
          if (d <= step + 8) {
            tgt.hp -= 1
            if (tgt.hp <= 0) {
              tgt.alive = false
              tgt.g.visible = false
              gold += REWARD
              cursorDirty = true
            }
            sh.alive = false
            sh.g.visible = false
          } else {
            sh.x += (dx / d) * step
            sh.y += (dy / d) * step
            sh.g.position.set(sh.x, sh.y)
          }
        }

        if (gold !== lastGold) {
          lastGold = gold
          goldText.text = `GOLD ${gold}`
        }
        if (cursorDirty) redrawCursor()
      },
    }
  },
}

const turnBased: PatternDemo = {
  id: 'turn-based-style',
  name: 'Turn-based-style',
  caption: 'Tactics grid: move within range ← → ↑ ↓ + Space; enemies act on their turn.',
  category: 'system',
  params: [
    { key: 'move', label: 'Move range', min: 1, max: 5, step: 1, default: 3, unit: 'cells' },
  ],
  mount(ctx) {
    const { width, input, params, theme } = ctx
    const root = new Container()
    ctx.stage.addChild(root)
    hint(ctx, '← → ↑ ↓ : aim move · Space : confirm (attack if adjacent)')

    const cols = 9
    const rows = 6
    const top = 26
    const fieldH = ctx.height - FLOOR_INSET - 6 - top
    const cell = Math.floor(Math.min(width / cols, fieldH / rows))
    const gx = Math.floor((width - cols * cell) / 2)
    const gy = top + Math.floor((fieldH - rows * cell) / 2)
    const ccx = (c: number): number => gx + c * cell + cell / 2
    const ccy = (r: number): number => gy + r * cell + cell / 2
    const man = (ac: number, ar: number, bc: number, br: number): number =>
      Math.abs(ac - bc) + Math.abs(ar - br)

    // Static grid.
    const gridG = new Graphics()
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        gridG
          .rect(gx + c * cell, gy + r * cell, cell, cell)
          .fill({ color: 0xffffff, alpha: 0.02 })
          .stroke({ color: COLORS.border, width: 1, alpha: 0.5 })
      }
    }
    root.addChild(gridG)
    const rangeG = new Graphics()
    const cursorG = new Graphics()
    root.addChild(rangeG, cursorG)

    interface Unit {
      c: number
      r: number
      hp: number
      ally: boolean
      alive: boolean
      view: Container
      fill: Graphics
      flash: Graphics
      flashT: number
    }
    const HP_MAX = 3
    const FLASH_DUR = 0.32
    const makeUnit = (ally: boolean): Unit => {
      const view = new Container()
      const col = ally ? COLORS.accent : 0xff6bd1
      const body = cell * 0.64
      view.addChild(new Graphics().roundRect(-body / 2, -body / 2, body, body, 5).fill(col))
      const bw = cell * 0.6
      view.addChild(
        new Graphics().rect(-bw / 2, -cell * 0.45, bw, 4).fill({ color: 0x000000, alpha: 0.5 }),
      )
      const fill = new Graphics().rect(-bw / 2, -cell * 0.45, bw, 4).fill(col)
      fill.pivot.set(-bw / 2, 0)
      fill.position.set(-bw / 2, 0)
      view.addChild(fill)
      // White hit-flash overlay (on top), revealed briefly when struck.
      const flash = new Graphics().roundRect(-body / 2, -body / 2, body, body, 5).fill(0xffffff)
      flash.alpha = 0
      view.addChild(flash)
      root.addChild(view)
      return { c: 0, r: 0, hp: HP_MAX, ally, alive: true, view, fill, flash, flashT: 0 }
    }
    const player = makeUnit(true)
    const enemies = [makeUnit(false), makeUnit(false)]
    const allUnits = (): Unit[] => [player, ...enemies]
    const place = (u: Unit, c: number, r: number): void => {
      u.c = c
      u.r = r
      u.view.position.set(ccx(c), ccy(r))
    }
    const unitAt = (c: number, r: number): Unit | undefined =>
      allUnits().find((u) => u.alive && u.c === c && u.r === r)
    const refreshHp = (u: Unit): void => {
      u.fill.scale.x = Math.max(0, u.hp) / HP_MAX
    }

    const resetBoard = (): void => {
      place(player, 1, Math.floor(rows / 2))
      player.hp = HP_MAX
      player.alive = true
      enemies.forEach((e, i) => {
        e.hp = HP_MAX
        e.alive = true
        place(e, cols - 2, 1 + i * 2)
      })
      for (const u of allUnits()) {
        refreshHp(u)
        u.view.visible = true
        u.view.scale.set(1)
        u.flash.alpha = 0
        u.flashT = 0
      }
    }
    resetBoard()

    let cc = player.c
    let cr = player.r
    let phase: 'player' | 'enemy' = 'player'
    let enemyTimer = 0
    let enemyQueue: Unit[] = []

    const turnText = text('YOUR TURN', {
      fill: COLORS.accent,
      fontSize: 16,
      fontFamily: theme.fontMono,
    })
    turnText.anchor.set(0.5, 0)
    turnText.position.set(width / 2, 4)
    root.addChild(turnText)

    const inRange = (c: number, r: number): boolean =>
      man(c, r, player.c, player.r) <= params.get('move')
    const validTarget = (c: number, r: number): boolean =>
      (c === player.c && r === player.r) || (inRange(c, r) && !unitAt(c, r))

    const drawRange = (): void => {
      rangeG.clear()
      if (phase !== 'player') return
      const range = params.get('move')
      for (let dr = -range; dr <= range; dr++) {
        for (let dc = -range; dc <= range; dc++) {
          if (Math.abs(dc) + Math.abs(dr) > range) continue
          const c = player.c + dc
          const r = player.r + dr
          if (c < 0 || c >= cols || r < 0 || r >= rows) continue
          if (unitAt(c, r) && !(c === player.c && r === player.r)) continue
          rangeG
            .rect(gx + c * cell, gy + r * cell, cell, cell)
            .fill({ color: COLORS.accent, alpha: 0.08 })
        }
      }
    }
    const drawCursor = (): void => {
      cursorG.clear()
      if (phase !== 'player') return
      const col = validTarget(cc, cr) ? 0x6ee7b7 : COLORS.faint
      cursorG
        .rect(gx + cc * cell + 1, gy + cr * cell + 1, cell - 2, cell - 2)
        .stroke({ color: col, width: 3 })
    }
    drawRange()
    drawCursor()

    const attackAround = (u: Unit, foeAlly: boolean): void => {
      for (const t of allUnits()) {
        if (!t.alive || t.ally !== foeAlly) continue
        if (man(u.c, u.r, t.c, t.r) === 1) {
          t.hp -= 1
          if (t.hp <= 0) t.alive = false
          refreshHp(t)
          t.flashT = FLASH_DUR // flash the struck unit
          u.flashT = FLASH_DUR * 0.6 // small pop on the attacker too
          break
        }
      }
    }

    const startEnemyTurn = (): void => {
      phase = 'enemy'
      enemyQueue = enemies.filter((e) => e.alive)
      enemyTimer = 0.45
      turnText.text = 'ENEMY TURN'
      turnText.tint = 0xff6bd1
      drawRange()
      drawCursor()
    }
    const startPlayerTurn = (): void => {
      if (!enemies.some((e) => e.alive)) resetBoard()
      if (!player.alive) resetBoard()
      phase = 'player'
      cc = player.c
      cr = player.r
      turnText.text = 'YOUR TURN'
      turnText.tint = COLORS.accent
      drawRange()
      drawCursor()
    }

    return {
      update: (dt) => {
        // Decay hit-flash + pop on every unit (runs in any phase).
        for (const u of allUnits()) {
          if (u.flashT <= 0) continue
          u.flashT -= dt.dtSec
          const k = Math.max(0, u.flashT) / FLASH_DUR
          u.flash.alpha = k
          u.view.scale.set(1 + 0.3 * k)
          if (u.flashT <= 0 && !u.alive) u.view.visible = false
        }

        if (phase === 'player') {
          let dirty = false
          if (input.wasJustPressed('left')) {
            cc = clamp(cc - 1, 0, cols - 1)
            dirty = true
          }
          if (input.wasJustPressed('right')) {
            cc = clamp(cc + 1, 0, cols - 1)
            dirty = true
          }
          if (input.wasJustPressed('up')) {
            cr = clamp(cr - 1, 0, rows - 1)
            dirty = true
          }
          if (input.wasJustPressed('down')) {
            cr = clamp(cr + 1, 0, rows - 1)
            dirty = true
          }
          if (input.wasJustPressed('action') && validTarget(cc, cr)) {
            place(player, cc, cr)
            attackAround(player, false) // hit an adjacent enemy
            startEnemyTurn()
          } else if (dirty) {
            drawCursor()
          }
        } else {
          enemyTimer -= dt.dtSec
          if (enemyTimer > 0) return
          enemyTimer = 0.45
          const e = enemyQueue.shift()
          if (e?.alive) {
            // Step one cell toward the player (4-dir, to a free cell).
            const opts: [number, number][] = [
              [e.c + Math.sign(player.c - e.c), e.r],
              [e.c, e.r + Math.sign(player.r - e.r)],
            ]
            for (const [nc, nr] of opts) {
              if (
                (nc !== e.c || nr !== e.r) &&
                !unitAt(nc, nr) &&
                nc >= 0 &&
                nc < cols &&
                nr >= 0 &&
                nr < rows
              ) {
                place(e, nc, nr)
                break
              }
            }
            attackAround(e, true) // hit the player if now adjacent
          }
          if (enemyQueue.length === 0) startPlayerTurn()
        }
      },
    }
  },
}

export const strategyDemos: PatternDemo[] = [towerDefense, turnBased]
