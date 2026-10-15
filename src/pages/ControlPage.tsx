import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../db'
import MapStage, { type ActiveMap } from '../components/MapStage'
import { controlChannel } from '../lib/channel'
import { FogEngine } from '../lib/fog'
import { detectGrid } from '../lib/gridDetect'
import { grayRegion, importImage } from '../lib/image'
import { effectivePxPerMm, tableScale } from '../lib/scale'
import { useSettings, type Tool } from '../store'
import type { FogOp, FogStyle, Grid, MapRecord, PlayerInfo, TableState, TableView } from '../types'

const mod = (a: number, n: number) => ((a % n) + n) % n
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

const HINTS: Record<Tool, string> = {
  brush: 'Arrastrá para pintar. Botón central o Espacio + arrastrar mueve tu vista; la rueda hace zoom.',
  rect: 'Arrastrá para marcar un rectángulo.',
  poly: 'Clic para sumar puntos. Doble clic o Enter cierra la forma; Esc cancela.',
  cell: 'Clic o arrastrá para revelar casillas completas de la grilla.',
  view: 'Clic o arrastrá para mover lo que se ve en la mesa.',
  calibrate: 'Arrastrá un rectángulo que abarque exactamente las casillas indicadas en «Casillas abarcadas».',
}

function Segmented<T extends string>(props: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className="seg" role="group" aria-label={props.label}>
      {props.options.map((o) => (
        <button key={o.value} className={o.value === props.value ? 'on' : ''} onClick={() => props.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function NumberField(props: { label: string; value: number; step?: number; min?: number; max?: number; suffix?: string; onChange: (v: number) => void }) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <span className="field-input">
        <input
          type="number"
          value={Number.isFinite(props.value) ? Number(props.value.toFixed(3)) : ''}
          step={props.step ?? 1}
          min={props.min}
          max={props.max}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (Number.isFinite(v)) props.onChange(v)
          }}
        />
        {props.suffix && <em>{props.suffix}</em>}
      </span>
    </label>
  )
}

function Thumb({ blob, alt }: { blob: Blob; alt: string }) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob])
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  return <img src={url} alt={alt} />
}

export default function ControlPage() {
  const settings = useSettings()
  const [maps, setMaps] = useState<MapRecord[]>([])
  const [active, setActive] = useState<ActiveMap | null>(null)
  const [grid, setGrid] = useState<Grid>({ px: 70, ox: 0, oy: 0 })
  const [gridConfirmed, setGridConfirmed] = useState(true)
  const [fogStyle, setFogStyle] = useState<FogStyle>('dark')
  const [tableView, setTableView] = useState<TableView>({ mode: 'physical', cx: 0, cy: 0 })
  const [calib, setCalib] = useState(false)
  const [tool, setTool] = useState<Tool>('brush')
  const [playerInfo, setPlayerInfo] = useState<PlayerInfo | null>(null)
  const [lastSeen, setLastSeen] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [fitSignal, setFitSignal] = useState(0)
  const [undoState, setUndoState] = useState({ undo: false, redo: false })
  const [msg, setMsg] = useState<string | null>(null)
  const [measured, setMeasured] = useState('')
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)

  const chRef = useRef<ReturnType<typeof controlChannel> | null>(null)
  const activeRef = useRef(active)
  activeRef.current = active
  const latest = useRef({ active, grid, fogStyle, tableView, calib, settings })
  latest.current = { active, grid, fogStyle, tableView, calib, settings }
  const fogDirty = useRef(false)
  const saveTimer = useRef<number | undefined>(undefined)
  const seenPlayer = useRef(false)

  const flash = useCallback((text: string) => {
    setMsg(text)
    window.setTimeout(() => setMsg((m) => (m === text ? null : m)), 7000)
  }, [])

  const refreshList = useCallback(async () => {
    setMaps(await db.maps.orderBy('updatedAt').reverse().toArray())
  }, [])

  // ---- Comunicación con la ventana de la mesa ------------------------------------------

  const patchFields = () => {
    const L = latest.current
    return {
      grid: L.grid,
      showGrid: L.settings.showGridTable,
      gridOpacity: L.settings.gridOpacity,
      gridLight: L.settings.gridLight,
      fogStyle: L.fogStyle,
      view: L.tableView,
      display: L.settings.display,
      calib: L.calib,
    }
  }

  const sendFullState = useCallback(async () => {
    const L = latest.current
    const fog = L.active ? await L.active.fog.toBlob() : null
    const state: TableState = {
      mapId: L.active?.id ?? null,
      imgW: L.active?.w ?? 1,
      imgH: L.active?.h ?? 1,
      ...patchFields(),
    }
    chRef.current?.send({ t: 'state', state, fog })
  }, [])

  useEffect(() => {
    const ch = controlChannel((m) => {
      if (m.t === 'hello') {
        void sendFullState()
      } else if (m.t === 'info') {
        setPlayerInfo(m.info)
        setLastSeen(Date.now())
        if (!seenPlayer.current) {
          seenPlayer.current = true
          void sendFullState()
        }
      }
    })
    chRef.current = ch
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => {
      clearInterval(t)
      ch.close()
    }
  }, [sendFullState])

  const playerAlive = playerInfo !== null && now - lastSeen < 5000
  useEffect(() => {
    if (!playerAlive) seenPlayer.current = false
  }, [playerAlive])

  // Mapa distinto → estado completo. Cualquier otro ajuste → parche liviano.
  useEffect(() => {
    void sendFullState()
  }, [active?.id, sendFullState])

  useEffect(() => {
    chRef.current?.send({ t: 'patch', patch: patchFields() })
  }, [grid, fogStyle, tableView, calib, settings.display, settings.showGridTable, settings.gridOpacity, settings.gridLight])

  // ---- Persistencia ---------------------------------------------------------------------

  const flushFog = useCallback(async () => {
    window.clearTimeout(saveTimer.current)
    const a = activeRef.current
    if (!a || !fogDirty.current) return
    fogDirty.current = false
    const blob = await a.fog.toBlob()
    await db.maps.update(a.id, { fog: blob, updatedAt: Date.now() })
  }, [])

  const refreshUndo = () => {
    const a = activeRef.current
    if (a) setUndoState({ undo: a.fog.canUndo, redo: a.fog.canRedo })
  }

  const onFogChanged = () => {
    fogDirty.current = true
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => void flushFog(), 900)
    refreshUndo()
  }

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flushFog()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('beforeunload', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('beforeunload', onHide)
    }
  }, [flushFog])

  useEffect(() => {
    if (!active) return
    const t = window.setTimeout(() => {
      void db.maps.update(active.id, {
        grid,
        gridConfirmed,
        fogStyle,
        view: { cx: tableView.cx, cy: tableView.cy },
      })
    }, 400)
    return () => clearTimeout(t)
  }, [active, grid, gridConfirmed, fogStyle, tableView.cx, tableView.cy])

  // ---- Mapas ----------------------------------------------------------------------------

  const openMap = useCallback(
    async (id: number) => {
      setBusy(true)
      try {
        await flushFog()
        const rec = await db.maps.get(id)
        if (!rec) return
        const image = await createImageBitmap(rec.image)
        const fog = new FogEngine(rec.width, rec.height)
        await fog.loadBlob(rec.fog)
        const old = activeRef.current
        setActive({ id, name: rec.name, image, fog, w: rec.width, h: rec.height })
        setGrid(rec.grid)
        setGridConfirmed(rec.gridConfirmed)
        setFogStyle(rec.fogStyle)
        setTableView({ mode: 'physical', cx: rec.view.cx, cy: rec.view.cy })
        setUndoState({ undo: false, redo: false })
        localStorage.setItem('dnd-map-table:last', String(id))
        if (!rec.gridConfirmed) useSettings.getState().set({ showGridDM: true })
        if (old) window.setTimeout(() => old.image.close(), 600)
      } finally {
        setBusy(false)
      }
    },
    [flushFog],
  )

  useEffect(() => {
    void (async () => {
      await refreshList()
      const last = Number(localStorage.getItem('dnd-map-table:last'))
      if (last && (await db.maps.get(last))) await openMap(last)
    })()
  }, [refreshList, openMap])

  const importFiles = async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/'))
    if (!imgs.length) return flash('Solo se pueden importar imágenes (PNG, JPG o WebP).')
    setBusy(true)
    let lastId: number | undefined
    let detected = false
    for (const f of imgs) {
      try {
        const im = await importImage(f)
        let g: Grid = { px: 70, ox: 0, oy: 0 }
        detected = false
        try {
          const r = await grayRegion(im.blob)
          const guess = detectGrid(r.data, r.w, r.h, r.x0, r.y0)
          if (guess && guess.confidence >= 0.25) {
            g = { px: guess.px, ox: guess.ox, oy: guess.oy }
            detected = true
          }
        } catch {
          /* la detección es opcional */
        }
        const t = Date.now()
        lastId = await db.maps.add({
          name: f.name.replace(/\.[^.]+$/, ''),
          image: im.blob,
          thumb: im.thumb,
          width: im.width,
          height: im.height,
          grid: g,
          gridConfirmed: false,
          fog: null,
          fogStyle: 'dark',
          view: { cx: im.width / 2, cy: im.height / 2 },
          createdAt: t,
          updatedAt: t,
        })
      } catch {
        flash(`No se pudo importar «${f.name}».`)
      }
    }
    await refreshList()
    if (lastId !== undefined) {
      await openMap(lastId)
      if (detected) flash('Grilla detectada automáticamente. Verificala sobre el mapa y ajustala si no coincide.')
      else {
        flash('No se pudo detectar la grilla. Calibrala arrastrando un rectángulo sobre varias casillas.')
        setTool('calibrate')
      }
    }
    setBusy(false)
  }

  const deleteMap = async (m: MapRecord) => {
    if (!confirm(`¿Borrar «${m.name}» y su niebla guardada?`)) return
    await db.maps.delete(m.id!)
    if (activeRef.current?.id === m.id) {
      const old = activeRef.current
      setActive(null)
      localStorage.removeItem('dnd-map-table:last')
      window.setTimeout(() => old?.image.close(), 600)
    }
    await refreshList()
  }

  const renameMap = async (m: MapRecord) => {
    const name = prompt('Nombre del mapa', m.name)?.trim()
    if (!name) return
    await db.maps.update(m.id!, { name })
    if (activeRef.current?.id === m.id) setActive((a) => (a ? { ...a, name } : a))
    await refreshList()
  }

  // ---- Niebla ---------------------------------------------------------------------------

  const sendOp = (op: FogOp) => chRef.current?.send({ t: 'op', op })

  const fillAll = (mode: 'reveal' | 'cover') => {
    const a = activeRef.current
    if (!a) return
    const op: FogOp = { k: 'all', mode }
    a.fog.apply(op)
    sendOp(op)
    onFogChanged()
  }

  const syncFogToTable = async () => {
    const a = activeRef.current
    if (!a) return
    chRef.current?.send({ t: 'fog', fog: await a.fog.toBlob() })
  }

  const undo = async () => {
    const a = activeRef.current
    if (!a?.fog.undo()) return
    onFogChanged()
    await syncFogToTable()
  }
  const redo = async () => {
    const a = activeRef.current
    if (!a?.fog.redo()) return
    onFogChanged()
    await syncFogToTable()
  }

  // ---- Grilla ---------------------------------------------------------------------------

  const editGrid = (g: Partial<Grid>) => {
    setGrid((cur) => ({ ...cur, ...g }))
    setGridConfirmed(true)
  }

  const calibrateGrid = (r: { x: number; y: number; w: number; h: number }) => {
    const n = Math.max(1, settings.calibCells)
    const px = (r.w + r.h) / 2 / n
    setGrid({ px, ox: mod(r.x, px), oy: mod(r.y, px) })
    setGridConfirmed(true)
    settings.set({ showGridDM: true })
    setTool('brush')
    flash(`Grilla calibrada: ${px.toFixed(1)} px por casilla. Revisá que coincida con la del mapa.`)
  }

  const autoDetect = async () => {
    const a = activeRef.current
    if (!a) return
    setBusy(true)
    try {
      const rec = await db.maps.get(a.id)
      const r = await grayRegion(rec!.image)
      const guess = detectGrid(r.data, r.w, r.h, r.x0, r.y0)
      if (!guess) flash('No se encontró una grilla clara en este mapa. Usá «Calibrar arrastrando».')
      else {
        setGrid({ px: guess.px, ox: guess.ox, oy: guess.oy })
        setGridConfirmed(false)
        settings.set({ showGridDM: true })
        flash('Grilla detectada. Verificala sobre el mapa; si coincide, tocá «Confirmar grilla».')
      }
    } finally {
      setBusy(false)
    }
  }

  // ---- Mesa -----------------------------------------------------------------------------

  const openTable = () => {
    const url = `${window.location.href.split('#')[0]}#/mesa`
    window.open(url, 'mesa-dnd', 'popup,width=1280,height=720')
  }

  const moveView = (x: number, y: number) => {
    const a = activeRef.current
    if (!a) return
    setTableView((v) => ({ ...v, mode: 'physical', cx: clamp(x, 0, a.w), cy: clamp(y, 0, a.h) }))
  }

  const tableRect = useMemo(() => {
    if (!active || !playerInfo || tableView.mode !== 'physical') return null
    const sc = tableScale({ info: playerInfo, display: settings.display, grid, mode: 'physical', imgW: active.w, imgH: active.h })
    return { w: playerInfo.viewW / sc, h: playerInfo.viewH / sc }
  }, [active, playerInfo, tableView.mode, settings.display, grid])

  const pxPerCellTable = playerInfo ? settings.display.cellMm * effectivePxPerMm(playerInfo, settings.display) : null

  const applyMeasured = () => {
    const m = parseFloat(measured.replace(',', '.'))
    if (!Number.isFinite(m) || m <= 0) return flash('Escribí cuántos milímetros mide la barra con una regla.')
    const next = clamp(settings.display.correction * (100 / m), 0.5, 2)
    settings.set({ display: { ...settings.display, correction: next } })
    setMeasured('')
    flash(`Corrección aplicada (${(next * 100).toFixed(1)} %). Medí de nuevo la barra para confirmar.`)
  }

  // ---- Atajos de teclado ----------------------------------------------------------------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return
      const ctrl = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      const S = useSettings.getState()
      if (ctrl && k === 'z') {
        e.preventDefault()
        void (e.shiftKey ? redo() : undo())
      } else if (ctrl && k === 'y') {
        e.preventDefault()
        void redo()
      } else if (ctrl) return
      else if (k === 'b') setTool('brush')
      else if (k === 'r') setTool('rect')
      else if (k === 'p') setTool('poly')
      else if (k === 'c') setTool('cell')
      else if (k === 'v') setTool('view')
      else if (k === 'x') S.set({ mode: S.mode === 'reveal' ? 'cover' : 'reveal' })
      else if (k === 'g') S.set({ showGridDM: !S.showGridDM })
      else if (k === 'f') setFitSignal((n) => n + 1)
      else if (k === '[') S.set({ brushCells: clamp(S.brushCells - 0.5, 0.5, 12) })
      else if (k === ']') S.set({ brushCells: clamp(S.brushCells + 0.5, 0.5, 12) })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Interfaz -------------------------------------------------------------------------

  const mode = settings.mode
  const toolBtn = (t: Tool, label: string, key: string) => (
    <button className={tool === t ? 'on' : ''} onClick={() => setTool(t)} title={`${label} (${key})`} disabled={!active}>
      {label}
    </button>
  )

  return (
    <div
      className="app"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        void importFiles(Array.from(e.dataTransfer.files))
      }}
    >
      <aside className="library">
        <header>
          <h1>Mapas</h1>
          <label className="btn primary">
            Importar mapas
            <input
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                void importFiles(Array.from(e.target.files ?? []))
                e.target.value = ''
              }}
            />
          </label>
        </header>
        <ul className="maps">
          {maps.length === 0 && <li className="muted pad">Todavía no hay mapas. Arrastrá imágenes acá.</li>}
          {maps.map((m) => (
            <li key={m.id} className={m.id === active?.id ? 'sel' : ''}>
              <button className="map-card" onClick={() => void openMap(m.id!)}>
                <Thumb blob={m.thumb} alt="" />
                <span className="map-name">{m.name}</span>
                <span className="map-meta">
                  {m.width}×{m.height} px{!m.gridConfirmed && <b className="warn"> · grilla sin confirmar</b>}
                </span>
              </button>
              <div className="map-actions">
                <button onClick={() => void renameMap(m)}>Renombrar</button>
                <button onClick={() => void deleteMap(m)}>Borrar</button>
              </div>
            </li>
          ))}
        </ul>
      </aside>

      <main className="main">
        <div className="topbar">
          <strong className="map-title">{active ? active.name : 'Sin mapa'}</strong>
          <div className="spacer" />
          <button onClick={() => void undo()} disabled={!undoState.undo} title="Deshacer (Ctrl+Z)">
            Deshacer
          </button>
          <button onClick={() => void redo()} disabled={!undoState.redo} title="Rehacer (Ctrl+Shift+Z)">
            Rehacer
          </button>
          <button onClick={() => setFitSignal((n) => n + 1)} disabled={!active} title="Ajustar vista (F)">
            Ver mapa completo
          </button>
        </div>
        <MapStage
          map={active}
          grid={grid}
          showGrid={settings.showGridDM}
          gridOpacity={settings.gridOpacity}
          gridLight={settings.gridLight}
          fogStyle={fogStyle}
          tool={tool}
          mode={mode}
          brushCells={settings.brushCells}
          hardness={settings.hardness}
          calibCells={settings.calibCells}
          tableView={tableView}
          tableRect={tableRect}
          fitSignal={fitSignal}
          onSendOp={sendOp}
          onFogChanged={onFogChanged}
          onMoveView={moveView}
          onCalibrate={calibrateGrid}
        />
        <div className="statusbar">
          <span>{HINTS[tool]}</span>
          {busy && <span className="chip">Procesando…</span>}
        </div>
        {msg && (
          <div className="toast" role="status">
            {msg}
          </div>
        )}
        {calib && <div className="toast calib">El patrón de calibración está activo en la mesa; el mapa no se ve hasta que lo cierres.</div>}
      </main>

      <aside className="panel">
        <section>
          <h2>Mesa</h2>
          <div className={`status ${playerAlive ? 'ok' : ''}`}>
            {playerAlive && playerInfo
              ? `Conectada · pantalla ${Math.round(playerInfo.screenW * playerInfo.dpr)}×${Math.round(playerInfo.screenH * playerInfo.dpr)} px`
              : 'Ventana de mesa cerrada'}
          </div>
          <div className="row">
            <button className="primary" onClick={openTable}>
              Abrir ventana de mesa
            </button>
          </div>
          <p className="note">Arrastrala a la pantalla del HDMI y hacé doble clic para pantalla completa.</p>
          <Segmented
            label="Vista de la mesa"
            value={tableView.mode}
            onChange={(m) => setTableView((v) => ({ ...v, mode: m }))}
            options={[
              { value: 'physical', label: 'Escala real' },
              { value: 'fit', label: 'Mapa completo' },
            ]}
          />
          {tableView.mode === 'fit' && <p className="note warn">Fuera de escala: las miniaturas no coincidirán con las casillas.</p>}
          {pxPerCellTable && tableView.mode === 'physical' && (
            <p className="note">
              Cada casilla de {settings.display.cellMm} mm ocupa {pxPerCellTable.toFixed(0)} px en la mesa.
            </p>
          )}
          <div className="row">
            {toolBtn('view', 'Mover vista', 'V')}
            <button disabled={!active} onClick={() => active && moveView(active.w / 2, active.h / 2)}>
              Centrar en el mapa
            </button>
          </div>

          <details open={!playerAlive || calib || settings.display.correction === 1}>
            <summary>Calibrar escala de la pantalla</summary>
            <NumberField
              label="Diagonal de la pantalla"
              value={settings.display.diagIn}
              step={0.5}
              min={10}
              max={120}
              suffix="pulgadas"
              onChange={(v) => settings.set({ display: { ...settings.display, diagIn: clamp(v, 10, 120) } })}
            />
            <NumberField
              label="Tamaño de casilla en la mesa"
              value={settings.display.cellMm}
              step={0.5}
              min={5}
              max={100}
              suffix="mm"
              onChange={(v) => settings.set({ display: { ...settings.display, cellMm: clamp(v, 5, 100) } })}
            />
            <div className="row">
              <button disabled={!playerAlive} onClick={() => setCalib((c) => !c)}>
                {calib ? 'Cerrar patrón de calibración' : 'Mostrar patrón en la mesa'}
              </button>
            </div>
            <label className="field">
              <span>La barra de 100 mm mide en realidad</span>
              <span className="field-input">
                <input
                  type="text"
                  inputMode="decimal"
                  value={measured}
                  placeholder="ej. 96,5"
                  onChange={(e) => setMeasured(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && applyMeasured()}
                />
                <em>mm</em>
              </span>
            </label>
            <div className="row">
              <button disabled={!measured} onClick={applyMeasured}>
                Aplicar medida
              </button>
              <button
                disabled={settings.display.correction === 1}
                onClick={() => settings.set({ display: { ...settings.display, correction: 1 } })}
              >
                Quitar corrección
              </button>
            </div>
            <p className="note">
              Corrección actual: {(settings.display.correction * 100).toFixed(1)} %. Medí la barra con una regla y escribí el valor real; con eso la casilla
              queda exacta aunque el televisor recorte la imagen.
            </p>
          </details>
        </section>

        <section>
          <h2>Niebla</h2>
          <Segmented
            label="Acción"
            value={mode}
            onChange={(m) => settings.set({ mode: m })}
            options={[
              { value: 'reveal', label: 'Revelar' },
              { value: 'cover', label: 'Ocultar' },
            ]}
          />
          <div className="row wrap">
            {toolBtn('brush', 'Pincel', 'B')}
            {toolBtn('cell', 'Casilla', 'C')}
            {toolBtn('rect', 'Rectángulo', 'R')}
            {toolBtn('poly', 'Polígono', 'P')}
          </div>
          <label className="field">
            <span>Tamaño del pincel: {settings.brushCells} casillas</span>
            <input type="range" min={0.5} max={12} step={0.5} value={settings.brushCells} onChange={(e) => settings.set({ brushCells: Number(e.target.value) })} />
          </label>
          <label className="field">
            <span>Borde del pincel: {settings.hardness >= 0.98 ? 'duro' : settings.hardness < 0.35 ? 'muy suave' : 'suave'}</span>
            <input type="range" min={0} max={1} step={0.05} value={settings.hardness} onChange={(e) => settings.set({ hardness: Number(e.target.value) })} />
          </label>
          <Segmented
            label="Aspecto de lo oculto"
            value={fogStyle}
            onChange={setFogStyle}
            options={[
              { value: 'dark', label: 'Oscuridad' },
              { value: 'mist', label: 'Niebla' },
            ]}
          />
          <div className="row">
            <button disabled={!active} onClick={() => fillAll('reveal')}>
              Mostrar todo
            </button>
            <button disabled={!active} onClick={() => fillAll('cover')}>
              Ocultar todo
            </button>
          </div>
          <p className="note">Tu pantalla muestra lo oculto semitransparente; la mesa lo muestra opaco.</p>
        </section>

        <section>
          <h2>Grilla del mapa</h2>
          {!gridConfirmed && active && <p className="note warn">Esta grilla todavía no fue confirmada. Compará las líneas con las del mapa.</p>}
          <div className="row wrap">
            {toolBtn('calibrate', 'Calibrar arrastrando', '')}
            <button disabled={!active} onClick={() => void autoDetect()}>
              Detectar automáticamente
            </button>
          </div>
          <NumberField
            label="Casillas abarcadas al calibrar"
            value={settings.calibCells}
            step={1}
            min={1}
            max={50}
            onChange={(v) => settings.set({ calibCells: clamp(Math.round(v), 1, 50) })}
          />
          <p className="note">Cuantas más casillas abarques (por ejemplo 10), más exacta queda la medida.</p>
          <NumberField label="Píxeles por casilla" value={grid.px} step={0.1} min={4} max={2000} onChange={(v) => editGrid({ px: clamp(v, 4, 2000) })} />
          <div className="row">
            <button disabled={!active} onClick={() => editGrid({ px: Math.max(4, grid.px / 2) })}>
              ÷ 2
            </button>
            <button disabled={!active} onClick={() => editGrid({ px: Math.min(2000, grid.px * 2) })}>
              × 2
            </button>
          </div>
          <NumberField label="Desplazamiento horizontal" value={grid.ox} step={0.5} suffix="px" onChange={(v) => editGrid({ ox: mod(v, grid.px) })} />
          <NumberField label="Desplazamiento vertical" value={grid.oy} step={0.5} suffix="px" onChange={(v) => editGrid({ oy: mod(v, grid.px) })} />
          {active && (
            <NumberField
              label="O indicá las casillas a lo ancho"
              value={Number((active.w / grid.px).toFixed(2))}
              step={1}
              min={1}
              onChange={(v) => v > 0 && editGrid({ px: active.w / v })}
            />
          )}
          <div className="row">
            <button disabled={!active || gridConfirmed} className={gridConfirmed ? '' : 'primary'} onClick={() => setGridConfirmed(true)}>
              Confirmar grilla
            </button>
          </div>
          <label className="check">
            <input type="checkbox" checked={settings.showGridDM} onChange={(e) => settings.set({ showGridDM: e.target.checked })} /> Ver grilla en mi pantalla (G)
          </label>
          <label className="check">
            <input type="checkbox" checked={settings.showGridTable} onChange={(e) => settings.set({ showGridTable: e.target.checked })} /> Ver grilla en la mesa
          </label>
          <label className="field">
            <span>Intensidad de la grilla</span>
            <input type="range" min={0.1} max={0.9} step={0.05} value={settings.gridOpacity} onChange={(e) => settings.set({ gridOpacity: Number(e.target.value) })} />
          </label>
          <Segmented
            label="Color de la grilla"
            value={settings.gridLight ? 'light' : 'dark'}
            onChange={(v) => settings.set({ gridLight: v === 'light' })}
            options={[
              { value: 'light', label: 'Clara' },
              { value: 'dark', label: 'Oscura' },
            ]}
          />
        </section>
      </aside>

      {dragging && <div className="drop">Soltá las imágenes para importarlas</div>}
    </div>
  )
}
