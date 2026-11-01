import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StatusBar } from './components/StatusBar'
import { SourceEditor } from './editor/SourceEditor'
import { countCharacters, countWords } from './editor/serializer'
import { postMessage, type HostToWebviewMessage } from './protocol'
import { setResolvedImage } from './editor/image-store'
import { applyTheme } from './apply-theme'
import { EditSync } from './edit-sync'
import iconPng from '../../media/icon.png'

export function App() {
  const [markdown, setMarkdown] = useState('')
  const [reading, setReading] = useState(false)
  const [ready, setReady] = useState(false)
  const sync = useRef(new EditSync(postMessage)).current

  const words = useMemo(() => countWords(markdown), [markdown])
  const characters = useMemo(() => countCharacters(markdown), [markdown])

  const sendReplacement = useCallback((nextMarkdown: string) => {
    setMarkdown(nextMarkdown)
    sync.edit(nextMarkdown)
  }, [sync])

  useEffect(() => {
    const handleBlur = () => sync.flush()
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('blur', handleBlur)
    }
  }, [sync])

  useEffect(() => {
    const receive = (event: MessageEvent<HostToWebviewMessage>) => {
      const message = event.data
      switch (message.type) {
        case 'initialize':
          sync.load(message.markdown, message.documentVersion)
          setMarkdown(message.markdown)
          setReady(true)
          break
        case 'documentChanged':
          sync.external(message.markdown, message.documentVersion)
          setMarkdown(message.markdown)
          break
        case 'versionSync':
          sync.synced(message.documentVersion)
          break
        case 'imageResolved':
          setResolvedImage(message.source, message.uri)
          break
        case 'theme':
          applyTheme(message.theme, message.appearance)
          break
        case 'toggleReadingMode':
          setReading((current) => !current)
          break
        case 'flushEdits':
          // A save is starting: hand over the debounced edit before it runs, or
          // the file is written without the last keystrokes.
          sync.flush()
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
      sync.load(demoMarkdown, 1)
      setMarkdown(demoMarkdown)
      setReady(true)
    }
    return () => {
      window.removeEventListener('message', receive)
    }
  }, [sync])

  // The title-bar button shows "read" or "edit" to match, wherever the switch came from.
  useEffect(() => {
    postMessage({ type: 'readingMode', reading })
  }, [reading])

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
              reading={reading}
              onChange={handleSourceChange}
            />
          ) : null}
        </div>
      </section>

      <StatusBar
        status={reading ? 'Reading' : 'Live Preview'}
        hint={`Click or press ${/Mac/u.test(navigator.platform) ? '⌘E' : 'Ctrl+E'} to switch between editing and reading`}
        onStatusClick={() => setReading((current) => !current)}
        words={words}
        characters={characters}
      />
    </main>
  )
}
