import { EditorSelection } from '@codemirror/state'
import { toggleComment } from '@codemirror/commands'
import type { EditorView, Command } from '@codemirror/view'
import { applySourceCommand, type SourceCommand } from './markdown-editing'

export function runSourceCommand(view: EditorView, command: SourceCommand): boolean {
  const result = view.state.changeByRange((range) => {
    const edit = applySourceCommand(
      {
        value: view.state.sliceDoc(range.from, range.to),
        start: 0,
        end: range.to - range.from,
      },
      command,
    )
    const anchor = range.anchor === range.from ? edit.start : edit.end
    const head = range.head === range.from ? edit.start : edit.end
    return {
      changes: { from: range.from, to: range.to, insert: edit.value },
      range: EditorSelection.range(range.from + anchor, range.from + head),
    }
  })
  view.dispatch(result)
  view.focus()
  return true
}

export const toggleMarkdownComment: Command = (view) => {
  const target = {
    state: view.state,
    dispatch: view.dispatch,
  }
  return toggleComment(target)
}

export function createSourceCommand(command: SourceCommand): Command {
  return (view) => runSourceCommand(view, command)
}
