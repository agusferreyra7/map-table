import { useEffect, useState } from 'react'
import ControlPage from './pages/ControlPage'
import PlayerPage from './pages/PlayerPage'

function routeFromHash() {
  return window.location.hash.startsWith('#/mesa') ? 'mesa' : 'control'
}

export default function App() {
  const [route, setRoute] = useState(routeFromHash())
  useEffect(() => {
    const on = () => setRoute(routeFromHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route === 'mesa' ? <PlayerPage /> : <ControlPage />
}
