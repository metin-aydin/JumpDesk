import '@fontsource-variable/jetbrains-mono'
import './styles/globals.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { initTheme } from './stores/theme'
import { initUpdate } from './stores/update'
import { applyStoredZoom } from './stores/font-sizes'

applyStoredZoom()
void initUpdate()

void initTheme().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>
  )
})
