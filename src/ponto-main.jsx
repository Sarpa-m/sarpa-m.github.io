import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import PontoApp from './pages/PontoApp.jsx'
import './index.css'

createRoot(document.getElementById('ponto-root')).render(
  <StrictMode>
    <PontoApp />
  </StrictMode>,
)
