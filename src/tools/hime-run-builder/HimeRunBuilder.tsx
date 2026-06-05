import { Application, Color } from 'pixi.js'
import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
// Side-effect import: keep Pixi's graphics render pipe out of the tree-shaker's
// reach in production builds (same reason GameMount imports it).
import '../../engine/pixi-pipes'
import { clamp } from '../../engine/util/math'
import {
  COIN_COLOR,
  HAZARD_COLOR,
  HAZARD_DARK_COLOR,
  LEDGE_COLOR,
  TERRAIN_COLOR,
} from '../../games/hime-run/constants'
import type { Block } from '../../games/hime-run/obstacles'
import { parseStageCourse } from '../../games/hime-run/stage-course'
import {
  type BuilderDoc,
  createEmptyDoc,
  DEFAULT_SECTION_HEIGHT,
  DEFAULT_SECTION_WIDTH,
  DEFAULT_SECTION_Y,
  MAX_ROWS_ABOVE,
  MAX_ROWS_BELOW,
  newSection,
  parseBuilderDoc,
  placeBlock,
} from './doc'
import {
  EditorCanvas,
  ERASE_PREVIEW,
  type LayoutBox,
  SELECT_COLOR,
  type Tool,
} from './editor-canvas'

const AUTOSAVE_KEY = 'hime-run-builder:doc'
/** Largest section width (cells) the width control will grow to. */
const WIDTH_MAX = 200

// Palette entries (label + swatch) in placement order. Swatches are derived from
// the single source of truth for each colour (game block colours + the editor's
// select/erase colours) so they can't drift from what the canvas draws.
const swatchHex = (n: number): string => new Color(n).toHex()
const TOOLS: { tool: Tool; label: string; swatch: string }[] = [
  { tool: 'select', label: 'Select', swatch: swatchHex(SELECT_COLOR) },
  { tool: 'terrain', label: 'Terrain', swatch: swatchHex(TERRAIN_COLOR) },
  { tool: 'ledge', label: 'Ledge', swatch: swatchHex(LEDGE_COLOR) },
  { tool: 'hazard', label: 'Hazard', swatch: swatchHex(HAZARD_COLOR) },
  { tool: 'pit', label: 'Pit', swatch: swatchHex(HAZARD_DARK_COLOR) },
  { tool: 'coin', label: 'Coin', swatch: swatchHex(COIN_COLOR) },
  { tool: 'erase', label: 'Erase', swatch: swatchHex(ERASE_PREVIEW) },
]

function loadInitialDoc(): BuilderDoc {
  try {
    const raw = globalThis.localStorage?.getItem(AUTOSAVE_KEY)
    if (raw) return parseBuilderDoc(JSON.parse(raw))
  } catch {
    // Corrupt / stale autosave — fall through to a fresh document.
  }
  return createEmptyDoc()
}

function slug(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'course'
  )
}

export function HimeRunBuilder() {
  const mountRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<EditorCanvas | null>(null)

  const [doc, setDocState] = useState<BuilderDoc>(loadInitialDoc)
  const [activeSection, setActiveSection] = useState(0)
  const [tool, setTool] = useState<Tool>('terrain')
  const [selection, setSelection] = useState<number | null>(null)
  const [past, setPast] = useState<BuilderDoc[]>([])
  const [future, setFuture] = useState<BuilderDoc[]>([])
  // Grid box rect (screen px) reported by the canvas, for anchoring edge controls.
  const [box, setBox] = useState<LayoutBox | null>(null)

  // The active section's grid box, derived from its stored `y` / `height`. Each
  // section keeps its own box; resizing it is a document edit (saved & exported).
  const activeSec = doc.sections[activeSection]
  const topRow = activeSec?.y ?? DEFAULT_SECTION_Y
  const bottomRow = activeSec
    ? activeSec.y - activeSec.height + 1
    : DEFAULT_SECTION_Y - DEFAULT_SECTION_HEIGHT + 1

  // Latest values for the long-lived Pixi callbacks (which capture once).
  const live = useRef({ doc, activeSection })
  live.current = { doc, activeSection }
  // Latest delete action for the stable keyboard listener.
  const deleteRef = useRef<() => void>(() => {})

  // ── Document mutation (with undo history) ─────────────────────────────────────
  const commitDoc = useCallback((next: BuilderDoc) => {
    setPast((p) => [...p, live.current.doc])
    setFuture([])
    setDocState(next)
  }, [])

  const replaceActiveBlocks = useCallback(
    (nextBlocks: Block[]) => {
      const { doc: cur, activeSection: idx } = live.current
      const sections = cur.sections.map((s, i) => (i === idx ? { ...s, blocks: nextBlocks } : s))
      commitDoc({ ...cur, sections })
      // The block list (and its indices) just changed — a prior index-based
      // selection no longer reliably points at the same block. Callers that keep a
      // selection (e.g. inspector edits) re-set it right after.
      setSelection(null)
    },
    [commitDoc],
  )

  const resizeActiveSection = useCallback(
    (width: number) => {
      const { doc: cur, activeSection: idx } = live.current
      const sections = cur.sections.map((s, i) => (i === idx ? { ...s, width } : s))
      commitDoc({ ...cur, sections })
    },
    [commitDoc],
  )

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p
      const prev = p[p.length - 1] as BuilderDoc
      setFuture((f) => [live.current.doc, ...f])
      setDocState(prev)
      setSelection(null)
      // The restored doc may have fewer sections — keep activeSection in range.
      setActiveSection((a) => Math.max(0, Math.min(a, prev.sections.length - 1)))
      return p.slice(0, -1)
    })
  }, [])

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f
      const next = f[0] as BuilderDoc
      setPast((p) => [...p, live.current.doc])
      setDocState(next)
      setSelection(null)
      setActiveSection((a) => Math.max(0, Math.min(a, next.sections.length - 1)))
      return f.slice(1)
    })
  }, [])

  // ── Pixi app + editor canvas lifecycle ────────────────────────────────────────
  useEffect(() => {
    const ctrl = new AbortController()
    let app: Application | null = null

    void (async () => {
      if (!mountRef.current) return
      const instance = new Application()
      await instance.init({
        // Match the out-of-bounds fill (OOB_BG in editor-canvas) so the reserved
        // control insets — which show through to this background — read as one
        // surface with the dark area around the grid box.
        resizeTo: mountRef.current,
        background: '#0a0e18',
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
      })
      if (ctrl.signal.aborted) {
        instance.destroy(true, { children: true })
        return
      }
      app = instance
      instance.canvas.style.touchAction = 'none'
      // Suppress the browser context menu so a right-click on the grid doesn't pop
      // it (the canvas ignores non-primary buttons for editing — see onPointerDown).
      instance.canvas.addEventListener('contextmenu', (e) => e.preventDefault())
      mountRef.current.appendChild(instance.canvas)

      const canvas = new EditorCanvas(
        instance,
        {
          onEditBlocks: (blocks) => replaceActiveBlocks(blocks),
          onSelectBlock: (index) => setSelection(index),
          onLayout: (b) => setBox(b),
        },
        live.current.doc,
      )
      canvasRef.current = canvas
      // Seed the canvas with the active section's box too: the sync effect that
      // normally pushes topRow/bottomRow first ran while canvasRef was still null
      // (the app inits async), so without this the restored box would render with
      // the default vertical range until the next state change.
      const sec = live.current.doc.sections[live.current.activeSection]
      canvas.setState({
        doc: live.current.doc,
        activeSection: live.current.activeSection,
        tool: 'terrain',
        selection: null,
        topRow: sec?.y ?? DEFAULT_SECTION_Y,
        bottomRow: sec ? sec.y - sec.height + 1 : DEFAULT_SECTION_Y - DEFAULT_SECTION_HEIGHT + 1,
      })
    })()

    return () => {
      ctrl.abort()
      canvasRef.current?.destroy()
      canvasRef.current = null
      app?.destroy(true, { children: true })
    }
  }, [replaceActiveBlocks])

  // Push state into the canvas whenever it changes.
  useEffect(() => {
    canvasRef.current?.setState({ doc, activeSection, tool, selection, topRow, bottomRow })
  }, [doc, activeSection, tool, selection, topRow, bottomRow])

  // Autosave (best-effort) on every document change.
  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(AUTOSAVE_KEY, JSON.stringify(doc))
    } catch {
      // Storage unavailable / quota — autosave is best-effort, ignore.
    }
  }, [doc])

  // Keyboard: delete selection, undo / redo. The delete action is read through a
  // ref so the listener stays stable (no re-bind on every selection change).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        deleteRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  // ── Section operations ────────────────────────────────────────────────────────
  const addSection = () => {
    const next = newSection(`section-${doc.sections.length + 1}`)
    commitDoc({ ...doc, sections: [...doc.sections, next] })
    setActiveSection(doc.sections.length)
    setSelection(null)
  }

  const deleteSection = (idx: number) => {
    if (doc.sections.length <= 1) return
    const sections = doc.sections.filter((_, i) => i !== idx)
    // Deleting a section at/below the divider shifts it: drop loopStart by one when
    // the removed section was in the intro (before it), then clamp into range.
    const shifted = idx < doc.loopStart ? doc.loopStart - 1 : doc.loopStart
    const loopStart = Math.max(0, Math.min(shifted, sections.length - 1))
    commitDoc({ ...doc, sections, loopStart })
    setActiveSection((a) => Math.max(0, Math.min(sections.length - 1, a > idx ? a - 1 : a)))
    setSelection(null)
  }

  const moveSection = (idx: number, dir: -1 | 1) => {
    const j = idx + dir
    if (j < 0 || j >= doc.sections.length) return
    const sections = [...doc.sections]
    ;[sections[idx], sections[j]] = [sections[j] as never, sections[idx] as never]
    commitDoc({ ...doc, sections })
    // Follow the moved section, but drop the selection — its index belonged to the
    // previously-active section's block list.
    setActiveSection(j)
    setSelection(null)
  }

  const setLoopStart = (value: number) => {
    const loopStart = Math.max(0, Math.min(doc.sections.length - 1, value))
    commitDoc({ ...doc, loopStart })
  }

  const updateSection = (idx: number, patch: { name?: string; width?: number }) => {
    const sections = doc.sections.map((s, i) => (i === idx ? { ...s, ...patch } : s))
    commitDoc({ ...doc, sections })
  }

  // ── Block (inspector) operations ──────────────────────────────────────────────
  const selectedBlock: Block | undefined =
    selection !== null ? doc.sections[activeSection]?.blocks[selection] : undefined

  const deleteSelectedBlock = () => {
    if (selection === null) return
    const blocks = (doc.sections[activeSection]?.blocks ?? []).filter((_, i) => i !== selection)
    replaceActiveBlocks(blocks)
    setSelection(null)
  }
  deleteRef.current = deleteSelectedBlock

  const updateSelectedBlock = (patch: Partial<Block>) => {
    if (selection === null) return
    const blocks = doc.sections[activeSection]?.blocks ?? []
    const old = blocks[selection]
    if (!old) return
    const updated: Block = { ...old, ...patch }
    if (!(updated.w > 0) || !(updated.h > 0)) return
    const without = blocks.filter((_, i) => i !== selection)
    const next = placeBlock(without, updated)
    replaceActiveBlocks(next)
    setSelection(next.length - 1)
  }

  // ── New / export / import ─────────────────────────────────────────────────────
  // Reset the editor view (selection / active section) for a fresh doc. The grid
  // box now lives per-section in the doc, so there's no view range to reset here.
  const resetView = () => {
    setActiveSection(0)
    setSelection(null)
  }

  const newDoc = () => {
    commitDoc(createEmptyDoc())
    resetView()
  }

  const exportJson = () => {
    try {
      parseStageCourse(doc) // surface any invariant break before download
    } catch (err) {
      alert(`Export blocked — ${(err as Error).message}`)
      return
    }
    // Export the BuilderDoc verbatim; the runtime ignores the editor-only fields.
    const blob = new Blob([`${JSON.stringify(doc, null, 2)}\n`], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${slug(doc.name)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        commitDoc(parseBuilderDoc(JSON.parse(String(reader.result))))
        resetView()
      } catch (err) {
        alert(`Import failed — ${(err as Error).message}`)
      }
    }
    reader.readAsText(file)
  }

  // ── Dimension controls (around the canvas) ────────────────────────────────────
  // All three resize the active section's grid box (width + the vertical box
  // y / height). Above/below are shown as positive cell counts; the ground line
  // always stays inside (top ≥ 1, bottom ≤ -1).
  const activeWidth = doc.sections[activeSection]?.width ?? DEFAULT_SECTION_WIDTH
  const setWidth = (w: number) => resizeActiveSection(clamp(Math.round(w), 1, WIDTH_MAX))
  const setSectionRange = (nextTop: number, nextBottom: number) => {
    const sections = doc.sections.map((s, i) =>
      i === activeSection ? { ...s, y: nextTop, height: nextTop - nextBottom + 1 } : s,
    )
    commitDoc({ ...doc, sections })
  }
  const setAbove = (n: number) =>
    setSectionRange(clamp(Math.round(n), 1, MAX_ROWS_ABOVE), bottomRow)
  const setBelow = (n: number) => setSectionRange(topRow, -clamp(Math.round(n), 1, MAX_ROWS_BELOW))

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={S.root}>
      <header style={S.toolbar}>
        <Link to="/" style={S.home}>
          ← Games
        </Link>
        <strong style={{ marginRight: 8 }}>hime-run builder</strong>
        <input
          style={S.nameInput}
          value={doc.name}
          onChange={(e) => commitDoc({ ...doc, name: e.target.value })}
          aria-label="Course name"
        />
        <button type="button" style={S.btn} onClick={newDoc}>
          New
        </button>
        <button type="button" style={S.btn} onClick={undo} disabled={past.length === 0}>
          Undo
        </button>
        <button type="button" style={S.btn} onClick={redo} disabled={future.length === 0}>
          Redo
        </button>
        <span style={S.spacer} />
        <label style={S.loopLabel}>
          loopStart
          <input
            type="number"
            style={S.numInput}
            value={doc.loopStart}
            min={0}
            max={doc.sections.length - 1}
            onChange={(e) => setLoopStart(Number.parseInt(e.target.value, 10) || 0)}
          />
        </label>
        <button type="button" style={S.btnPrimary} onClick={exportJson}>
          Export JSON
        </button>
        <label style={{ ...S.btn, cursor: 'pointer' }}>
          Import
          <input
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) importFile(f)
              e.target.value = ''
            }}
          />
        </label>
      </header>

      <div style={S.body}>
        <aside style={S.palette}>
          {TOOLS.map((t) => (
            <button
              key={t.tool}
              type="button"
              onClick={() => setTool(t.tool)}
              style={{
                ...S.toolBtn,
                ...(tool === t.tool ? S.toolBtnActive : null),
              }}
            >
              <span style={{ ...S.swatch, background: t.swatch }} />
              {t.label}
            </button>
          ))}
        </aside>

        <div style={S.canvasArea}>
          <div ref={mountRef} style={S.canvasHost} />
          {box && (
            <>
              <div style={edgeChip(box, 'top')}>
                <DimControl
                  label="rows above"
                  value={topRow}
                  min={1}
                  max={MAX_ROWS_ABOVE}
                  onChange={setAbove}
                />
              </div>
              <div style={edgeChip(box, 'bottom')}>
                <DimControl
                  label="rows below"
                  value={-bottomRow}
                  min={1}
                  max={MAX_ROWS_BELOW}
                  onChange={setBelow}
                />
              </div>
              <div style={edgeChip(box, 'right')}>
                <DimControl
                  label="width"
                  value={activeWidth}
                  min={1}
                  max={WIDTH_MAX}
                  onChange={setWidth}
                  vertical
                />
              </div>
            </>
          )}
        </div>

        <aside style={S.inspector}>
          {selectedBlock ? (
            <BlockInspector
              block={selectedBlock}
              onChange={updateSelectedBlock}
              onDelete={deleteSelectedBlock}
            />
          ) : (
            <SectionInspector
              section={doc.sections[activeSection]}
              onChange={(patch) => updateSection(activeSection, patch)}
            />
          )}
        </aside>
      </div>

      <footer style={S.strip}>
        {doc.sections.map((s, i) => (
          <div key={s.id} style={{ display: 'contents' }}>
            {i === doc.loopStart && i !== 0 && <div style={S.loopDivider} title="loop start" />}
            <div
              style={{
                ...S.sectionCard,
                ...(i === activeSection ? S.sectionCardActive : null),
                ...(i < doc.loopStart ? S.sectionIntro : null),
              }}
            >
              <button
                type="button"
                style={S.sectionSelect}
                onClick={() => {
                  setActiveSection(i)
                  setSelection(null)
                }}
              >
                <div style={S.sectionName}>{s.name}</div>
                <div style={S.sectionMeta}>
                  {i < doc.loopStart ? 'intro' : 'loop'} · {s.width}w · {s.blocks.length}b
                </div>
              </button>
              <div style={S.sectionCtrls}>
                <button type="button" style={S.miniBtn} onClick={() => moveSection(i, -1)}>
                  ◀
                </button>
                <button type="button" style={S.miniBtn} onClick={() => moveSection(i, 1)}>
                  ▶
                </button>
                <button
                  type="button"
                  style={S.miniBtn}
                  disabled={doc.sections.length <= 1}
                  onClick={() => deleteSection(i)}
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        ))}
        <button type="button" style={S.addSection} onClick={addSection}>
          + Section
        </button>
      </footer>
    </div>
  )
}

function BlockInspector({
  block,
  onChange,
  onDelete,
}: {
  block: Block
  onChange: (patch: Partial<Block>) => void
  onDelete: () => void
}) {
  const field = (key: 'x' | 'y' | 'w' | 'h') => (
    <label style={S.field}>
      {key}
      <input
        type="number"
        style={S.numInput}
        value={block[key]}
        onChange={(e) =>
          onChange({ [key]: Number.parseInt(e.target.value, 10) || 0 } as Partial<Block>)
        }
      />
    </label>
  )
  return (
    <div>
      <h3 style={S.inspectorTitle}>Block · {block.type}</h3>
      <p style={S.hint}>Grid cells. y = top edge, ground-relative (up +).</p>
      <div style={S.fieldGrid}>
        {field('x')}
        {field('y')}
        {field('w')}
        {field('h')}
      </div>
      <button type="button" style={{ ...S.btn, ...S.danger, marginTop: 12 }} onClick={onDelete}>
        Delete block (Del)
      </button>
    </div>
  )
}

function SectionInspector({
  section,
  onChange,
}: {
  section: BuilderDoc['sections'][number] | undefined
  onChange: (patch: { name?: string }) => void
}) {
  if (!section) return null
  return (
    <div>
      <h3 style={S.inspectorTitle}>Section</h3>
      <p style={S.hint}>
        Resize with the controls around the canvas. Pick the Select tool, then click a block to edit
        it.
      </p>
      <label style={S.field}>
        name
        <input
          style={S.textInput}
          value={section.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </label>
    </div>
  )
}

/** A labelled −/[number]/+ stepper used in the gutters around the canvas to size
 * the section (width) and the editor's vertical range (rows above / below). */
function DimControl({
  label,
  value,
  min,
  max,
  onChange,
  vertical,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  vertical?: boolean
}) {
  const set = (v: number) => onChange(clamp(v, min, max))
  const minus = (
    <button
      type="button"
      style={S.dimBtn}
      disabled={value <= min}
      aria-label={`${label} minus`}
      onClick={() => set(value - 1)}
    >
      −
    </button>
  )
  const plus = (
    <button
      type="button"
      style={S.dimBtn}
      disabled={value >= max}
      aria-label={`${label} plus`}
      onClick={() => set(value + 1)}
    >
      +
    </button>
  )
  const input = (
    <input
      type="number"
      min={min}
      max={max}
      value={value}
      aria-label={label}
      style={S.dimNum}
      onChange={(e) => set(Number.parseInt(e.target.value, 10) || min)}
    />
  )
  return (
    <div style={vertical ? S.dimV : S.dimH}>
      <span style={S.dimLabel}>{label}</span>
      {vertical ? (
        <>
          {plus}
          {input}
          {minus}
        </>
      ) : (
        <>
          {minus}
          {input}
          {plus}
        </>
      )}
    </div>
  )
}

/** Absolute style for a resize control chip, anchored just outside a grid edge.
 * The canvas reports the grid's *visible* edges already clamped into the drawable
 * area (the canvas minus reserved inset margins), so placing a chip a small gap
 * outside an edge always lands it in an inset — adjacent to the grid, never over
 * it. Coordinates are screen px (== CSS px) within the canvas host. */
function edgeChip(box: LayoutBox, side: 'top' | 'bottom' | 'right'): CSSProperties {
  const GAP = 8
  const cx = (box.left + box.right) / 2
  const cy = (box.top + box.bottom) / 2
  if (side === 'top') {
    return { ...S.ctrlChip, left: cx, top: box.top - GAP, transform: 'translate(-50%, -100%)' }
  }
  if (side === 'bottom') {
    return { ...S.ctrlChip, left: cx, top: box.bottom + GAP, transform: 'translate(-50%, 0)' }
  }
  return { ...S.ctrlChip, left: box.right + GAP, top: cy, transform: 'translate(0, -50%)' }
}

// ── Styles ────────────────────────────────────────────────────────────────────
const PANEL = '#11182a'
const BORDER = '#283255'
const S: Record<string, CSSProperties> = {
  root: {
    width: '100vw',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'system-ui, sans-serif',
    color: '#dfe4f2',
    background: '#0a0e18',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    background: PANEL,
    borderBottom: `1px solid ${BORDER}`,
    flexWrap: 'wrap',
  },
  home: { color: '#9fb0e0', textDecoration: 'none', fontSize: 13 },
  nameInput: {
    background: '#0a0e18',
    color: '#fff',
    border: `1px solid ${BORDER}`,
    borderRadius: 4,
    padding: '4px 8px',
    width: 160,
  },
  spacer: { flex: 1 },
  loopLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#9fb0e0' },
  body: { flex: 1, display: 'flex', minHeight: 0 },
  palette: {
    width: 120,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: 8,
    background: PANEL,
    borderRight: `1px solid ${BORDER}`,
  },
  canvasArea: { flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden' },
  canvasHost: { position: 'absolute', inset: 0 },
  ctrlChip: {
    position: 'absolute',
    background: 'rgba(17, 24, 42, 0.92)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: BORDER,
    borderRadius: 6,
    padding: '4px 6px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
    zIndex: 2,
  },
  dimH: { display: 'flex', alignItems: 'center', gap: 6 },
  dimV: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 },
  dimLabel: { fontSize: 11, color: '#9fb0e0', whiteSpace: 'nowrap' },
  dimBtn: {
    width: 24,
    height: 24,
    padding: 0,
    background: '#1c2746',
    color: '#eef1fb',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#46527e',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 15,
    lineHeight: 1,
  },
  dimNum: {
    width: 46,
    textAlign: 'center',
    background: '#0a0e18',
    color: '#fff',
    border: `1px solid ${BORDER}`,
    borderRadius: 4,
    padding: '3px 4px',
  },
  inspector: {
    width: 220,
    padding: 12,
    background: PANEL,
    borderLeft: `1px solid ${BORDER}`,
    overflowY: 'auto',
  },
  strip: {
    display: 'flex',
    alignItems: 'stretch',
    gap: 8,
    padding: 8,
    background: PANEL,
    borderTop: `1px solid ${BORDER}`,
    overflowX: 'auto',
    minHeight: 72,
  },
  toolBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 8px',
    background: '#0a0e18',
    color: '#dfe4f2',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: BORDER,
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 13,
    textAlign: 'left',
  },
  toolBtnActive: { borderColor: '#6f86d6', background: '#1c2746', fontWeight: 700 },
  swatch: { width: 14, height: 14, borderRadius: 3, display: 'inline-block', flexShrink: 0 },
  btn: {
    padding: '5px 10px',
    background: '#0a0e18',
    color: '#dfe4f2',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: BORDER,
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 13,
  },
  btnPrimary: {
    padding: '5px 12px',
    background: '#3a56b0',
    color: '#fff',
    border: '1px solid #4f6fd0',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
  },
  danger: { borderColor: '#7a2230', color: '#ff9aa6' },
  numInput: {
    width: 56,
    background: '#0a0e18',
    color: '#fff',
    border: `1px solid ${BORDER}`,
    borderRadius: 4,
    padding: '3px 6px',
  },
  textInput: {
    width: '100%',
    background: '#0a0e18',
    color: '#fff',
    border: `1px solid ${BORDER}`,
    borderRadius: 4,
    padding: '4px 6px',
    boxSizing: 'border-box',
  },
  inspectorTitle: { margin: '0 0 6px', fontSize: 14 },
  hint: { margin: '0 0 12px', fontSize: 11, color: '#7c89b3', lineHeight: 1.4 },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontSize: 12,
    color: '#9fb0e0',
    marginBottom: 8,
  },
  fieldGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  sectionCard: {
    minWidth: 120,
    padding: '6px 8px',
    background: '#0a0e18',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: BORDER,
    borderRadius: 5,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  sectionSelect: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: 0,
    background: 'transparent',
    border: 'none',
    color: 'inherit',
    cursor: 'pointer',
    textAlign: 'left',
    font: 'inherit',
  },
  sectionCardActive: { borderColor: '#6f86d6', background: '#1c2746' },
  sectionIntro: { opacity: 0.92, borderStyle: 'dashed' },
  sectionName: {
    fontSize: 13,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  sectionMeta: { fontSize: 11, color: '#7c89b3' },
  sectionCtrls: { display: 'flex', gap: 4 },
  miniBtn: {
    flex: 1,
    padding: '2px 0',
    background: '#11182a',
    color: '#aab6dd',
    border: `1px solid ${BORDER}`,
    borderRadius: 3,
    cursor: 'pointer',
    fontSize: 11,
  },
  loopDivider: { width: 2, background: '#6f86d6', borderRadius: 2, alignSelf: 'stretch' },
  addSection: {
    minWidth: 96,
    border: `1px dashed ${BORDER}`,
    borderRadius: 5,
    background: 'transparent',
    color: '#9fb0e0',
    cursor: 'pointer',
    fontSize: 13,
  },
}
