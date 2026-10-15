import type { DisplaySettings, Grid, PlayerInfo, TableViewMode } from '../types'

export const MM_PER_IN = 25.4

/** Píxeles CSS por milímetro reales de la pantalla de mesa (sin corrección). */
export function cssPxPerMm(info: PlayerInfo, diagIn: number): number {
  const wp = info.screenW * info.dpr // píxeles físicos, invariante al zoom del navegador
  const hp = info.screenH * info.dpr
  const mm = Math.max(1, diagIn) * MM_PER_IN
  return Math.hypot(wp, hp) / mm / info.dpr
}

/** Píxeles CSS por milímetro con la corrección de la regla aplicada. */
export function effectivePxPerMm(info: PlayerInfo, d: DisplaySettings): number {
  return cssPxPerMm(info, d.diagIn) * d.correction
}

/** Escala (px CSS de pantalla por px del mapa) de la vista de mesa. */
export function tableScale(o: {
  info: PlayerInfo
  display: DisplaySettings
  grid: Grid
  mode: TableViewMode
  imgW: number
  imgH: number
}): number {
  if (o.mode === 'fit') {
    return Math.min(o.info.viewW / o.imgW, o.info.viewH / o.imgH)
  }
  const pxPerCell = o.display.cellMm * effectivePxPerMm(o.info, o.display)
  return pxPerCell / o.grid.px
}
