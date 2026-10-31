import { THEMES } from './themes'

export interface ThemeItem {
  id: string
  label: string
  description?: string
  detail?: string
}

/** The parts of VS Code's QuickPick the theme picker uses. */
export interface ThemePickerUi {
  title: string | undefined
  placeholder: string | undefined
  items: readonly ThemeItem[]
  activeItems: readonly ThemeItem[]
  readonly selectedItems: readonly ThemeItem[]
  onDidChangeActive(listener: (items: readonly ThemeItem[]) => void): unknown
  onDidAccept(listener: () => void): unknown
  onDidHide(listener: () => void): unknown
  show(): void
  hide(): void
  dispose(): void
}

/**
 * Lists the themes and previews each one as it is highlighted. Choosing one
 * saves it; closing the list without choosing puts back the saved theme.
 *
 * The chosen item is read from the highlighted one when `selectedItems` is
 * empty: Cursor leaves it empty on Enter, which once meant a choice showed on
 * screen but was never saved.
 */
export function runThemePicker(
  picker: ThemePickerUi,
  saved: string,
  preview: (theme: string) => void,
  save: (theme: string) => PromiseLike<unknown>,
): void {
  picker.title = 'Inkline Theme'
  picker.placeholder = 'Each theme has a light and a dark version, matched to VS Code'
  picker.items = THEMES.map((theme) => ({
    id: theme.id,
    label: theme.name,
    description: theme.id === saved ? 'current' : undefined,
    detail: theme.description,
  }))
  picker.activeItems = picker.items.filter((item) => item.id === saved)
  let chosen = false
  picker.onDidChangeActive(([item]) => {
    if (item) preview(item.id)
  })
  picker.onDidAccept(() => {
    const item = picker.selectedItems[0] ?? picker.activeItems[0]
    if (!item) return
    chosen = true
    picker.hide()
    void save(item.id)
  })
  picker.onDidHide(() => {
    if (!chosen) preview(saved)
    picker.dispose()
  })
  picker.show()
}
