import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Konva from 'konva'
import { App } from './App'
import './index.css'

/**
 * Cap the canvas backing-store resolution.
 *
 * Konva renders each layer at `devicePixelRatio` so lines stay crisp on a HiDPI
 * display. Beyond 2× the memory and fill-rate cost grows faster than the
 * visible improvement, and a 4K board at 3× can exhaust the canvas budget. Two
 * is the sweet spot: retina-crisp, still fast on a large board.
 */
Konva.pixelRatio = Math.min(window.devicePixelRatio || 1, 2)

const container = document.getElementById('root')
if (!container) throw new Error('Root element is missing from index.html')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
