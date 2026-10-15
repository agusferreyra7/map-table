export interface ImportedImage {
  blob: Blob
  thumb: Blob
  width: number
  height: number
}

/** Lee un archivo de imagen y genera una miniatura para la biblioteca. */
export async function importImage(file: File): Promise<ImportedImage> {
  const bmp = await createImageBitmap(file)
  const width = bmp.width
  const height = bmp.height
  const tw = 240
  const th = Math.max(1, Math.round((height / width) * tw))
  const c = document.createElement('canvas')
  c.width = tw
  c.height = th
  const g = c.getContext('2d')!
  g.imageSmoothingQuality = 'high'
  g.drawImage(bmp, 0, 0, tw, th)
  bmp.close()
  const thumb = await new Promise<Blob>((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error('miniatura'))), 'image/jpeg', 0.8),
  )
  return { blob: file, thumb, width, height }
}

/** Devuelve los píxeles en escala de grises de una región (para detectar la grilla). */
export async function grayRegion(
  blob: Blob,
  maxSide = 2400,
): Promise<{ data: Uint8ClampedArray; w: number; h: number; x0: number; y0: number }> {
  const bmp = await createImageBitmap(blob)
  const w = Math.min(bmp.width, maxSide)
  const h = Math.min(bmp.height, maxSide)
  const x0 = Math.floor((bmp.width - w) / 2)
  const y0 = Math.floor((bmp.height - h) / 2)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.drawImage(bmp, x0, y0, w, h, 0, 0, w, h)
  bmp.close()
  const rgba = g.getImageData(0, 0, w, h).data
  const data = new Uint8ClampedArray(w * h)
  for (let i = 0, j = 0; i < data.length; i++, j += 4) {
    data[i] = (rgba[j] * 299 + rgba[j + 1] * 587 + rgba[j + 2] * 114) / 1000
  }
  return { data, w, h, x0, y0 }
}
