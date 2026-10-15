function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Textura de niebla que se repite sin costuras (las nubes se dibujan con envoltura). */
export function makeMistTile(size = 512): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  g.fillStyle = '#939cab'
  g.fillRect(0, 0, size, size)
  const rnd = mulberry32(11)
  for (let i = 0; i < 240; i++) {
    const x = rnd() * size
    const y = rnd() * size
    const r = 40 + rnd() * 150
    const light = rnd() < 0.55
    const a = 0.05 + rnd() * 0.15
    const col = light ? '255,255,255' : '55,66,84'
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r)
        gr.addColorStop(0, `rgba(${col},${a})`)
        gr.addColorStop(1, `rgba(${col},0)`)
        g.fillStyle = gr
        g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2)
      }
    }
  }
  return c
}
