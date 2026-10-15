/** Patrón de calibración que se muestra en la mesa: reglas de tamaño real conocido. */
export function drawCalibration(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, pxPerMm: number, cellMm: number) {
  const W = Math.round(w * dpr)
  const H = Math.round(h * dpr)
  if (ctx.canvas.width !== W || ctx.canvas.height !== H) {
    ctx.canvas.width = W
    ctx.canvas.height = H
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)

  const mm = pxPerMm
  const light = '#f2f0e8'
  ctx.strokeStyle = light
  ctx.fillStyle = light
  ctx.lineWidth = 2

  // Borde de la pantalla: si no se ve completo, el televisor está recortando la imagen (overscan).
  ctx.strokeRect(1, 1, w - 2, h - 2)

  const cx = w / 2
  const cy = h / 2

  // Barra de 100 mm con marcas cada 10 mm.
  const barW = 100 * mm
  const x0 = cx - barW / 2
  const y0 = cy - 30 * mm
  ctx.fillRect(x0, y0, barW, 4 * mm)
  ctx.fillStyle = '#000'
  for (let i = 1; i < 10; i++) ctx.fillRect(x0 + i * 10 * mm - 0.75, y0 + (i === 5 ? 0 : 1.5 * mm), 1.5, i === 5 ? 4 * mm : 2.5 * mm)
  ctx.fillStyle = light
  ctx.font = `${Math.max(12, 4 * mm)}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.fillText('Esta barra debería medir 100 mm', cx, y0 - 3 * mm)

  // Cinco casillas del tamaño configurado; la primera con un círculo (base de miniatura).
  const cell = cellMm * mm
  const gap = 6 * mm
  const total = 5 * cell + 4 * gap
  const sy = cy + 4 * mm
  for (let i = 0; i < 5; i++) {
    const x = cx - total / 2 + i * (cell + gap)
    ctx.strokeRect(x, sy, cell, cell)
    if (i === 0) {
      ctx.beginPath()
      ctx.arc(x + cell / 2, sy + cell / 2, cell / 2, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
  ctx.fillText(`Casillas de ${cellMm} mm`, cx, sy + cell + 8 * mm)

  ctx.font = `${Math.max(11, 3.2 * mm)}px system-ui, sans-serif`
  ctx.globalAlpha = 0.7
  ctx.fillText('Si no ves el borde blanco completo, desactivá el overscan del televisor (modo «Solo escaneo», «Just Scan» o 1:1).', cx, h - 12 * mm)
  ctx.globalAlpha = 1
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}
