// Fonts are bundled into dist/assets — Studio makes no third-party request.
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/jetbrains-mono'
// Global styles first, so the shell's and the primitives' own styles follow them
import './styles/tokens.css'
import './styles/base.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Studio } from './routes.js'

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <Studio />
  </StrictMode>,
)
