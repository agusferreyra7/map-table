import { useEffect, useRef, useState } from 'react'
import { db } from '../db'
import { playerChannel } from '../lib/channel'
import { drawCalibration } from '../lib/calib'
import { FogEngine } from '../lib/fog'
import { SceneRenderer, type Camera } from '../lib/render'
import { effectivePxPerMm, tableScale } from '../lib/scale'
import type { PlayerInfo, TableState, ToPlayer } from '../types'

const EMPTY: TableState = {
  mapId: null,
  imgW: 1,
  imgH: 1,
  grid: { px: 70, ox: 0, oy: 0 },
  showGrid: false,
  gridOpacity: 0.35,
  gridLight: true,
  fogStyle: 'dark',
  view: { mode: 'physical', cx: 0, cy: 0 },
  display: { diagIn: 43, cellMm: 25, correction: 1 },
  calib: false,
}

function readInfo(): PlayerInfo {
  return {
    screenW: window.screen.width,
    screenH: window.screen.height,
    dpr: window.devicePixelRatio || 1,
    viewW: window.innerWidth,
    viewH: window.innerHeight,
    fullscreen: !!document.fullscreenElement,
  }
}

/** Ventana que se arrastra a la pantalla de la mesa: solo muestra el mapa, sin controles. */
export default function PlayerPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hasMap, setHasMap] = useState(false)
  const [fs, setFs] = useState(false)

  useEffect(() => {
    document.body.classList.add('mesa')
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const renderer = new SceneRenderer()

    let state: TableState = EMPTY
    let image: ImageBitmap | null = null
    let fog: FogEngine | null = null
    let info = readInfo()
    let dirty = true
    let lastFogVersion = -1
    let raf = 0
    let alive = true

    let sendMsg: (m: { t: 'hello' } | { t: 'info'; info: PlayerInfo }) => void = () => {}

    const sendInfo = () => {
      const next = readInfo()
      info = next
      sendMsg({ t: 'info', info: next })
      dirty = true
    }

    const loadMap = async (s: TableState, fogBlob: Blob | null) => {
      const rec = await db.maps.get(s.mapId!)
      if (!rec) return
      const bmp = await createImageBitmap(rec.image)
      image?.close()
      image = bmp
      fog = new FogEngine(rec.width, rec.height)
      await fog.loadBlob(fogBlob ?? rec.fog)
      lastFogVersion = -1
    }

    // Los mensajes se procesan en orden, aunque cargar el mapa tarde.
    let queue: Promise<void> = Promise.resolve()
    const handle = async (m: ToPlayer) => {
      switch (m.t) {
        case 'state': {
          const mapChanged = m.state.mapId !== state.mapId || !image
          state = m.state
          if (state.mapId === null) {
            image?.close()
            image = null
            fog = null
            setHasMap(false)
          } else if (mapChanged) {
            await loadMap(state, m.fog)
            setHasMap(true)
          } else if (fog && m.fog) {
            await fog.loadBlob(m.fog)
          }
          break
        }
        case 'patch':
          state = { ...state, ...m.patch }
          break
        case 'op':
          fog?.drawLive(m.op)
          break
        case 'fog':
          await fog?.loadBlob(m.fog)
          break
      }
      dirty = true
    }
    const ch = playerChannel((m) => {
      queue = queue.then(() => handle(m)).catch(console.error)
    })
    sendMsg = ch.send

    const frame = () => {
      if (!alive) return
      raf = requestAnimationFrame(frame)
      const v = fog?.version ?? -1
      if (!dirty && v === lastFogVersion) return
      dirty = false
      lastFogVersion = v
      const w = window.innerWidth
      const h = window.innerHeight
      const dpr = window.devicePixelRatio || 1
      if (state.calib) {
        drawCalibration(ctx, w, h, dpr, effectivePxPerMm(info, state.display), state.display.cellMm)
        return
      }
      const fit = state.view.mode === 'fit'
      const scale = tableScale({ info, display: state.display, grid: state.grid, mode: state.view.mode, imgW: state.imgW, imgH: state.imgH })
      const cam: Camera = fit
        ? { cx: state.imgW / 2, cy: state.imgH / 2, scale }
        : { cx: state.view.cx, cy: state.view.cy, scale }
      renderer.draw(ctx, {
        w, h, dpr, cam, image,
        imgW: state.imgW, imgH: state.imgH,
        fog, fogStyle: state.fogStyle, fogAlpha: 1,
        grid: state.grid, showGrid: state.showGrid,
        gridOpacity: state.gridOpacity, gridLight: state.gridLight,
        background: '#000',
      })
    }
    raf = requestAnimationFrame(frame)

    const onResize = () => sendInfo()
    const onFs = () => {
      setFs(!!document.fullscreenElement)
      sendInfo()
    }
    window.addEventListener('resize', onResize)
    document.addEventListener('fullscreenchange', onFs)
    const beat = window.setInterval(sendInfo, 2000)
    sendMsg({ t: 'hello' })
    sendInfo()

    return () => {
      alive = false
      cancelAnimationFrame(raf)
      clearInterval(beat)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('fullscreenchange', onFs)
      document.body.classList.remove('mesa')
      ch.close()
      image?.close()
    }
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen()
  }

  return (
    <div className="mesa-root" onDoubleClick={toggleFullscreen}>
      <canvas ref={canvasRef} className="mesa-canvas" />
      {!hasMap && (
        <div className="mesa-wait">
          <p>Mesa lista. Elegí un mapa en la ventana del director.</p>
          {!fs && <p className="mesa-hint">Doble clic para pasar a pantalla completa.</p>}
        </div>
      )}
    </div>
  )
}
