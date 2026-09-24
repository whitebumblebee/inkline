import { useEffect, useRef, useState } from 'react'
import { closeBrackets } from '@codemirror/autocomplete'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { bracketMatching, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language'
import { EditorState, Transaction } from '@codemirror/state'
import { EditorView, highlightActiveLine, placeholder } from '@codemirror/view'
import { postMessage } from '../protocol'
import { GFM } from '@lezer/markdown'
import { inklineKeymap } from './editor-keymap'
import { codeLanguages } from './code-languages'
import { markdownEditorTheme, markdownHighlight } from './markdown-highlight'
import { livePreview, refreshLivePreview } from './live-preview'
import { tablePreview } from './table-preview'
import { onImagesChanged } from './image-store'
import { diffRange } from '../../../src/text-diff'
import { normalizeMarkdown } from './serializer'
import 'katex/dist/katex.min.css'

interface SourceEditorProps {
  value: string
  onChange: (value: string) => void
}

export function SourceEditor({ value, onChange }: SourceEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const valueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  const [failed, setFailed] = useState(false)
  valueRef.current = value
  onChangeRef.current = onChange

  useEffect(() => {
    if (!hostRef.current || failed) return

    try {
      const view = new EditorView({
        parent: hostRef.current,
        state: EditorState.create({
          doc: valueRef.current,
          extensions: [
            highlightActiveLine(),
            indentOnInput(),
            indentUnit.of('  '),
            bracketMatching(),
            closeBrackets(),
            EditorView.lineWrapping,
            placeholder('Write in Markdown. Use $...$ or $$...$$ for LaTeX.'),
            markdown({
              base: markdownLanguage,
              codeLanguages,
              extensions: [GFM],
              addKeymap: true,
            }),
            syntaxHighlighting(markdownHighlight),
            livePreview,
            tablePreview,
            markdownEditorTheme,
            inklineKeymap,
            EditorView.updateListener.of((update) => {
              if (update.docChanged) onChangeRef.current(update.state.doc.toString())
            }),
            EditorView.domEventHandlers({
              click: (event, view) => {
                const target = event.target as HTMLElement | null
                if (!target) return false
                const linkIcon = target.closest('.inkline-live-link-icon') as HTMLElement | null
                const iconUrl = linkIcon?.dataset.url
                if (iconUrl) {
                  postMessage({ type: 'openLink', url: iconUrl })
                  return true
                }
                const position = view.posAtCoords({ x: event.clientX, y: event.clientY })
                if (position === null) return false
                const line = view.state.doc.lineAt(position)
                const taskOffset = line.text.search(/\[[ xX]\]/u)
                if (target.closest('.inkline-task-marker') && taskOffset >= 0 && position >= line.from + taskOffset && position <= line.from + taskOffset + 3) {
                  const markerFrom = line.from + taskOffset
                  view.dispatch({ changes: { from: markerFrom, to: markerFrom + 3, insert: line.text.slice(taskOffset, taskOffset + 3).toLowerCase() === '[x]' ? '[ ]' : '[x]' } })
                  return true
                }
                const link = line.text.match(/\[[^\]\n]+\]\(([^)\n]+)\)/u)
                if (event.metaKey || event.ctrlKey) {
                  if (link && position >= line.from && position <= line.to && view.state.selection.main.empty) {
                    postMessage({ type: 'openLink', url: link[1] })
                    return true
                  }
                }
                return false
              },
            }),
          ],
        }),
      })
      viewRef.current = view
      if (view.state.doc.toString() !== valueRef.current) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: valueRef.current },
        })
      }

      // Land the caret in the note so it is ready to type into on open. A
      // webview can be created before it is shown - and an editor restored into
      // a background tab must not take focus from the tab the writer is looking
      // at - so wait for this one to actually become visible.
      const focusWhenVisible = (): boolean => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false
        view.focus()
        return true
      }
      let onVisibilityChange: (() => void) | undefined
      if (!focusWhenVisible()) {
        onVisibilityChange = () => {
          if (focusWhenVisible()) {
            document.removeEventListener('visibilitychange', onVisibilityChange!)
            onVisibilityChange = undefined
          }
        }
        document.addEventListener('visibilitychange', onVisibilityChange)
      }

      return () => {
        if (onVisibilityChange) document.removeEventListener('visibilitychange', onVisibilityChange)
        view.destroy()
        viewRef.current = null
      }
    } catch (error) {
      console.error('Inkline Markdown editor failed to start', error)
      setFailed(true)
      return undefined
    }
  }, [failed])


  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    const next = normalizeMarkdown(value)
    if (current === next) return
    const span = diffRange(current, next)
    view.dispatch({
      changes: { from: span.from, to: span.to, insert: span.insert },
      annotations: Transaction.addToHistory.of(false),
    })
  }, [value])

  // A resolved image URI arrives after the decorations that asked for it.
  useEffect(() => onImagesChanged(() => {
    viewRef.current?.dispatch({ effects: refreshLivePreview.of(null) })
  }), [])

  if (failed) {
    return (
      <textarea
        className="source-fallback"
        autoFocus
        aria-label="Markdown source editor"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  }

  return <div ref={hostRef} className="source-editor" aria-label="Markdown contextual live preview editor" />
}
