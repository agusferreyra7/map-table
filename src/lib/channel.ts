import type { ToControl, ToPlayer } from '../types'

const NAME = 'dnd-map-table'

export function controlChannel(onMsg: (m: ToControl) => void) {
  const ch = new BroadcastChannel(NAME)
  ch.onmessage = (e) => onMsg(e.data as ToControl)
  return {
    send: (m: ToPlayer) => ch.postMessage(m),
    close: () => ch.close(),
  }
}

export function playerChannel(onMsg: (m: ToPlayer) => void) {
  const ch = new BroadcastChannel(NAME)
  ch.onmessage = (e) => onMsg(e.data as ToPlayer)
  return {
    send: (m: ToControl) => ch.postMessage(m),
    close: () => ch.close(),
  }
}
