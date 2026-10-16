const KEYS: { keys: string[]; text: string }[] = [
  { keys: ['B'], text: 'Pincel' },
  { keys: ['C'], text: 'Casilla' },
  { keys: ['R'], text: 'Rectángulo' },
  { keys: ['P'], text: 'Polígono' },
  { keys: ['V'], text: 'Mover vista de la mesa' },
  { keys: ['X'], text: 'Revelar / Ocultar' },
  { keys: ['[', ']'], text: 'Tamaño del pincel' },
  { keys: ['G'], text: 'Grilla en mi pantalla' },
  { keys: ['F'], text: 'Ver mapa completo' },
  { keys: ['Ctrl', 'Z'], text: 'Deshacer' },
  { keys: ['Ctrl', 'Shift', 'Z'], text: 'Rehacer' },
  { keys: ['Espacio', '+ arrastrar'], text: 'Mover mi vista' },
  { keys: ['Ctrl', '+ clic der.'], text: 'Mover la vista de la mesa (arrastrando)' },
  { keys: ['Rueda'], text: 'Zoom en mi pantalla' },
  { keys: ['Enter'], text: 'Cerrar polígono' },
  { keys: ['Esc'], text: 'Cancelar forma' },
]

export default function Shortcuts(props: { open: boolean; onToggle: () => void }) {
  if (!props.open) {
    return (
      <button className="shortcuts-min" onClick={props.onToggle} aria-expanded="false" title="Mostrar atajos de teclado">
        Atajos
      </button>
    )
  }
  return (
    <div className="shortcuts" role="region" aria-label="Atajos de teclado">
      <div className="shortcuts-head">
        <strong>Atajos de teclado</strong>
        <button onClick={props.onToggle} aria-expanded="true" title="Minimizar">
          Minimizar
        </button>
      </div>
      <ul>
        {KEYS.map((k) => (
          <li key={k.text}>
            <span className="keys">
              {k.keys.map((key) => (
                <kbd key={key}>{key}</kbd>
              ))}
            </span>
            <span>{k.text}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
