import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted fonts (font-display: swap built in) — no render-blocking
// external Google Fonts request. Family names: "DM Sans Variable" /
// "JetBrains Mono Variable" (see --font-sans / --font-mono in index.css).
import '@fontsource-variable/dm-sans'
import '@fontsource-variable/jetbrains-mono'
import './lib/i18n'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
