import { HighlightStyle } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

export const markdownHighlight = HighlightStyle.define([
  { tag: t.heading1, fontWeight: '700', fontFamily: 'var(--font-prose)', lineHeight: '1.3' },
  { tag: t.heading2, fontWeight: '700', fontFamily: 'var(--font-prose)', lineHeight: '1.35' },
  { tag: t.heading3, fontWeight: '600', fontFamily: 'var(--font-prose)', lineHeight: '1.4' },
  { tag: t.heading4, fontWeight: '600', fontFamily: 'var(--font-prose)' },
  { tag: t.heading5, fontWeight: '600' },
  { tag: t.heading6, fontWeight: '600' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through', color: 'var(--inkline-muted)' },
  { tag: t.link, color: 'var(--inkline-accent-strong)', textDecoration: 'underline', textUnderlineOffset: '3px' },
  { tag: t.url, color: 'var(--inkline-accent)' },
  { tag: t.quote, color: 'var(--inkline-muted)', fontStyle: 'italic' },
  { tag: t.monospace, fontFamily: 'var(--font-mono)', fontSize: '0.9em' },
  { tag: t.processingInstruction, color: 'var(--inkline-subtle)' },
  { tag: t.meta, color: 'var(--inkline-subtle)' },
  { tag: t.comment, color: 'var(--inkline-subtle)', fontStyle: 'italic' },
  { tag: t.keyword, color: '#c792ea' },
  { tag: t.string, color: '#c3e88d' },
  { tag: t.number, color: '#f78c6c' },
  { tag: t.bool, color: '#ffcb6b' },
  { tag: t.function(t.variableName), color: '#82aaff' },
  { tag: t.definition(t.variableName), color: '#82aaff' },
  { tag: t.typeName, color: '#ffcb6b' },
  { tag: t.className, color: '#ffcb6b' },
  { tag: t.propertyName, color: '#c3e88d' },
  { tag: t.operator, color: '#89ddff' },
  { tag: t.punctuation, color: 'var(--inkline-muted)' },
  { tag: t.invalid, color: '#ff5370' },
])

export const markdownEditorTheme = EditorView.theme({
  '&': {
    height: 'auto',
    minHeight: 'calc(100vh - 100px)',
    backgroundColor: 'transparent',
    color: 'var(--inkline-text)',
    fontSize: '16px',
  },
  '.cm-scroller': {
    overflow: 'visible',
    fontFamily: 'var(--font-writing)',
    lineHeight: '1.75',
    minHeight: 'calc(100vh - 100px)',
  },
  '.cm-content': {
    maxWidth: 'var(--inkline-measure)',
    margin: '0 auto',
    padding: '2.5rem 1.5rem 6rem',
    caretColor: 'var(--inkline-accent-strong)',
    color: 'var(--inkline-text)',
    minHeight: 'calc(100vh - 100px)',
  },
  '.cm-line': {
    padding: '0.12em 0',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--inkline-accent-strong)',
    borderLeftWidth: '2px',
  },
  '::selection': {
    backgroundColor: 'var(--inkline-selection) !important',
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in srgb, var(--inkline-accent) 7%, transparent)',
  },
  '.cm-matchingBracket': {
    backgroundColor: 'color-mix(in srgb, var(--inkline-accent) 22%, transparent)',
    outline: '1px solid var(--inkline-accent)',
  },
  '.cm-gutters': {
    display: 'none',
  },
})
