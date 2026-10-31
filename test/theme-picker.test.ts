import { describe, expect, it, vi } from 'vitest'
import { runThemePicker, type ThemeItem, type ThemePickerUi } from '../src/theme-picker'

/** A stand-in for VS Code's QuickPick; `selectedOnAccept` mimics editors that do or don't fill `selectedItems`. */
function fakePicker(selectedOnAccept: boolean) {
  const listeners = { active: [] as ((items: readonly ThemeItem[]) => void)[], accept: [] as (() => void)[], hide: [] as (() => void)[] }
  let selected: readonly ThemeItem[] = []
  const picker: ThemePickerUi & { highlight(id: string): void; pressEnter(): void; pressEscape(): void } = {
    title: undefined,
    placeholder: undefined,
    items: [],
    activeItems: [],
    get selectedItems() { return selected },
    onDidChangeActive: (listener) => listeners.active.push(listener),
    onDidAccept: (listener) => listeners.accept.push(listener),
    onDidHide: (listener) => listeners.hide.push(listener),
    show: () => undefined,
    hide: () => listeners.hide.forEach((listener) => listener()),
    dispose: () => undefined,
    highlight(id) {
      picker.activeItems = picker.items.filter((item) => item.id === id)
      listeners.active.forEach((listener) => listener(picker.activeItems))
    },
    pressEnter() {
      if (selectedOnAccept) selected = picker.activeItems
      listeners.accept.forEach((listener) => listener())
    },
    pressEscape() {
      picker.hide()
    },
  }
  return picker
}

describe('the theme picker', () => {
  for (const [editor, selectedOnAccept] of [['VS Code', true], ['Cursor', false]] as const) {
    it(`saves the chosen theme in ${editor}`, () => {
      const picker = fakePicker(selectedOnAccept)
      const preview = vi.fn()
      const save = vi.fn().mockResolvedValue(undefined)
      runThemePicker(picker, 'ink', preview, save)
      picker.highlight('paper')
      picker.pressEnter()
      expect(save).toHaveBeenCalledWith('paper')
      expect(preview).toHaveBeenLastCalledWith('paper')
    })
  }

  it('marks the saved theme as current and starts on it', () => {
    const picker = fakePicker(true)
    runThemePicker(picker, 'fjord', vi.fn(), vi.fn())
    expect(picker.items.filter((item) => item.description === 'current').map((item) => item.id)).toEqual(['fjord'])
    expect(picker.activeItems.map((item) => item.id)).toEqual(['fjord'])
  })

  it('puts the saved theme back when closed without choosing', () => {
    const picker = fakePicker(true)
    const preview = vi.fn()
    const save = vi.fn()
    runThemePicker(picker, 'ink', preview, save)
    picker.highlight('dusk')
    picker.pressEscape()
    expect(save).not.toHaveBeenCalled()
    expect(preview).toHaveBeenLastCalledWith('ink')
  })
})
