import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { initializeProtocol } from './protocol'
import { applyTheme } from './apply-theme'
import type { Appearance } from '../../src/themes'
import { App } from './App'
import './styles/tokens.css'
import './styles/editor.css'

initializeProtocol()

// The host writes the theme settings into the page, so the first paint is
// already in the right colours. The browser demo reads ?theme= and ?appearance=.
const params = new URLSearchParams(window.location.search)
applyTheme(
  document.documentElement.dataset.inklineTheme ?? params.get('theme') ?? 'ink',
  (document.documentElement.dataset.inklineAppearance ?? params.get('appearance') ?? 'auto') as Appearance,
)

class BootErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Inkline failed to render', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <pre className="source-fallback" role="alert">
          Inkline failed to load: {this.state.error.message}
        </pre>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BootErrorBoundary>
      <App />
    </BootErrorBoundary>
  </StrictMode>,
)
