import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { initializeProtocol } from './protocol'
import { App } from './App'
import './styles/tokens.css'
import './styles/editor.css'

initializeProtocol()

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
