import type { FogMode, FogOp } from '../types'

/**
 * Máscara de niebla. Es un canvas de solo alfa: opaco = oculto, transparente = revelado.
 * Todas las operaciones usan coordenadas en píxeles del mapa original, así que
 * la resolución de la máscara es independiente del tamaño del mapa.
 */
export class FogEngine {
  readonly mask: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly base: HTMLCanvasElement
  private readonly baseCtx: CanvasRenderingContext2D
  readonly scale: number
  ops: FogOp[] = []
  private redoStack: FogOp[] = []
  /** Se incrementa en cada cambio visible: sirve para saber cuándo redibujar. */
  version = 0

  constructor(readonly mapW: number, readonly mapH: number, maxSide = 3072) {
    this.scale = Math.min(1, maxSide / Math.max(mapW, mapH))
    const w = Math.max(1, Math.round(mapW * this.scale))
    const h = Math.max(1, Math.round(mapH * this.scale))
    this.mask = this.makeCanvas(w, h)
    this.base = this.makeCanvas(w, h)
    this.ctx = this.mask.getContext('2d')!
    this.baseCtx = this.base.getContext('2d')!
    this.fillAll(this.ctx)
    this.fillAll(this.baseCtx)
  }

  private makeCanvas(w: number, h: number) {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    return c
  }

  private fillAll(ctx: CanvasRenderingContext2D) {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  }

  private setMode(ctx: CanvasRenderingContext2D, mode: FogMode) {
    ctx.globalCompositeOperation = mode === 'reveal' ? 'destination-out' : 'source-over'
  }

  private dab(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, hardness: number) {
    if (hardness >= 0.98) {
      ctx.fillStyle = '#000'
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
      return
    }
    const g = ctx.createRadialGradient(x, y, r * hardness, x, y, r)
    g.addColorStop(0, 'rgba(0,0,0,1)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  /** Dibuja una operación sobre un contexto de máscara. */
  private paint(ctx: CanvasRenderingContext2D, op: FogOp) {
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0)
    this.setMode(ctx, op.mode)
    switch (op.k) {
      case 'all': {
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        if (op.mode === 'reveal') ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
        else this.fillAll(ctx)
        break
      }
      case 'rects': {
        ctx.fillStyle = '#000'
        for (let i = 0; i + 3 < op.rects.length; i += 4) {
          ctx.fillRect(op.rects[i], op.rects[i + 1], op.rects[i + 2], op.rects[i + 3])
        }
        break
      }
      case 'poly': {
        if (op.pts.length < 6) break
        ctx.fillStyle = '#000'
        ctx.beginPath()
        ctx.moveTo(op.pts[0], op.pts[1])
        for (let i = 2; i < op.pts.length; i += 2) ctx.lineTo(op.pts[i], op.pts[i + 1])
        ctx.closePath()
        ctx.fill()
        break
      }
      case 'stroke': {
        const { pts, r, hardness } = op
        if (pts.length < 2) break
        const step = Math.max(0.5, r * (hardness >= 0.98 ? 0.35 : 0.18))
        if (!op.cont) this.dab(ctx, pts[0], pts[1], r, hardness)
        for (let i = 2; i + 1 < pts.length; i += 2) {
          const ax = pts[i - 2], ay = pts[i - 1], bx = pts[i], by = pts[i + 1]
          const d = Math.hypot(bx - ax, by - ay)
          const n = Math.floor(d / step)
          for (let s = 1; s <= n; s++) {
            const t = (s * step) / d
            this.dab(ctx, ax + (bx - ax) * t, ay + (by - ay) * t, r, hardness)
          }
          this.dab(ctx, bx, by, r, hardness)
        }
        break
      }
    }
    ctx.globalCompositeOperation = 'source-over'
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }

  /** Pinta una parte de la operación sin registrarla (trazos en vivo, mensajes de red). */
  drawLive(op: FogOp) {
    this.paint(this.ctx, op)
    this.version++
  }

  /** Registra en el historial una operación que ya fue pintada con drawLive. */
  commit(op: FogOp) {
    this.ops.push(op)
    this.redoStack = []
    this.compact()
  }

  /** Pinta y registra en un solo paso (rectángulos, polígonos, todo). */
  apply(op: FogOp) {
    this.drawLive(op)
    this.commit(op)
  }

  private compact() {
    if (this.ops.length <= 80) return
    for (const op of this.ops.splice(0, 30)) this.paint(this.baseCtx, op)
  }

  private rebuild() {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0)
    this.ctx.globalCompositeOperation = 'copy'
    this.ctx.drawImage(this.base, 0, 0)
    this.ctx.globalCompositeOperation = 'source-over'
    for (const op of this.ops) this.paint(this.ctx, op)
    this.version++
  }

  get canUndo() {
    return this.ops.length > 0
  }
  get canRedo() {
    return this.redoStack.length > 0
  }

  undo(): boolean {
    const op = this.ops.pop()
    if (!op) return false
    this.redoStack.push(op)
    this.rebuild()
    return true
  }

  redo(): boolean {
    const op = this.redoStack.pop()
    if (!op) return false
    this.ops.push(op)
    this.paint(this.ctx, op)
    this.version++
    return true
  }

  /** Reemplaza el estado completo con una imagen guardada (o la oculta toda si es null). */
  async loadBlob(blob: Blob | null) {
    this.ops = []
    this.redoStack = []
    this.fillAll(this.ctx)
    if (blob) {
      const bmp = await createImageBitmap(blob)
      this.ctx.setTransform(1, 0, 0, 1, 0, 0)
      this.ctx.globalCompositeOperation = 'copy'
      this.ctx.drawImage(bmp, 0, 0, this.mask.width, this.mask.height)
      this.ctx.globalCompositeOperation = 'source-over'
      bmp.close()
    }
    this.baseCtx.setTransform(1, 0, 0, 1, 0, 0)
    this.baseCtx.globalCompositeOperation = 'copy'
    this.baseCtx.drawImage(this.mask, 0, 0)
    this.baseCtx.globalCompositeOperation = 'source-over'
    this.version++
  }

  toBlob(): Promise<Blob> {
    return new Promise((resolve, reject) =>
      this.mask.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo exportar la niebla'))), 'image/png'),
    )
  }
}
