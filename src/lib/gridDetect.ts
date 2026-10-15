import type { Grid } from '../types'

/**
 * Sugiere el tamaño y la posición de la grilla buscando bordes que se repiten
 * con un período constante. Es una ayuda: el director siempre debe verificarla
 * con la grilla superpuesta y ajustarla a mano si hace falta.
 */
export interface GridGuess extends Grid {
  confidence: number // 0..1
}

interface Axis {
  period: number
  phase: number // posición de una línea, en px de la región
  strength: number // magnitud relativa del pico (qué tan periódico es)
}

function projection(data: Uint8ClampedArray, w: number, h: number, vertical: boolean): Float64Array {
  const n = vertical ? w : h
  const p = new Float64Array(n)
  if (vertical) {
    for (let y = 0; y < h; y++) {
      const row = y * w
      for (let x = 0; x < w - 1; x++) p[x + 1] += Math.abs(data[row + x + 1] - data[row + x])
    }
  } else {
    for (let y = 0; y < h - 1; y++) {
      const row = y * w
      for (let x = 0; x < w; x++) p[y + 1] += Math.abs(data[row + w + x] - data[row + x])
    }
  }
  // Se quita la tendencia lenta (paredes, sombras) para quedarse con las líneas finas.
  const win = 50
  const out = new Float64Array(n)
  let acc = 0
  const prefix = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) {
    acc += p[i]
    prefix[i + 1] = acc
  }
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - win)
    const b = Math.min(n, i + win + 1)
    out[i] = p[i] - (prefix[b] - prefix[a]) / (b - a)
  }
  return out
}

function fourier(p: Float64Array, period: number): { mag: number; phase: number } {
  const w = (2 * Math.PI) / period
  let c = 0
  let s = 0
  for (let i = 0; i < p.length; i++) {
    c += p[i] * Math.cos(w * i)
    s += p[i] * Math.sin(w * i)
  }
  return { mag: Math.hypot(c, s), phase: Math.atan2(s, c) }
}

function analyze(p: Float64Array, minP: number, maxP: number): Axis | null {
  if (p.length < maxP * 3) maxP = Math.floor(p.length / 3)
  if (maxP <= minP) return null
  const mags: { period: number; mag: number }[] = []
  for (let P = minP; P <= maxP; P += 0.5) mags.push({ period: P, mag: fourier(p, P).mag })
  const maxMag = Math.max(...mags.map((m) => m.mag))
  if (maxMag <= 0) return null
  // Un tren de líneas tiene la misma energía en P, P/2, P/3…: se elige el período MÁS LARGO fuerte.
  let best = -1
  for (let i = 1; i < mags.length - 1; i++) {
    const m = mags[i]
    if (m.mag >= mags[i - 1].mag && m.mag >= mags[i + 1].mag && m.mag >= 0.6 * maxMag) best = i
  }
  if (best < 0) return null
  // Refinamiento fino alrededor del pico.
  let bp = mags[best].period
  let bm = 0
  for (let P = bp - 0.6; P <= bp + 0.6; P += 0.01) {
    const m = fourier(p, P).mag
    if (m > bm) {
      bm = m
      bp = P
    }
  }
  const { phase } = fourier(p, bp)
  const pos = (((phase * bp) / (2 * Math.PI)) % bp + bp) % bp
  const mean = mags.reduce((a, m) => a + m.mag, 0) / mags.length
  return { period: bp, phase: pos, strength: bm / (mean || 1) }
}

export function detectGrid(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  x0 = 0,
  y0 = 0,
): GridGuess | null {
  const ax = analyze(projection(data, w, h, true), 20, 300)
  const ay = analyze(projection(data, w, h, false), 20, 300)
  const axes = [ax, ay].filter((a): a is Axis => a !== null)
  if (axes.length === 0) return null
  const strongest = axes.reduce((a, b) => (b.strength > a.strength ? b : a))
  if (strongest.strength < 4) return null

  let period = strongest.period
  if (ax && ay && Math.abs(ax.period - ay.period) / period < 0.04) {
    period = (ax.period * ax.strength + ay.period * ay.strength) / (ax.strength + ay.strength)
  }
  const mod = (a: number, n: number) => ((a % n) + n) % n
  const ox = mod((ax ?? strongest).phase + x0, period)
  const oy = mod((ay ?? strongest).phase + y0, period)
  const confidence = Math.max(0, Math.min(1, (strongest.strength - 4) / 8))
  return { px: period, ox, oy, confidence }
}
