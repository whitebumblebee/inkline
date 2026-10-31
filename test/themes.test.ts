import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { THEMES, findTheme, paletteVariables, type Palette } from '../src/themes'
import { applyTheme, resolveMode } from '../webview/src/apply-theme'
import { installDom } from './editor-test-utils'

const cleanups: Array<() => void> = []

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
})

/** WCAG contrast ratio between two `#rrggbb` colours. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const value = Number.parseInt(hex.slice(1), 16)
    return [value >> 16, (value >> 8) & 255, value & 255]
      .map((channel) => {
        const c = channel / 255
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      })
      .reduce((sum, c, index) => sum + c * [0.2126, 0.7152, 0.0722][index], 0)
  }
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

const palettes = THEMES.flatMap((theme) => (['dark', 'light'] as const).map((mode) => ({ name: `${theme.id} ${mode}`, palette: theme[mode] })))

describe('every theme is readable', () => {
  // Body text meets WCAG AAA; everything read as text meets at least AA.
  it.each(palettes)('$name', ({ palette }: { palette: Palette }) => {
    expect(contrast(palette.text, palette.bg)).toBeGreaterThanOrEqual(7)
    expect(contrast(palette.text, palette.panel)).toBeGreaterThanOrEqual(7)
    expect(contrast(palette.muted, palette.bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(palette.subtle, palette.bg)).toBeGreaterThanOrEqual(3)
    expect(contrast(palette.accent, palette.bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(palette.accentStrong, palette.bg)).toBeGreaterThanOrEqual(4.5)
    for (const colour of Object.values(palette.code)) expect(contrast(colour, palette.panel)).toBeGreaterThanOrEqual(4.5)
    for (const colour of Object.values(palette.callout)) expect(contrast(colour, palette.bg)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('themes', () => {
  it('all set the same colours', () => {
    const names = Object.keys(paletteVariables(THEMES[0].dark)).sort()
    for (const { palette } of palettes) expect(Object.keys(paletteVariables(palette)).sort()).toEqual(names)
  })

  it('match the choices in the settings', () => {
    const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
    const setting = manifest.contributes.configuration.properties['inkline.theme']
    expect(setting.enum).toEqual(THEMES.map((theme) => theme.id))
    expect(setting.enumItemLabels).toEqual(THEMES.map((theme) => theme.name))
    expect(setting.enumDescriptions).toEqual(THEMES.map((theme) => theme.description))
    expect(setting.default).toBe('ink')
  })

  it('fall back to Ink for an unknown name', () => {
    expect(findTheme('no-such-theme').id).toBe('ink')
  })
})

describe('light or dark', () => {
  function body(...classes: string[]): Element {
    const element = document.createElement('body')
    element.classList.add(...classes)
    return element
  }

  it('follows VS Code, high-contrast themes included', () => {
    cleanups.push(installDom())
    expect(resolveMode('auto', body('vscode-light'), false)).toBe('light')
    expect(resolveMode('auto', body('vscode-high-contrast-light'), false)).toBe('light')
    expect(resolveMode('auto', body('vscode-dark'), true)).toBe('dark')
    expect(resolveMode('auto', body('vscode-high-contrast'), true)).toBe('dark')
  })

  it('follows the system outside VS Code, and the setting when it is fixed', () => {
    cleanups.push(installDom())
    expect(resolveMode('auto', body(), true)).toBe('light')
    expect(resolveMode('auto', body(), false)).toBe('dark')
    expect(resolveMode('dark', body('vscode-light'), true)).toBe('dark')
    expect(resolveMode('light', body('vscode-dark'), false)).toBe('light')
  })

  it('puts the theme’s colours on the page', () => {
    cleanups.push(installDom())
    document.body.classList.add('vscode-light')
    applyTheme('fjord', 'auto')
    const root = document.documentElement
    expect(root.dataset.mode).toBe('light')
    expect(root.style.getPropertyValue('--inkline-bg')).toBe(findTheme('fjord').light.bg)
    expect(root.style.getPropertyValue('--inkline-code-keyword')).toBe(findTheme('fjord').light.code.keyword)
    applyTheme('fjord', 'dark')
    expect(root.style.getPropertyValue('--inkline-bg')).toBe(findTheme('fjord').dark.bg)
  })

  it('switches when VS Code changes between a light and a dark theme', async () => {
    cleanups.push(installDom())
    document.body.className = 'vscode-dark'
    applyTheme('paper', 'auto')
    expect(document.documentElement.dataset.mode).toBe('dark')
    document.body.className = 'vscode-light'
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(document.documentElement.dataset.mode).toBe('light')
    expect(document.documentElement.style.getPropertyValue('--inkline-bg')).toBe(findTheme('paper').light.bg)
  })
})
