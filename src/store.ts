import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DisplaySettings, FogMode } from './types'

export type Tool = 'brush' | 'rect' | 'poly' | 'cell' | 'view' | 'calibrate'

interface Settings {
  display: DisplaySettings
  mode: FogMode
  brushCells: number // diámetro del pincel, en casillas
  hardness: number // 0 = borde muy suave, 1 = borde duro
  showGridDM: boolean
  showGridTable: boolean
  gridOpacity: number
  gridLight: boolean
  calibCells: number // cuántas casillas abarca el rectángulo al calibrar la grilla
  shortcutsOpen: boolean // panel de atajos desplegado o minimizado
  panelCompact: boolean // panel derecho reducido a la sección de niebla
  set: (p: Partial<Omit<Settings, 'set'>>) => void
}

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      display: { diagIn: 43, cellMm: 25, correction: 1 },
      mode: 'reveal',
      brushCells: 2,
      hardness: 0.7,
      showGridDM: true,
      showGridTable: false,
      gridOpacity: 0.35,
      gridLight: true,
      calibCells: 4,
      shortcutsOpen: true,
      panelCompact: false,
      set: (p) => set(p),
    }),
    { name: 'dnd-map-table:settings' },
  ),
)
