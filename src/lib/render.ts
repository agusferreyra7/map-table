import type { FogStyle, Grid } from '../types'
import type { FogEngine } from './fog'
import { makeMistTile } from './mist'

export interface Camera {
  cx: number // punto del mapa (px) que queda en el centro del canvas
  cy: number
  scale: number // px CSS de pantalla por px del mapa
}

export interface SceneOpts {
  w: number // tamaño CSS del canvas
  h: number
  dpr: number
  cam: Camera
  image: ImageBitmap | null
  imgW: number
  imgH: number
  fog: FogEngine | null
  fogStyle: FogStyle
  fogAlpha: number // 1 en la mesa, menos en la vista del director
  grid: Grid
  showGrid: boolean
  gridOpacity: number
  gridLight: boolean
  background: string
}

let mistTile: HTMLCanvasElement | null = null

/** Dibuja mapa + niebla + grilla. Lo usan la ventana del director y la de la mesa. */
export class SceneRenderer {
  private layer = document.createElement('canvas')

  draw(ctx: CanvasRenderingContext2D, o: SceneOpts) {
    const W = Math.max(1, Math.round(o.w * o.dpr))
    const H = Math.max(1, Math.round(o.h * o.dpr))
    if (ctx.canvas.width !== W || ctx.canvas.height !== H) {
      ctx.canvas.width = W
      ctx.canvas.height = H
    }
    const k = o.cam.scale * o.dpr
    const tx = W / 2 - o.cam.cx * k
    const ty = H / 2 - o.cam.cy * k

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.fillStyle = o.background
    ctx.fillRect(0, 0, W, H)

    ctx.setTransform(k, 0, 0, k, tx, ty)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    if (o.image) ctx.drawImage(o.image, 0, 0, o.imgW, o.imgH)

    if (o.fog) this.drawFog(ctx, o, W, H, k, tx, ty)
    if (o.showGrid && o.image) this.drawGrid(ctx, o, W, H, k, tx, ty)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }

  private drawFog(ctx: CanvasRenderingContext2D, o: SceneOpts, W: number, H: number, k: number, tx: number, ty: number) {
    const layer = this.layer
    if (layer.width !== W || layer.height !== H) {
      layer.width = W
      layer.height = H
    }
    const lc = layer.getContext('2d')!
    lc.setTransform(1, 0, 0, 1, 0, 0)
    lc.globalCompositeOperation = 'source-over'
    lc.clearRect(0, 0, W, H)

    if (o.fogStyle === 'dark') {
      lc.fillStyle = '#000'
      lc.fillRect(0, 0, W, H)
    } else {
      mistTile ??= makeMistTile()
      const pat = lc.createPattern(mistTile, 'repeat')!
      // El tamaño de la niebla se mide en casillas, para que se vea igual en cualquier mapa.
      const tileMap = o.grid.px * 9
      const s = tileMap / mistTile.width
      pat.setTransform(new DOMMatrix().translateSelf(tx, ty).scaleSelf(s * k, s * k))
      lc.fillStyle = pat
      lc.fillRect(0, 0, W, H)
    }

    lc.globalCompositeOperation = 'destination-in'
    lc.setTransform(k, 0, 0, k, tx, ty)
    lc.imageSmoothingEnabled = true
    lc.imageSmoothingQuality = 'high'
    lc.drawImage(o.fog!.mask, 0, 0, o.imgW, o.imgH)
    lc.globalCompositeOperation = 'source-over'

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = o.fogAlpha
    ctx.drawImage(layer, 0, 0)
    ctx.globalAlpha = 1
    ctx.setTransform(k, 0, 0, k, tx, ty)
  }

  private drawGrid(ctx: CanvasRenderingContext2D, o: SceneOpts, W: number, H: number, k: number, tx: number, ty: number) {
    const gp = o.grid.px
    if (gp * o.cam.scale < 5) return
    const x0 = Math.max(0, -tx / k)
    const x1 = Math.min(o.imgW, (W - tx) / k)
    const y0 = Math.max(0, -ty / k)
    const y1 = Math.min(o.imgH, (H - ty) / k)
    const mod = (a: number, n: number) => ((a % n) + n) % n
    ctx.lineWidth = 1 / o.cam.scale // 1 px CSS
    ctx.strokeStyle = o.gridLight ? `rgba(255,255,255,${o.gridOpacity})` : `rgba(0,0,0,${o.gridOpacity})`
    ctx.beginPath()
    const sx = x0 - mod(x0 - o.grid.ox, gp) + (mod(x0 - o.grid.ox, gp) === 0 ? 0 : gp)
    for (let x = sx; x <= x1; x += gp) {
      ctx.moveTo(x, y0)
      ctx.lineTo(x, y1)
    }
    const sy = y0 - mod(y0 - o.grid.oy, gp) + (mod(y0 - o.grid.oy, gp) === 0 ? 0 : gp)
    for (let y = sy; y <= y1; y += gp) {
      ctx.moveTo(x0, y)
      ctx.lineTo(x1, y)
    }
    ctx.stroke()
  }
}
