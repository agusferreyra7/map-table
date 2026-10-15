import Dexie, { type Table } from 'dexie'
import type { MapRecord } from './types'

class MapDB extends Dexie {
  maps!: Table<MapRecord, number>
  constructor() {
    super('dnd-map-table')
    this.version(1).stores({ maps: '++id, name, updatedAt' })
  }
}

export const db = new MapDB()
