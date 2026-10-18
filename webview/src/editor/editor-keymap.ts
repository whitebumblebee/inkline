import { defaultKeymap, history, historyKeymap, indentLess, indentMore, redo, undo } from '@codemirror/commands'
import { closeBracketsKeymap } from '@codemirror/autocomplete'
import { deleteMarkupBackward, insertNewlineContinueMarkup } from '@codemirror/lang-markdown'
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import { openSearchPanel, search, searchKeymap } from '@codemirror/search'
import { ChangeSet, EditorSelection, Prec, type EditorState, type Extension } from '@codemirror/state'
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

/** The ordered-list items after the one at `pos`, with each marker's number and where it sits. */
function followingItems(state: EditorState, pos: number): { number: number; from: number; to: number }[] {
  const tree = ensureSyntaxTree(state, state.doc.length, 100) ?? syntaxTree(state)
  let item: SyntaxNode | null = tree.resolveInner(pos, -1)
  while (item && item.name !== 'ListItem') item = item.parent
  if (!item || item.parent?.name !== 'OrderedList') return []
  const items: { number: number; from: number; to: number }[] = []
  for (let next = item.nextSibling; next; next = next.nextSibling) {
    const mark = next.name === 'ListItem' ? next.getChild('ListMark') : null
    if (!mark) continue
    const digits = /^\d+/u.exec(state.doc.sliceString(mark.from, mark.to))?.[0]
    if (!digits) break
    items.push({ number: Number(digits), from: mark.from, to: mark.from + digits.length })
  }
  return items
}

/**
 * The number for an item inserted after item `current`, and the marker
 * changes that keep the list counting. Only items that continue the count are
 * renumbered, so a deliberate jump (1, 2, 10) is kept from the jump on, and a
 * list written all as `1.` stays that way - Markdown numbers those itself.
 */
export function insertOrderedItem(state: EditorState, pos: number, current: number): {
  number: number
  renumber: { from: number; to: number; insert: string }[]
} {
  const following = followingItems(state, pos)
  if (following[0]?.number === current) return { number: current, renumber: [] }
  const number = current + 1
  const renumber: { from: number; to: number; insert: string }[] = []
  let expected = number
  for (const item of following) {
    if (item.number !== expected) break
    expected += 1
    renumber.push({ from: item.from, to: item.to, insert: String(expected) })
  }
  return { number, renumber }
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
    // The new item takes the next number and the items after it move up, in
    // one edit, so a single undo puts the list back.
    const { number, renumber } = insertOrderedItem(state, from, Number(numMatch[2]))
    const insert = `\n${numMatch[1]}${number}${numMatch[3]} `
    const newPos = from + insert.length
    view.dispatch({
      changes: [{ from, to: from, insert }, ...renumber],
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
 * CodeMirror's markup continuation (used here for blockquotes) deletes the
 * whitespace before the cursor when it starts the next line. Two trailing
 * spaces are a hard line break in Markdown, so deleting them changes what the
 * file renders as, while the preview looks the same. Put back what it removed.
 */
const continueMarkupCommand: Command = (view) => {
  const { state } = view
  const cursor = state.selection.main
  const line = state.doc.lineAt(cursor.head)
  const before = line.text.slice(0, cursor.head - line.from)
  const trailing = state.selection.ranges.length === 1 && cursor.empty
    ? /[ \t]+$/u.exec(before)?.[0] ?? ''
    : ''
  // Only after text: the space that follows a bare `>` is markup, not a break.
  const afterText = /[^\s>]/u.test(before.slice(0, before.length - trailing.length))
  return insertNewlineContinueMarkup({
    state,
    dispatch: (transaction) => {
      let restoreAt: number | null = null
      transaction.changes.iterChanges((fromA, toA, fromB, _toB, inserted) => {
        const stripped = fromA === cursor.head - trailing.length && toA === cursor.head
        if (trailing && afterText && stripped && inserted.sliceString(0, state.lineBreak.length) === state.lineBreak) restoreAt = fromB
      })
      if (restoreAt === null) {
        view.dispatch(transaction)
        return
      }
      const restore = ChangeSet.of([{ from: restoreAt, insert: trailing }], transaction.newDoc.length)
      view.dispatch({
        changes: transaction.changes.compose(restore),
        selection: EditorSelection.cursor(transaction.newSelection.main.head + trailing.length),
        scrollIntoView: true,
        userEvent: 'input',
      })
    },
  })
}

/** Opens find and replace with the caret in the replace field, as VS Code's shortcut does. */
const openReplaceCommand: Command = (view) => {
  openSearchPanel(view)
  view.dom.querySelector<HTMLInputElement>('.cm-search input[name=replace]')?.select()
  return true
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
  // Find and replace work on the source text, so they also match syntax the
  // live preview hides; moving to a match reveals the Markdown around it.
  search({ top: true }),
  Prec.highest(keymap.of([
    { key: 'Enter', run: (view) => enterCodeBlockCommand(view) || enterListCommand(view) || continueMarkupCommand(view) },
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
    { key: 'Ctrl-h', mac: 'Mod-Alt-f', run: openReplaceCommand, preventDefault: true },
  ])),
  keymap.of([
    ...searchKeymap,
    ...closeBracketsKeymap,
    ...historyKeymap,
    ...defaultKeymap,
  ]),
]
