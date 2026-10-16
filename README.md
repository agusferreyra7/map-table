# Mapas de mesa D&D

Visor de mapas con niebla de guerra para una pantalla horizontal sobre la mesa (HDMI). Las fichas son físicas, así que el mapa no dibuja personajes: solo el mapa, la niebla y, si querés, la grilla.

React 18 + TypeScript + Vite · Zustand · Dexie (IndexedDB) · PWA (funciona sin internet).

## Arrancar

```bash
npm install
npm run dev        # http://localhost:5173
```

Para usarlo sin Node en las sesiones: `npm run build` y servir `dist/` con cualquier servidor estático (`npm run preview`). Hace falta servirlo por http (no abrir `index.html` con doble clic), porque usa IndexedDB y BroadcastChannel.

## Cómo se usa en la mesa

1. Abrí la app en tu pantalla (ventana del director).
2. Tocá **Abrir ventana de mesa**, arrastrala a la pantalla del HDMI y hacé **doble clic** para pantalla completa.
3. **Importá mapas** (botón o arrastrando imágenes). Quedan guardados en el navegador, con su niebla y su grilla.
4. Revelá con el pincel, las casillas, rectángulos o polígonos. Lo que pintás aparece al instante en la mesa.

Vos ves lo oculto semitransparente; la mesa lo ve opaco. El recuadro dorado en tu pantalla muestra qué parte del mapa se ve en la mesa (con **Mover vista** lo arrastrás).

## Escala exacta (casillas de 25 mm)

Hay dos calibraciones independientes:

**1. Grilla del mapa** (cuántos píxeles de la imagen mide una casilla):
- Al importar se intenta detectar sola. Es una sugerencia: verificala con la grilla superpuesta.
- **Calibrar arrastrando**: elegí cuántas casillas vas a abarcar (mejor 10 que 1) y arrastrá un rectángulo sobre ellas. Mientras arrastrás se dibujan las subdivisiones para comparar con la grilla impresa.
- Ajuste fino: píxeles por casilla y desplazamiento horizontal/vertical, con botones ÷2 y ×2 si la detección tomó media casilla o dos.
- Si el mapa dice "30×20 casillas", podés escribir las casillas a lo ancho.

**2. Pantalla de la mesa** (cuántos píxeles de la pantalla son 25 mm reales):
- Indicá la **diagonal en pulgadas** de la pantalla. La resolución se toma de la propia ventana de mesa.
- Tocá **Mostrar patrón en la mesa**: aparece una barra de 100 mm y casillas de 25 mm. Medí la barra con una regla, escribí el valor real y **Aplicar medida**. Repetí hasta que dé 100.
- Si el borde blanco del patrón no se ve completo, el televisor recorta la imagen (overscan): activá el modo «Solo escaneo» / «Just Scan» / 1:1 / «Modo PC». Aun así, la medida con regla compensa el recorte.

En **Escala real** cada casilla del mapa mide 25 mm en la mesa, sin importar el tamaño de la imagen. **Mapa completo** ajusta todo el mapa a la pantalla, pero fuera de escala.

## Atajos

También están siempre a la vista en el panel «Atajos» (abajo a la izquierda del mapa), que se puede minimizar.

| Tecla | Acción |
|---|---|
| B / C / R / P | Pincel / Casilla / Rectángulo / Polígono |
| V | Mover vista de la mesa |
| X | Alternar Revelar / Ocultar |
| [ y ] | Tamaño del pincel |
| G | Grilla en tu pantalla |
| F | Ver mapa completo (tu pantalla) |
| Ctrl+Z / Ctrl+Shift+Z | Deshacer / Rehacer |
| Espacio + arrastrar, botón central | Mover tu vista |
| Ctrl + clic derecho (arrastrando) | Mover lo que se ve en la mesa, con cualquier herramienta |
| Rueda | Zoom en tu pantalla |
| Enter / Esc | Cerrar / cancelar polígono |

## Panel derecho

El botón «Solo niebla» (arriba del panel) oculta las secciones de mesa y grilla y deja únicamente las herramientas de niebla. Arriba siempre queda el estado de la mesa, con «Abrir mesa» si está cerrada.

## Notas

- La niebla se guarda sola (un instante después de cada cambio) y vuelve al reabrir el mapa. El historial de deshacer vale solo durante la sesión.
- Las dos ventanas deben abrirse desde el mismo navegador y la misma dirección; se comunican con BroadcastChannel y comparten la base de datos.
- Los mapas viven en IndexedDB de ese navegador: si borrás los datos del sitio, se pierden.

## Estructura

```
src/
  pages/ControlPage.tsx    ventana del director
  pages/PlayerPage.tsx     ventana de la mesa
  components/MapStage.tsx  lienzo del director: herramientas, cámara, previsualizaciones
  lib/fog.ts               máscara de niebla, operaciones, deshacer/rehacer
  lib/render.ts            dibujo de mapa + niebla + grilla (compartido)
  lib/scale.ts             matemática de escala física
  lib/gridDetect.ts        detección automática de grilla
  lib/calib.ts             patrón de calibración
  lib/channel.ts           mensajes entre ventanas
  db.ts, store.ts, types.ts
```
