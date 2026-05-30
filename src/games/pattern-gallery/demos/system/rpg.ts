import { Container, Graphics, type Text as PixiText, SplitText } from 'pixi.js'
import { COLORS, RADIUS } from '../../constants'
import type { PatternDemo } from '../../demo'
import { text } from '../../demo-util'
import { HINT_GAP, hint } from './shared'

const rpgBattle: PatternDemo = {
  id: 'rpg-battle-style',
  name: 'RPG-battle-style',
  caption: 'JRPG command battle: choose Attack/Magic/Guard (↑ ↓ + Space); the foe counters.',
  category: 'system',
  params: [
    {
      key: 'speed',
      label: 'Message speed',
      min: 200,
      max: 1200,
      step: 100,
      default: 550,
      unit: 'ms',
    },
  ],
  mount(ctx) {
    const { width, input, params, theme, rng } = ctx
    const root = new Container()
    ctx.stage.addChild(root)
    hint(ctx, '↑ ↓ : choose command · Space : confirm')

    const hero = { hp: 30, max: 30, mp: 20, mpMax: 20, guard: false }
    const enemy = { hp: 40, max: 40, alive: true }
    const ey = ctx.height * 0.3

    // ── Enemy ────────────────────────────────────────────────────────────
    const enemyView = new Container()
    enemyView.position.set(width / 2, ey)
    root.addChild(enemyView)
    enemyView.addChild(new Graphics().roundRect(-48, -48, 96, 96, 12).fill(0xff6bd1))
    const eFlash = new Graphics().roundRect(-48, -48, 96, 96, 12).fill(0xffffff)
    eFlash.alpha = 0
    enemyView.addChild(eFlash)
    const eName = text('SLIME', { fill: COLORS.text, fontSize: 14, fontFamily: theme.fontMono })
    eName.anchor.set(0.5)
    eName.position.set(width / 2, ey - 72)
    root.addChild(eName)
    const ehbW = 120
    const ehbX = width / 2 - ehbW / 2
    root.addChild(new Graphics().rect(ehbX, ey - 60, ehbW, 6).fill({ color: 0x000000, alpha: 0.5 }))
    const eHpFill = new Graphics().rect(ehbX, ey - 60, ehbW, 6).fill(0xff6bd1)
    eHpFill.pivot.set(ehbX, 0)
    eHpFill.position.set(ehbX, 0)
    root.addChild(eHpFill)

    // ── Bottom panel ─────────────────────────────────────────────────────
    // Sit just above the hint, matching the hint's own bottom gap (like adv).
    const bottomY = ctx.height - 2 * HINT_GAP - 16
    const panelH = 92
    const panelY = bottomY - panelH
    const dividerX = width * 0.7 // commands occupy the right ~30%
    const cmdX = dividerX + 26
    const rowLeft = dividerX + 8
    const rowRight = width - 20
    // One box for hero stats + commands, split by a vertical divider.
    root.addChild(
      new Graphics()
        .roundRect(12, panelY, width - 24, panelH, RADIUS.chip)
        .fill(COLORS.panel)
        .stroke({ color: COLORS.border, width: 1 })
        .moveTo(dividerX, panelY + 12)
        .lineTo(dividerX, panelY + panelH - 12)
        .stroke({ color: COLORS.border, width: 1 }),
    )
    const heroName = text('HERO', { fill: COLORS.text, fontSize: 15, fontFamily: theme.fontSans })
    heroName.position.set(26, panelY + 10)
    root.addChild(heroName)
    const hpText = text('', { fill: COLORS.muted, fontSize: 14, fontFamily: theme.fontMono })
    hpText.position.set(26, panelY + 38)
    root.addChild(hpText)
    const mpText = text('', { fill: COLORS.muted, fontSize: 14, fontFamily: theme.fontMono })
    mpText.position.set(26, panelY + 60)
    root.addChild(mpText)

    // Selection highlight bar, drawn behind the command labels.
    const selG = new Graphics()
    root.addChild(selG)
    const COMMANDS = ['Attack', 'Magic (5 MP)', 'Guard']
    const cmdTexts = COMMANDS.map((c, i) => {
      const t = text(c, { fill: COLORS.muted, fontSize: 16, fontFamily: theme.fontSans })
      t.position.set(cmdX, panelY + 12 + i * 24)
      root.addChild(t)
      return t
    })
    const cursor = text('▶', { fill: COLORS.accent, fontSize: 14, fontFamily: theme.fontSans })
    cursor.anchor.set(0.5)
    root.addChild(cursor)
    // White flash over the chosen row when a command is confirmed.
    const confirmG = new Graphics()
    confirmG.alpha = 0
    root.addChild(confirmG)
    const msgText = text('Your move.', {
      fill: COLORS.muted,
      fontSize: 14,
      fontFamily: theme.fontMono,
    })
    msgText.position.set(12, panelY - 24)
    root.addChild(msgText)

    // ── Floating damage numbers ──────────────────────────────────────────
    interface Floater {
      t: PixiText
      life: number
      alive: boolean
    }
    const floaters: Floater[] = Array.from({ length: 8 }, () => {
      const t = text('', {
        fill: 0xffd166,
        fontSize: 20,
        fontFamily: theme.fontSans,
        fontWeight: 'bold',
      })
      t.anchor.set(0.5)
      t.visible = false
      root.addChild(t)
      return { t, life: 0, alive: false }
    })
    const popNumber = (x: number, y: number, dmg: number, color: number): void => {
      const f = floaters.find((q) => !q.alive)
      if (!f) return
      f.alive = true
      f.life = 0.8
      f.t.text = `${dmg}`
      f.t.style.fill = color
      f.t.position.set(x, y)
      f.t.alpha = 1
      f.t.visible = true
    }

    let sel = 0
    let eFlashT = 0
    let confirmT = 0
    let phase: 'input' | 'resolve' = 'input'
    let stepT = 0
    const steps: (() => void)[] = []
    const gap = (): number => params.get('speed') / 1000

    const setMsg = (s: string): void => {
      if (msgText.text !== s) msgText.text = s
    }
    const syncStats = (): void => {
      hpText.text = `HP ${Math.max(0, hero.hp)}/${hero.max}`
      mpText.text = `MP ${hero.mp}/${hero.mpMax}`
    }
    const syncEnemy = (): void => {
      eHpFill.scale.x = Math.max(0, enemy.hp) / enemy.max
    }
    const moveCursor = (): void => {
      const t = cmdTexts[sel]
      if (!t) return
      selG
        .clear()
        .roundRect(rowLeft, t.y - 3, rowRight - rowLeft, 23, 4)
        .fill({ color: COLORS.rowActive, alpha: 0.9 })
      cursor.position.set(rowLeft + 9, t.y + 9)
      for (const [i, c] of cmdTexts.entries()) c.style.fill = i === sel ? COLORS.text : COLORS.muted
    }
    syncStats()
    syncEnemy()
    moveCursor()

    const hitEnemy = (dmg: number): void => {
      enemy.hp -= dmg
      if (enemy.hp <= 0) enemy.alive = false
      syncEnemy()
      eFlashT = 0.3
      popNumber(width / 2, ey - 20, dmg, 0xffffff)
    }
    const hitHero = (dmg: number): void => {
      hero.hp -= dmg
      syncStats()
      popNumber(86, panelY + 30, dmg, 0xff6b6b)
    }

    const heroTurn = (cmd: number): void => {
      hero.guard = false
      steps.length = 0
      if (cmd === 0) {
        steps.push(() => setMsg('HERO attacks!'))
        steps.push(() => hitEnemy(rng.intRange(8, 14)))
      } else if (cmd === 1) {
        hero.mp -= 5
        syncStats()
        steps.push(() => setMsg('HERO casts Bolt!'))
        steps.push(() => hitEnemy(rng.intRange(16, 24)))
      } else {
        hero.guard = true
        steps.push(() => setMsg('HERO guards.'))
      }
      steps.push(() => {
        if (!enemy.alive) {
          enemyView.visible = false
          steps.push(() => {
            setMsg('Enemy defeated! A new foe appears.')
            enemy.hp = enemy.max
            enemy.alive = true
            enemyView.visible = true
            syncEnemy()
          })
        } else {
          steps.push(() => setMsg('Enemy attacks!'))
          steps.push(() => {
            let d = rng.intRange(6, 12)
            if (hero.guard) d = Math.ceil(d / 2)
            hitHero(d)
          })
          steps.push(() => {
            if (hero.hp <= 0) {
              setMsg('HERO falls… and is revived.')
              hero.hp = hero.max
              syncStats()
            }
          })
        }
      })
      steps.push(() => {
        hero.mp = Math.min(hero.mpMax, hero.mp + 2)
        syncStats()
      })
      phase = 'resolve'
      stepT = gap()
    }

    return {
      update: (dt) => {
        if (eFlashT > 0) {
          eFlashT -= dt.dtSec
          eFlash.alpha = Math.max(0, eFlashT) / 0.3
        }
        if (confirmT > 0) {
          confirmT -= dt.dtSec
          confirmG.alpha = Math.max(0, confirmT) / 0.2
        }
        for (const f of floaters) {
          if (!f.alive) continue
          f.life -= dt.dtSec
          if (f.life <= 0) {
            f.alive = false
            f.t.visible = false
            continue
          }
          f.t.y -= 32 * dt.dtSec
          f.t.alpha = Math.min(1, f.life / 0.4)
        }

        if (phase === 'input') {
          const magic = cmdTexts[1]
          if (magic) magic.alpha = hero.mp >= 5 ? 1 : 0.4
          if (input.wasJustPressed('up')) {
            sel = (sel + COMMANDS.length - 1) % COMMANDS.length
            moveCursor()
          }
          if (input.wasJustPressed('down')) {
            sel = (sel + 1) % COMMANDS.length
            moveCursor()
          }
          if (input.wasJustPressed('action')) {
            if (sel === 1 && hero.mp < 5) setMsg('Not enough MP!')
            else {
              // Flash the chosen row to confirm the command.
              const t = cmdTexts[sel]
              if (t) {
                confirmG
                  .clear()
                  .roundRect(rowLeft, t.y - 3, rowRight - rowLeft, 23, 4)
                  .fill(0xffffff)
                confirmT = 0.2
              }
              heroTurn(sel)
            }
          }
        } else {
          stepT -= dt.dtSec
          if (stepT > 0) return
          if (steps.length === 0) {
            phase = 'input'
            setMsg('Your move.')
            return
          }
          const s = steps.shift()
          if (s) s()
          stepT = gap()
        }
      },
    }
  },
}

const adv: PatternDemo = {
  id: 'adv-style',
  name: 'ADV / novel-style',
  caption: 'Typewriter dialogue you advance line by line — tap-to-progress (mobile VN).',
  category: 'system',
  params: [
    { key: 'cps', label: 'Type speed', min: 8, max: 80, step: 2, default: 36, unit: 'c/s' },
    { key: 'auto', label: 'Auto-advance', min: 0, max: 4000, step: 200, default: 0, unit: 'ms' },
  ],
  mount(ctx) {
    const { width, height, input, params, theme } = ctx
    const root = new Container()
    ctx.stage.addChild(root)
    hint(ctx, 'Space : advance (reveal-all, then next line)')

    const script = [
      {
        who: 0,
        name: 'ユウ',
        text: 'ねえ……今、足音しなかった？ この階、私たちしかいないはずだよね。',
      },
      {
        who: 1,
        name: 'アキ',
        text: '……気のせいだよ。ね、そう言ってよ。さっきから廊下の電気、点いたままだし。',
      },
      {
        who: 0,
        name: 'ユウ',
        text: '私、さっき確かに消したの。三番目の部屋の前で。なのに、どうして……。',
      },
      { who: 1, name: 'アキ', text: 'ユウ。……後ろ、振り向かないで。ゆっくり、私の手を握って。' },
    ]

    const boxH = 120
    // Sit the balloon above the hint with the same gap the hint has below it:
    //   hint bottom = height - HINT_GAP, hint is ~16px tall, then another
    //   HINT_GAP above it → boxBottom = height - 2*HINT_GAP - 16.
    const boxBottom = height - 2 * HINT_GAP - 16
    const boxY = boxBottom - boxH
    const boxX = 12
    const boxW = width - 24

    // Bust silhouette (waist/chest up). Drawn as a single white shape and
    // recoloured by `tint`, so active/inactive never relies on alpha — that
    // avoids the seam where head meets shoulders, and the busts are placed far
    // enough apart not to overlap each other. The dialogue box (added after)
    // crops the lower torso for a natural bust framing.
    const DIM = 0x40445a
    const CYAN = 0x6ad1ff
    const PINK = 0xff6bd1
    // Origin sits at the dialogue-box top; the bust is drawn upward from there
    // so the box crops the lower torso. The head top lands at height/3, so the
    // figure occupies the bottom two-thirds of the stage. Pushed to the edges.
    const headR = 55
    const headCy = height / 3 + headR - boxY
    const makeBust = (): Graphics => {
      const g = new Graphics()
      g.circle(0, headCy, headR).fill(0xffffff)
      // Torso overlaps the head bottom by ~6px (head raised to sit on the neck).
      g.roundRect(-72, headCy + headR - 6, 144, 360, 62).fill(0xffffff)
      return g
    }
    const left = makeBust()
    left.position.set(width * 0.17, boxY)
    const right = makeBust()
    right.position.set(width * 0.83, boxY)
    root.addChild(left, right)

    root.addChild(
      new Graphics()
        .roundRect(boxX, boxY, boxW, boxH, RADIUS.chip)
        .fill({ color: COLORS.panel, alpha: 0.96 })
        .stroke({ color: COLORS.border, width: 1 }),
    )
    const chip = new Graphics()
    root.addChild(chip)
    const name = text('', { fill: COLORS.text, fontSize: 15, fontFamily: theme.fontSans })
    root.addChild(name)
    // The body is a SplitText: the line is laid out (and wrapped) once into
    // per-character Text nodes, then revealed by toggling each char's `visible`.
    // That keeps the line breaks fixed (no reflow) and costs no re-rasterization
    // while typing — unlike re-assigning `Text.text` every character. (Per the
    // pixijs-scene-text skill: changing `Text.text` is HIGH cost; SplitText's
    // visibility toggles are free.)
    const bodyStyle = {
      fill: COLORS.text,
      fontSize: 18,
      fontFamily: theme.fontSans,
      lineHeight: 27,
      wordWrap: true,
      wordWrapWidth: boxW - 36,
      breakWords: true,
    }
    const bodyX = boxX + 18
    const bodyY = boxY + 16
    let split: SplitText | null = null
    let chars: PixiText[] = []
    const indicator = text('▼', { fill: COLORS.accent, fontSize: 16, fontFamily: theme.fontSans })
    indicator.anchor.set(1, 1)
    indicator.position.set(boxX + boxW - 14, boxY + boxH - 8)
    root.addChild(indicator)

    let i = 0
    let revealed = 0
    let lastShown = -1
    let autoTimer = 0
    let blink = 0
    const applyLine = (): void => {
      const line = script[i] ?? script[0]
      if (!line) return
      const color = line.who === 0 ? CYAN : PINK
      // Rebuild the body for the new line (laid out + wrapped once).
      if (split) split.destroy({ children: true })
      split = new SplitText({ text: line.text, style: bodyStyle })
      split.position.set(bodyX, bodyY)
      root.addChild(split)
      chars = split.chars
      for (const c of chars) c.visible = false
      name.text = line.name
      // Dark name plate with a coloured speaker bar + white name, so it reads
      // clearly over the same-coloured portrait behind it.
      const plateY = boxY - 32
      chip
        .clear()
        .roundRect(boxX + 16, plateY, name.width + 30, 28, RADIUS.chip)
        .fill(COLORS.panelDeep)
        .stroke({ color, width: 1.5 })
        .rect(boxX + 25, plateY + 8, 4, 12)
        .fill(color)
      name.position.set(boxX + 38, plateY + 6)
      left.tint = line.who === 0 ? CYAN : DIM
      right.tint = line.who === 1 ? PINK : DIM
      revealed = 0
      lastShown = -1
      autoTimer = 0
    }
    const next = (): void => {
      i = (i + 1) % script.length
      applyLine()
    }
    applyLine()

    return {
      update: (dt) => {
        // Reveal characters by flipping `visible`; the layout (and wrapping) is
        // fixed from construction, so lines never reflow and nothing re-renders.
        const full = chars.length
        if (revealed < full) revealed = Math.min(full, revealed + params.get('cps') * dt.dtSec)
        const shown = Math.floor(revealed)
        if (shown !== lastShown) {
          for (let k = Math.max(0, lastShown); k < shown; k++) {
            const c = chars[k]
            if (c) c.visible = true
          }
          lastShown = shown
        }
        const complete = shown >= full

        if (input.wasJustPressed('action')) {
          if (!complete) revealed = full
          else next()
        }

        const auto = params.get('auto')
        if (complete && auto > 0) {
          autoTimer += dt.dtMs
          if (autoTimer >= auto) next()
        }

        blink += dt.dtMs
        indicator.visible = complete && Math.floor(blink / 400) % 2 === 0
      },
    }
  },
}

export const rpgDemos: PatternDemo[] = [rpgBattle, adv]
