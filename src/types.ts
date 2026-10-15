export type FogMode = 'reveal' | 'cover'
export type FogStyle = 'dark' | 'mist'
export type TableViewMode = 'physical' | 'fit'

/** Grilla del mapa, en píxeles de la imagen original. */
export interface Grid {
  px: number // tamaño de una casilla
  ox: number // desplazamiento horizontal de la primera línea
  oy: number // desplazamiento vertical de la primera línea
}

export interface DisplaySettings {
  diagIn: number // diagonal de la pantalla de mesa, en pulgadas
  cellMm: number // tamaño real de una casilla sobre la mesa (25 mm)
  correction: number // factor de corrección medido con la regla (1 = sin corrección)
}

export interface TableView {
  mode: TableViewMode
  cx: number // centro de la vista, en píxeles del mapa
  cy: number
}

export interface PlayerInfo {
  screenW: number // resolución de la pantalla (px CSS)
  screenH: number
  dpr: number
  viewW: number // tamaño de la ventana de mesa (px CSS)
  viewH: number
  fullscreen: boolean
}

export interface TableState {
  mapId: number | null
  imgW: number
  imgH: number
  grid: Grid
  showGrid: boolean
  gridOpacity: number
  gridLight: boolean
  fogStyle: FogStyle
  view: TableView
  display: DisplaySettings
  calib: boolean
}

export type FogOp =
  | { k: 'stroke'; mode: FogMode; r: number; hardness: number; pts: number[]; cont?: boolean }
  | { k: 'rects'; mode: FogMode; rects: number[] }
  | { k: 'poly'; mode: FogMode; pts: number[] }
  | { k: 'all'; mode: FogMode }

export type ToPlayer =
  | { t: 'state'; state: TableState; fog: Blob | null }
  | { t: 'patch'; patch: Partial<TableState> }
  | { t: 'op'; op: FogOp }
  | { t: 'fog'; fog: Blob }

export type ToControl = { t: 'hello' } | { t: 'info'; info: PlayerInfo }

export interface MapRecord {
  id?: number
  name: string
  image: Blob
  thumb: Blob
  width: number
  height: number
  grid: Grid
  gridConfirmed: boolean
  fog: Blob | null
  fogStyle: FogStyle
  view: { cx: number; cy: number }
  createdAt: number
  updatedAt: number
}
