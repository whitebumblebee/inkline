import { defaultKeymap, history, historyKeymap, indentLess, indentMore, redo, undo } from '@codemirror/commands'
import { closeBracketsKeymap } from '@codemirror/autocomplete'
import { deleteMarkupBackward, insertNewlineContinueMarkup } from '@codemirror/lang-markdown'
import { syntaxTree } from '@codemirror/language'
import { Prec, type Extension } from '@codemirror/state'
import { keymap, type Command } from '@codemirror/view'
import type { SyntaxNode } from '@lezer/common'
import { indentMarkdownLine, outdentMarkdownLine } from './markdown-editing'
import { createSourceCommand, toggleMarkdownComment } from './editor-commands'

const enterCodeBlockCommand: Command = (view) => {
  const { from, to } = view.state.selection.main
  if (from !== to) return false

  const line = view.state.doc.lineAt(from)
  const node = syntaxTree(view.state).resolveInner(from, -1)
  if (!node) return false
  let fence: { from: number; to: number } | null = null
  let current: SyntaxNode | null = node
  while (current) {
    if (current.name === 'FencedCode') {
      fence = { from: current.from, to: current.to }
      break
    }
    current = current.parent
  }
  if (!fence) return false

  const lineText = line.text
  const closingFence = /^\s*(`{3,}|~{3,})\s*$/u.test(lineText) && line.from >= fence.from && line.to <= fence.to
  if (closingFence) {
    const insert = line.to < view.state.doc.length ? '\n' : '\n\n'
    const position = line.to + insert.length
    view.dispatch({ changes: { from: line.to, insert }, selection: { anchor: position } })
    return true
  }

  const indentation = lineText.match(/^(\s*)/u)?.[1] ?? ''
  view.dispatch({
    changes: { from, to, insert: `\n${indentation}` },
    selection: { anchor: from + indentation.length + 1 },
  })
  return true
}

const enterListCommand: Command = (view) => {
  const { state } = view
  const { from, to } = state.selection.main
  if (from !== to) return false

  const line = state.doc.lineAt(from)
  const cursorInLine = from - line.from
  const beforeCursor = line.text.slice(0, cursorInLine)

  // 1. Empty ordered list item
  const emptyOrdered = line.text.match(/^(\s*)(\d+)([.)])\s*$/)
  if (emptyOrdered) {
    const indentLen = emptyOrdered[1].length
    if (indentLen >= 3) {
      const newIndent = emptyOrdered[1].slice(3)
      const prevText = line.number > 1 ? state.doc.line(line.number - 1).text : undefined
      let targetNum = 1
      if (prevText) {
        const prevNumMatch = prevText.match(/^(\s*)(\d+)[.)](?:\s+|$)/)
        if (prevNumMatch && prevNumMatch[1].length === newIndent.length) {
          targetNum = Number(prevNumMatch[2]) + 1
        }
      }
      const newText = `${newIndent}${targetNum}${emptyOrdered[3]} `
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: newText },
        selection: { anchor: line.from + newText.length },
      })
      return true
    } else if (indentLen > 0) {
      const newText = `1${emptyOrdered[3]} `
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: newText },
        selection: { anchor: line.from + newText.length },
      })
      return true
    } else {
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: '' },
        selection: { anchor: line.from },
      })
      return true
    }
  }

  // 2. Empty bullet item (or empty task item)
  const emptyBullet = line.text.match(/^(\s*)([-*+])(?:\s+\[[ xX]\])?\s*$/)
  if (emptyBullet) {
    const indentLen = emptyBullet[1].length
    if (indentLen >= 2) {
      const newIndent = emptyBullet[1].slice(2)
      const newText = `${newIndent}${emptyBullet[2]} `
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: newText },
        selection: { anchor: line.from + newText.length },
      })
      return true
    } else {
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: '' },
        selection: { anchor: line.from },
      })
      return true
    }
  }

  // 3. Task list item
  const taskMatch = beforeCursor.match(/^(\s*)([-*+])\s+\[[ xX]\]\s*(.*)$/)
  if (taskMatch) {
    const insert = `\n${taskMatch[1]}${taskMatch[2]} [ ] `
    const newPos = from + insert.length
    view.dispatch({
      changes: { from, to: from, insert },
      selection: { anchor: newPos },
    })
    return true
  }

  // 4. Bullet list item
  const bulletMatch = beforeCursor.match(/^(\s*)([-*+])\s+(.*)$/)
  if (bulletMatch) {
    const insert = `\n${bulletMatch[1]}${bulletMatch[2]} `
    const newPos = from + insert.length
    view.dispatch({
      changes: { from, to: from, insert },
      selection: { anchor: newPos },
    })
    return true
  }

  // 5. Ordered list item
  const numMatch = beforeCursor.match(/^(\s*)(\d+)([.)])\s+(.*)$/)
  if (numMatch) {
    const nextNum = Number(numMatch[2]) + 1
    const insert = `\n${numMatch[1]}${nextNum}${numMatch[3]} `
    const newPos = from + insert.length
    view.dispatch({
      changes: { from, to: from, insert },
      selection: { anchor: newPos },
    })
    return true
  }

  return false
}

const indentListCommand: Command = (view) => {
  const { state } = view
  const { from, to } = state.selection.main
  const startLine = state.doc.lineAt(from)
  const endLine = state.doc.lineAt(to)

  if (startLine.number === endLine.number) {
    const newText = indentMarkdownLine(startLine.text)
    if (newText !== null) {
      const diff = newText.length - startLine.text.length
      const newPos = Math.max(startLine.from, from + diff)
      view.dispatch({
        changes: { from: startLine.from, to: startLine.to, insert: newText },
        selection: { anchor: newPos },
      })
      return true
    }
    return indentMore(view)
  }

  const changes: { from: number; to: number; insert: string }[] = []
  let anyList = false
  for (let l = startLine.number; l <= endLine.number; l++) {
    const line = state.doc.line(l)
    const newText = indentMarkdownLine(line.text)
    if (newText !== null) {
      anyList = true
      changes.push({ from: line.from, to: line.to, insert: newText })
    }
  }
  if (anyList && changes.length > 0) {
    view.dispatch({ changes })
    return true
  }

  return indentMore(view)
}

const outdentListCommand: Command = (view) => {
  const { state } = view
  const { from, to } = state.selection.main
  const startLine = state.doc.lineAt(from)
  const endLine = state.doc.lineAt(to)

  if (startLine.number === endLine.number) {
    const prevText = startLine.number > 1 ? state.doc.line(startLine.number - 1).text : undefined
    const newText = outdentMarkdownLine(startLine.text, prevText)
    if (newText !== null) {
      const diff = newText.length - startLine.text.length
      const newPos = Math.max(startLine.from, from + diff)
      view.dispatch({
        changes: { from: startLine.from, to: startLine.to, insert: newText },
        selection: { anchor: newPos },
      })
      return true
    }
    return indentLess(view)
  }

  const changes: { from: number; to: number; insert: string }[] = []
  let anyList = false
  for (let l = startLine.number; l <= endLine.number; l++) {
    const line = state.doc.line(l)
    const prevText = l > 1 ? state.doc.line(l - 1).text : undefined
    const newText = outdentMarkdownLine(line.text, prevText)
    if (newText !== null) {
      anyList = true
      changes.push({ from: line.from, to: line.to, insert: newText })
    }
  }
  if (anyList && changes.length > 0) {
    view.dispatch({ changes })
    return true
  }

  return indentLess(view)
}

/**
 * `markdown({ addKeymap: true })` installs its own Enter and Backspace bindings,
 * and language extensions are ordered ahead of this one - so without raising the
 * precedence the built-ins win and the list handling below never runs for the
 * cases they also claim (notably an empty list item that still has its trailing
 * space, which is exactly what pressing Enter on a list produces).
 */
export const inklineKeymap: Extension = [
  // The undo bindings below are only meaningful with the history field present,
  // so they travel together.
  history(),
  Prec.highest(keymap.of([
    { key: 'Enter', run: (view) => enterCodeBlockCommand(view) || enterListCommand(view) || insertNewlineContinueMarkup({ state: view.state, dispatch: view.dispatch }) },
    { key: 'Backspace', run: (view) => deleteMarkupBackward({ state: view.state, dispatch: view.dispatch }) },
    { key: 'Tab', run: indentListCommand },
    { key: 'Shift-Tab', run: outdentListCommand },
    { key: 'Mod-b', run: createSourceCommand('bold') },
    { key: 'Mod-i', run: createSourceCommand('italic') },
    { key: 'Mod-`', run: createSourceCommand('code') },
    { key: 'Mod-Shift-8', run: createSourceCommand('highlight') },
    { key: 'Mod-/', run: toggleMarkdownComment },
    // Always claim undo/redo, even with nothing left on the stack. The default
    // bindings report "not handled" when the history is empty, and VS Code
    // routes undo specially inside a webview - so the keystroke would reach the
    // workbench, whose own undo can revert an external change to the file and,
    // once that syncs back, write the revert to disk.
    { key: 'Mod-z', run: (view) => { undo(view); return true }, preventDefault: true },
    { key: 'Mod-Shift-z', run: (view) => { redo(view); return true }, preventDefault: true },
    { key: 'Mod-y', run: (view) => { redo(view); return true }, preventDefault: true },
  ])),
  keymap.of([
    ...closeBracketsKeymap,
    ...historyKeymap,
    ...defaultKeymap,
  ]),
]
