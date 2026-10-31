import { DEFAULT_THEME, findTheme, paletteVariables, type Appearance } from '../../src/themes'

/**
 * Light or dark. "auto" follows VS Code, which marks the webview's body with
 * `vscode-light` (or `vscode-high-contrast-light`) for light colour themes;
 * outside VS Code - the browser demo - it follows the system.
 */
export function resolveMode(appearance: Appearance, body: Element, prefersLight: boolean): 'light' | 'dark' {
  if (appearance !== 'auto') return appearance
  const classes = body.classList
  if (classes.contains('vscode-light') || classes.contains('vscode-high-contrast-light')) return 'light'
  if (classes.contains('vscode-dark') || classes.contains('vscode-high-contrast')) return 'dark'
  return prefersLight ? 'light' : 'dark'
}

let current: { theme: string; appearance: Appearance } = { theme: DEFAULT_THEME, appearance: 'auto' }
/** The body whose `vscode-light` / `vscode-dark` class is being watched. */
let watchedBody: HTMLElement | null = null

/** Sets the theme's colours on the page, now and whenever VS Code switches between light and dark. */
export function applyTheme(theme: string, appearance: Appearance): void {
  current = { theme, appearance }
  const root = document.documentElement
  const prefersLight = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: light)').matches
  const mode = resolveMode(appearance, document.body, prefersLight)
  for (const [name, value] of Object.entries(paletteVariables(findTheme(theme)[mode]))) root.style.setProperty(name, value)
  root.style.colorScheme = mode
  root.dataset.mode = mode
  root.dataset.theme = findTheme(theme).id
  if (watchedBody === document.body) return
  const firstWatch = watchedBody === null
  watchedBody = document.body
  new MutationObserver(() => applyTheme(current.theme, current.appearance)).observe(document.body, { attributes: true, attributeFilter: ['class'] })
  if (firstWatch) window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', () => applyTheme(current.theme, current.appearance))
}
