import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StatusBar } from './components/StatusBar'
import { SourceEditor } from './editor/SourceEditor'
import { countCharacters, countWords } from './editor/serializer'
import { postMessage, type HostToWebviewMessage } from './protocol'
import { setResolvedImage } from './editor/image-store'
import iconPng from '../../media/icon.png'

export function App() {
  const [markdown, setMarkdown] = useState('')
  const [ready, setReady] = useState(false)
  const sendTimer = useRef<number | undefined>(undefined)
  const latestVersion = useRef(0)
  const latestMarkdown = useRef('')

  const words = useMemo(() => countWords(markdown), [markdown])
  const characters = useMemo(() => countCharacters(markdown), [markdown])

  const pushDocument = useCallback((nextMarkdown: string) => {
    postMessage({
      type: 'replaceDocument',
      baseVersion: latestVersion.current,
      markdown: nextMarkdown,
    })
  }, [])

  const sendReplacement = useCallback((nextMarkdown: string) => {
    latestMarkdown.current = nextMarkdown
    setMarkdown(nextMarkdown)
    window.clearTimeout(sendTimer.current)
    sendTimer.current = window.setTimeout(() => {
      pushDocument(latestMarkdown.current)
    }, 300)
  }, [pushDocument])

  const flushPending = useCallback(() => {
    window.clearTimeout(sendTimer.current)
    sendTimer.current = undefined
    pushDocument(latestMarkdown.current)
  }, [pushDocument])

  useEffect(() => {
    const handleBlur = () => {
      flushPending()
    }
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('blur', handleBlur)
    }
  }, [flushPending])

  useEffect(() => {
    const receive = (event: MessageEvent<HostToWebviewMessage>) => {
      const message = event.data
      switch (message.type) {
        case 'initialize':
          setMarkdown(message.markdown)
          latestMarkdown.current = message.markdown
          latestVersion.current = message.documentVersion
          setReady(true)
          break
        case 'documentChanged':
          if (message.markdown !== latestMarkdown.current) {
            setMarkdown(message.markdown)
            latestMarkdown.current = message.markdown
          }
          latestVersion.current = message.documentVersion
          break
        case 'versionSync':
          latestVersion.current = message.documentVersion
          break
        case 'imageResolved':
          setResolvedImage(message.source, message.uri)
          break
        case 'flushEdits':
          // A save is starting: hand over the debounced edit before it runs, or
          // the file is written without the last keystrokes.
          flushPending()
          postMessage({ type: 'editsFlushed', requestId: message.requestId })
          break
        default:
          break
      }
    }
    window.addEventListener('message', receive)
    postMessage({ type: 'ready' })

    if (typeof window !== 'undefined' && !window.acquireVsCodeApi) {
      const demoMarkdown = `# Welcome to Inkline

Inkline is a modern live-preview Markdown editor designed for speed and beauty.

## Code Blocks

\`\`\`javascript
function calculateSum(a, b) {
  // Try selecting text inside this codeblock!
  const result = a + b;
  return result;
}
\`\`\`

## Lists & Outlining

1. First ordered item
   1. Sub-item level 2
      1. Deep item level 3
         1. Level 4 item
2. Second ordered item

- [ ] Task item 1 (clickable checkbox)
- [x] Completed task item

## Math & Formulae

Inline math like $\\alpha + \\beta = \\gamma$ and block math:

$$\\int_{-\\infty}^\\infty e^{-x^2} dx = \\sqrt{\\pi}$$

## Obsidian Features

> [!NOTE]
> Callouts are fully supported with clean alert styling!

Links: [Inkline on GitHub](https://github.com/whitebumblebee/inkline) and wikilinks [[Overview|Documentation]].
`
      setMarkdown(demoMarkdown)
      latestMarkdown.current = demoMarkdown
      setReady(true)
    }
    return () => {
      window.removeEventListener('message', receive)
      window.clearTimeout(sendTimer.current)
    }
  }, [flushPending])

  const handleSourceChange = useCallback((nextMarkdown: string) => {
    sendReplacement(nextMarkdown)
  }, [sendReplacement])

  return (
    <main className="inkline-shell">
      <header className="editor-header">
        <div className="brand-lockup" translate="no">
          <img src={iconPng} alt="" className="brand-logo" width="18" height="18" />
          <span>Inkline</span>
        </div>
      </header>

      <section className="editor-frame" aria-label="Inkline contextual live preview Markdown editor">
        <div className="editor-content">
          {ready ? (
            <SourceEditor
              value={markdown}
              onChange={handleSourceChange}
            />
          ) : null}
        </div>
      </section>

      <StatusBar status="Live Preview" words={words} characters={characters} />
    </main>
  )
}
