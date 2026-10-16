import { useEffect, useRef } from 'react'
import type { Tool } from '../store'
import type { FogEngine } from '../lib/fog'
import { SceneRenderer, type Camera } from '../lib/render'
import type { FogMode, FogOp, FogStyle, Grid, TableView } from '../types'

export interface ActiveMap {
  id: number
  name: string
  image: ImageBitmap
  fog: FogEngine
  w: number
  h: number
}

interface Props {
  map: ActiveMap | null
  grid: Grid
  showGrid: boolean
  gridOpacity: number
  gridLight: boolean
  fogStyle: FogStyle
  tool: Tool
  mode: FogMode
  brushCells: number
  hardness: number
  calibCells: number
  tableView: TableView
  /** Tamaño, en px del mapa, del área que se ve en la mesa (null si no se conoce o se ve todo). */
  tableRect: { w: number; h: number } | null
  fitSignal: number
  onSendOp: (op: FogOp) => void
  onFogChanged: () => void
  onMoveView: (cx: number, cy: number) => void
  onCalibrate: (r: { x: number; y: number; w: number; h: number }) => void
}

export default function MapStage(props: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const propsRef = useRef(props)
  propsRef.current = props
  const renderTick = useRef(0)
  renderTick.current++

  // Estado interno que no necesita pasar por React.
  const s = useRef({
    cam: { cx: 0, cy: 0, scale: 1 } as Camera,
    camTick: 0,
    size: { w: 100, h: 100 },
    hover: null as { x: number; y: number; sx: number; sy: number } | null,
    panning: null as { sx: number; sy: number; cx: number; cy: number } | null,
    space: false,
    stroke: null as { pts: number[]; last: [number, number] } | null,
    cells: null as { rects: number[]; seen: Set<string> } | null,
    drag: null as { x0: number; y0: number; x1: number; y1: number } | null,
    poly: [] as number[],
    movingView: false,
    overlayTick: 0,
  })

  const fitCamera = () => {
    const p = propsRef.current
    const { w, h } = s.current.size
    if (!p.map) return
    const scale = Math.min(w / p.map.w, h / p.map.h) * 0.96
    s.current.cam = { cx: p.map.w / 2, cy: p.map.h / 2, scale }
    s.current.camTick++
  }

  useEffect(fitCamera, [props.map?.id, props.fitSignal]) // eslint-disable-line react-hooks/exhaustive-deps

  // Bucle de dibujo: solo pinta cuando algo cambió.
  useEffect(() => {
    const canvas = canvasRef.current!
    const wrap = wrapRef.current!
    const ctx = canvas.getContext('2d')!
    const renderer = new SceneRenderer()
    let raf = 0
    let lastSig = ''
    let alive = true

    const resize = () => {
      const r = wrap.getBoundingClientRect()
      s.current.size = { w: Math.max(50, r.width), h: Math.max(50, r.height) }
      canvas.style.width = `${r.width}px`
      canvas.style.height = `${r.height}px`
      s.current.camTick++
    }
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)
    resize()
    fitCamera()

    const frame = () => {
      if (!alive) return
      raf = requestAnimationFrame(frame)
      const p = propsRef.current
      const st = s.current
      const sig = `${renderTick.current}|${st.camTick}|${st.overlayTick}|${p.map?.fog.version ?? 0}`
      if (sig === lastSig) return
      lastSig = sig
      const dpr = window.devicePixelRatio || 1
      const { w, h } = st.size
      renderer.draw(ctx, {
        w, h, dpr, cam: st.cam,
        image: p.map?.image ?? null,
        imgW: p.map?.w ?? 1, imgH: p.map?.h ?? 1,
        fog: p.map?.fog ?? null,
        fogStyle: p.fogStyle,
        fogAlpha: 0.58,
        grid: p.grid,
        showGrid: p.showGrid,
        gridOpacity: p.gridOpacity,
        gridLight: p.gridLight,
        background: '#0d0f13',
      })
      if (p.map) drawOverlay(ctx, p, st, dpr)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      alive = false
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  const toMap = (clientX: number, clientY: number) => {
    const r = canvasRef.current!.getBoundingClientRect()
    const sx = clientX - r.left
    const sy = clientY - r.top
    const { cam, size } = s.current
    return { x: cam.cx + (sx - size.w / 2) / cam.scale, y: cam.cy + (sy - size.h / 2) / cam.scale, sx, sy }
  }

  const brushRadius = () => (propsRef.current.brushCells * propsRef.current.grid.px) / 2

  const sendLive = (op: FogOp) => {
    const p = propsRef.current
    p.map!.fog.drawLive(op)
    p.onSendOp(op)
  }

  const cellRect = (x: number, y: number) => {
    const g = propsRef.current.grid
    const i = Math.floor((x - g.ox) / g.px)
    const j = Math.floor((y - g.oy) / g.px)
    return { i, j, rect: [g.ox + i * g.px, g.oy + j * g.px, g.px, g.px] as number[] }
  }

  const addCell = (x: number, y: number) => {
    const st = s.current
    const c = st.cells!
    const { i, j, rect } = cellRect(x, y)
    const key = `${i},${j}`
    if (c.seen.has(key)) return
    c.seen.add(key)
    c.rects.push(...rect)
    sendLive({ k: 'rects', mode: propsRef.current.mode, rects: rect })
  }

  const finishPoly = () => {
    const st = s.current
    const p = propsRef.current
    if (st.poly.length >= 6 && p.map) {
      const op: FogOp = { k: 'poly', mode: p.mode, pts: st.poly.slice() }
      p.map.fog.apply(op)
      p.onSendOp(op)
      p.onFogChanged()
    }
    st.poly = []
    st.overlayTick++
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const p = propsRef.current
    const st = s.current
    const pt = toMap(e.clientX, e.clientY)
    ;(e.target as Element).setPointerCapture(e.pointerId)
    // Ctrl + botón derecho: en vez de mover mi vista, mueve lo que se ve en la mesa.
    if (e.button === 2 && (e.ctrlKey || e.metaKey) && p.map) {
      st.movingView = true
      p.onMoveView(pt.x, pt.y)
      st.overlayTick++
      return
    }
    if (e.button === 1 || e.button === 2 || st.space) {
      st.panning = { sx: pt.sx, sy: pt.sy, cx: st.cam.cx, cy: st.cam.cy }
      return
    }
    if (e.button !== 0 || !p.map) return
    switch (p.tool) {
      case 'brush': {
        const r = brushRadius()
        st.stroke = { pts: [pt.x, pt.y], last: [pt.x, pt.y] }
        sendLive({ k: 'stroke', mode: p.mode, r, hardness: p.hardness, pts: [pt.x, pt.y] })
        break
      }
      case 'cell':
        st.cells = { rects: [], seen: new Set() }
        addCell(pt.x, pt.y)
        break
      case 'rect':
      case 'calibrate':
        st.drag = { x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y }
        break
      case 'poly':
        st.poly.push(pt.x, pt.y)
        break
      case 'view':
        st.movingView = true
        p.onMoveView(pt.x, pt.y)
        break
    }
    st.overlayTick++
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const p = propsRef.current
    const st = s.current
    const pt = toMap(e.clientX, e.clientY)
    st.hover = pt
    if (st.panning) {
      st.cam.cx = st.panning.cx - (pt.sx - st.panning.sx) / st.cam.scale
      st.cam.cy = st.panning.cy - (pt.sy - st.panning.sy) / st.cam.scale
      st.camTick++
    } else if (st.stroke && p.map) {
      const [lx, ly] = st.stroke.last
      if (Math.hypot(pt.x - lx, pt.y - ly) * st.cam.scale >= 1.5) {
        sendLive({ k: 'stroke', mode: p.mode, r: brushRadius(), hardness: p.hardness, pts: [lx, ly, pt.x, pt.y], cont: true })
        st.stroke.pts.push(pt.x, pt.y)
        st.stroke.last = [pt.x, pt.y]
      }
    } else if (st.cells) {
      addCell(pt.x, pt.y)
    } else if (st.drag) {
      st.drag.x1 = pt.x
      st.drag.y1 = pt.y
    } else if (st.movingView) {
      p.onMoveView(pt.x, pt.y)
    }
    st.overlayTick++
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const p = propsRef.current
    const st = s.current
    ;(e.target as Element).releasePointerCapture?.(e.pointerId)
    st.panning = null
    st.movingView = false
    if (st.stroke && p.map) {
      p.map.fog.commit({ k: 'stroke', mode: p.mode, r: brushRadius(), hardness: p.hardness, pts: st.stroke.pts })
      st.stroke = null
      p.onFogChanged()
    }
    if (st.cells && p.map) {
      if (st.cells.rects.length) p.map.fog.commit({ k: 'rects', mode: p.mode, rects: st.cells.rects })
      st.cells = null
      p.onFogChanged()
    }
    if (st.drag && p.map) {
      const d = st.drag
      const x = Math.min(d.x0, d.x1)
      const y = Math.min(d.y0, d.y1)
      const w = Math.abs(d.x1 - d.x0)
      const h = Math.abs(d.y1 - d.y0)
      st.drag = null
      if (w * st.cam.scale > 4 && h * st.cam.scale > 4) {
        if (p.tool === 'rect') {
          const op: FogOp = { k: 'rects', mode: p.mode, rects: [x, y, w, h] }
          p.map.fog.apply(op)
          p.onSendOp(op)
          p.onFogChanged()
        } else if (p.tool === 'calibrate') {
          p.onCalibrate({ x, y, w, h })
        }
      }
    }
    st.overlayTick++
  }

  // La rueda necesita listener no pasivo para poder evitar el scroll de la página.
  useEffect(() => {
    const canvas = canvasRef.current!
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const st = s.current
      const pt = toMap(e.clientX, e.clientY)
      const factor = Math.exp(-e.deltaY * 0.0015)
      const next = Math.min(12, Math.max(0.03, st.cam.scale * factor))
      // Zoom alrededor del cursor.
      st.cam.cx = pt.x - (pt.sx - st.size.w / 2) / next
      st.cam.cy = pt.y - (pt.sy - st.size.h / 2) / next
      st.cam.scale = next
      st.camTick++
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [])

  // Teclas propias del escenario: espacio para mover, Enter/Esc para el polígono.
  useEffect(() => {
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT'
    }
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return
      if (e.code === 'Space') {
        s.current.space = true
        e.preventDefault()
      } else if (e.key === 'Enter') finishPoly()
      else if (e.key === 'Escape') {
        s.current.poly = []
        s.current.drag = null
        s.current.overlayTick++
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') s.current.space = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Al cambiar de herramienta se descarta lo que estaba a medias.
  useEffect(() => {
    s.current.poly = []
    s.current.drag = null
    s.current.overlayTick++
  }, [props.tool])

  const cursor = props.tool === 'brush' ? 'none' : props.tool === 'view' ? 'grab' : 'crosshair'

  return (
    <div className="stage" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          s.current.hover = null
          s.current.overlayTick++
        }}
        onDoubleClick={() => {
          if (propsRef.current.tool === 'poly') {
            // El doble clic suma dos puntos repetidos: se quita uno antes de cerrar.
            s.current.poly.splice(-2, 2)
            finishPoly()
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
      />
      {!props.map && (
        <div className="stage-empty">
          <p>Importá un mapa para empezar.</p>
          <p className="muted">Arrastrá una imagen a esta ventana o usá «Importar mapas».</p>
        </div>
      )}
    </div>
  )
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  p: Props,
  st: {
    cam: Camera
    size: { w: number; h: number }
    hover: { x: number; y: number; sx: number; sy: number } | null
    drag: { x0: number; y0: number; x1: number; y1: number } | null
    poly: number[]
  },
  dpr: number,
) {
  const { cam, size } = st
  const k = cam.scale * dpr
  const tx = (size.w / 2 - cam.cx * cam.scale) * dpr
  const ty = (size.h / 2 - cam.cy * cam.scale) * dpr
  const accent = '#6fb1c9'
  const warm = '#e8c46a'
  const revealCol = p.mode === 'reveal' ? accent : '#d9695f'

  ctx.setTransform(k, 0, 0, k, tx, ty)
  ctx.lineWidth = 1.5 / cam.scale

  // Área que se ve en la mesa.
  if (p.tableRect && p.tableView.mode === 'physical') {
    const { w, h } = p.tableRect
    const x = p.tableView.cx - w / 2
    const y = p.tableView.cy - h / 2
    ctx.strokeStyle = warm
    ctx.lineWidth = 2.5 / cam.scale
    ctx.setLineDash([10 / cam.scale, 6 / cam.scale])
    ctx.strokeRect(x, y, w, h)
    ctx.setLineDash([])
    ctx.fillStyle = warm
    ctx.font = `${13 / cam.scale}px system-ui, sans-serif`
    ctx.fillText('Lo que se ve en la mesa', x + 6 / cam.scale, y + 18 / cam.scale)
  }

  ctx.lineWidth = 1.5 / cam.scale

  // Vista previa de la herramienta activa.
  if (p.tool === 'brush' && st.hover) {
    const r = (p.brushCells * p.grid.px) / 2
    ctx.strokeStyle = revealCol
    ctx.beginPath()
    ctx.arc(st.hover.x, st.hover.y, r, 0, Math.PI * 2)
    ctx.stroke()
    if (p.hardness < 0.98) {
      ctx.globalAlpha = 0.5
      ctx.setLineDash([4 / cam.scale, 4 / cam.scale])
      ctx.beginPath()
      ctx.arc(st.hover.x, st.hover.y, r * p.hardness, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1
    }
  }

  if (p.tool === 'cell' && st.hover) {
    const g = p.grid
    const i = Math.floor((st.hover.x - g.ox) / g.px)
    const j = Math.floor((st.hover.y - g.oy) / g.px)
    ctx.strokeStyle = revealCol
    ctx.lineWidth = 2 / cam.scale
    ctx.strokeRect(g.ox + i * g.px, g.oy + j * g.px, g.px, g.px)
  }

  if (st.drag && (p.tool === 'rect' || p.tool === 'calibrate')) {
    const x = Math.min(st.drag.x0, st.drag.x1)
    const y = Math.min(st.drag.y0, st.drag.y1)
    const w = Math.abs(st.drag.x1 - st.drag.x0)
    const h = Math.abs(st.drag.y1 - st.drag.y0)
    ctx.strokeStyle = p.tool === 'calibrate' ? warm : revealCol
    ctx.strokeRect(x, y, w, h)
    if (p.tool === 'calibrate') {
      // Se dibujan las N×N casillas resultantes para compararlas con la grilla impresa en el mapa.
      const n = Math.max(1, p.calibCells)
      ctx.globalAlpha = 0.8
      ctx.beginPath()
      for (let i = 1; i < n; i++) {
        ctx.moveTo(x + (w * i) / n, y)
        ctx.lineTo(x + (w * i) / n, y + h)
        ctx.moveTo(x, y + (h * i) / n)
        ctx.lineTo(x + w, y + (h * i) / n)
      }
      ctx.stroke()
      ctx.globalAlpha = 1
      ctx.fillStyle = warm
      ctx.font = `${13 / cam.scale}px system-ui, sans-serif`
      ctx.fillText(`${(((w + h) / 2) / n).toFixed(1)} px por casilla`, x + 4 / cam.scale, y - 6 / cam.scale)
    }
  }

  if (p.tool === 'poly' && st.poly.length >= 2) {
    ctx.strokeStyle = revealCol
    ctx.beginPath()
    ctx.moveTo(st.poly[0], st.poly[1])
    for (let i = 2; i < st.poly.length; i += 2) ctx.lineTo(st.poly[i], st.poly[i + 1])
    if (st.hover) ctx.lineTo(st.hover.x, st.hover.y)
    ctx.stroke()
    ctx.fillStyle = revealCol
    for (let i = 0; i < st.poly.length; i += 2) {
      ctx.beginPath()
      ctx.arc(st.poly[i], st.poly[i + 1], 4 / cam.scale, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0)
}

