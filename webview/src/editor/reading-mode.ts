import { EditorState, StateEffect, StateField, Transaction, type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

/**
 * Reading mode: the page stays drawn wherever you click - no Markdown is
 * revealed, links open with a plain click - and nothing can change the file.
 * Inkline always opens in editing mode; ⌘E (Ctrl+E) switches.
 */
export const setReadingMode = StateEffect.define<boolean>()

const readingField = StateField.define<boolean>({
  create: () => false,
  update(value, transaction) {
    for (const effect of transaction.effects) if (effect.is(setReadingMode)) value = effect.value
    return value
  },
})

export function isReading(state: EditorState): boolean {
  return state.field(readingField, false) ?? false
}

/** Whether a transaction switches between reading and editing; previews redraw when it does. */
export function readingChanged(transaction: Transaction): boolean {
  return transaction.effects.some((effect) => effect.is(setReadingMode))
}

export const readingMode: Extension = [
  readingField,
  EditorView.editable.from(readingField, (reading) => !reading),
  EditorState.readOnly.from(readingField, (reading) => reading),
  EditorView.editorAttributes.from(readingField, (reading): Record<string, string> => (reading ? { class: 'inkline-reading' } : {})),
  // One guard for every way an edit could start - typing, paste, a checkbox,
  // a conflict's Accept button, a list shortcut. Changes that come from the
  // file itself are marked remote and still come through, so the page keeps
  // up with edits made elsewhere.
  EditorState.changeFilter.of((transaction) => !isReading(transaction.startState) || transaction.annotation(Transaction.remote) === true),
]
