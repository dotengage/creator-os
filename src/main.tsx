import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { blockTouchZoom } from './lib/no-zoom'
import './index.css'

blockTouchZoom()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
