import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import SodApp from './pages/SodApp.jsx'
import './index.css'

createRoot(document.getElementById('sod-root')).render(
  <StrictMode>
    <SodApp />
  </StrictMode>,
)
