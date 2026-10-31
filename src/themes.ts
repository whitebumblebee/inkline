/**
 * Inkline's themes. Each family has a dark and a light palette; which one shows
 * follows VS Code (light themes get the light palette) unless the appearance
 * setting fixes it. A test checks every palette for readable contrast.
 */

export interface Palette {
  /** Page, code blocks and raised surfaces. */
  bg: string
  panel: string
  raised: string
  /** Body text, secondary text, and the faintest text (comments, revealed syntax). */
  text: string
  muted: string
  subtle: string
  border: string
  /** Links and highlights. */
  accent: string
  accentStrong: string
  selection: string
  /** Code highlighting, read against `panel`. */
  code: {
    keyword: string
    string: string
    number: string
    function: string
    type: string
    operator: string
    tag: string
    attribute: string
    invalid: string
  }
  /** Callout colours; tip and note also colour merge-conflict bands. */
  callout: { note: string; tip: string; important: string; warning: string; caution: string }
}

export interface Theme {
  id: string
  name: string
  description: string
  dark: Palette
  light: Palette
}

export const THEMES: readonly Theme[] = [
  {
    id: 'ink',
    name: 'Ink',
    description: 'Warm charcoal and amber; parchment in light.',
    dark: {
      bg: '#141514', panel: '#1b1c1a', raised: '#242522',
      text: '#ece8df', muted: '#a3a69d', subtle: '#7b7f75', border: '#343632',
      accent: '#d4a55c', accentStrong: '#e8be72', selection: '#5a4a2a',
      code: { keyword: '#c792ea', string: '#c3e88d', number: '#f78c6c', function: '#82aaff', type: '#ffcb6b', operator: '#89ddff', tag: '#f07178', attribute: '#ffcb6b', invalid: '#ff5370' },
      callout: { note: '#58a6ff', tip: '#3fb950', important: '#a371f7', warning: '#d29922', caution: '#f85149' },
    },
    light: {
      bg: '#f6f3ec', panel: '#ece8df', raised: '#e4dfd3',
      text: '#1f211d', muted: '#5f635a', subtle: '#7f8278', border: '#d8d2c6',
      accent: '#8a5f20', accentStrong: '#6f4a12', selection: '#e2d3b3',
      code: { keyword: '#7e3fa8', string: '#476f1c', number: '#a3481a', function: '#2c5aa8', type: '#805400', operator: '#1b6a7a', tag: '#a8302f', attribute: '#805400', invalid: '#b4232a' },
      callout: { note: '#0b63c4', tip: '#1a7337', important: '#7a46d0', warning: '#8a5c00', caution: '#bf2330' },
    },
  },
  {
    id: 'paper',
    name: 'Paper',
    description: 'Sepia like an old book; easy on the eyes for long reading.',
    dark: {
      bg: '#1d1915', panel: '#25201a', raised: '#2e2820',
      text: '#ebdfca', muted: '#b3a690', subtle: '#877b67', border: '#3b3328',
      accent: '#d99a63', accentStrong: '#e8b483', selection: '#4d3c27',
      code: { keyword: '#d7a0c4', string: '#b0bd6e', number: '#e3a06a', function: '#94b8cc', type: '#dcae62', operator: '#a3c7b6', tag: '#e3866a', attribute: '#dcae62', invalid: '#ef7b6f' },
      callout: { note: '#94b8cc', tip: '#a7bd6c', important: '#d7a0c4', warning: '#dcae62', caution: '#ef7b6f' },
    },
    light: {
      bg: '#f4ecd8', panel: '#ece1c7', raised: '#e3d6b8',
      text: '#36291c', muted: '#64523c', subtle: '#86745b', border: '#d8c9a8',
      accent: '#93451f', accentStrong: '#77361a', selection: '#e5d1a2',
      code: { keyword: '#843968', string: '#4e6618', number: '#994b26', function: '#365f7c', type: '#7d5200', operator: '#33665a', tag: '#9e3427', attribute: '#7d5200', invalid: '#a9221a' },
      callout: { note: '#365f7c', tip: '#4f6c16', important: '#843968', warning: '#7d5200', caution: '#a9221a' },
    },
  },
  {
    id: 'fjord',
    name: 'Fjord',
    description: 'Cool blue-grey and frost, inspired by the north.',
    dark: {
      bg: '#232831', panel: '#2a303b', raised: '#323946',
      text: '#e5e9f0', muted: '#adb5c4', subtle: '#808a9d', border: '#3b4252',
      accent: '#88c0d0', accentStrong: '#a7d5e1', selection: '#3d4e66',
      code: { keyword: '#89a8cb', string: '#a3be8c', number: '#c09bbf', function: '#88c0d0', type: '#8fbcbb', operator: '#9fb4cc', tag: '#dc8a92', attribute: '#8fbcbb', invalid: '#e0828b' },
      callout: { note: '#88c0d0', tip: '#a3be8c', important: '#c09bbf', warning: '#ebcb8b', caution: '#e0828b' },
    },
    light: {
      bg: '#eceff4', panel: '#e3e8ef', raised: '#d9dfe8',
      text: '#242a35', muted: '#4f5868', subtle: '#727c8f', border: '#ccd3de',
      accent: '#2c6880', accentStrong: '#1f5163', selection: '#cad9ea',
      code: { keyword: '#43638f', string: '#46702f', number: '#7e4f80', function: '#2c6880', type: '#26706a', operator: '#43638f', tag: '#a33b46', attribute: '#26706a', invalid: '#a82a35' },
      callout: { note: '#2c6880', tip: '#46702f', important: '#7e4f80', warning: '#835c00', caution: '#a82a35' },
    },
  },
  {
    id: 'dusk',
    name: 'Dusk',
    description: 'Soft violet evening with rose accents; dawn pink in light.',
    dark: {
      bg: '#1f1d2b', panel: '#262335', raised: '#2e2a40',
      text: '#e8e3f4', muted: '#b0a9c8', subtle: '#827c9b', border: '#39344d',
      accent: '#eba0b8', accentStrong: '#f5bfce', selection: '#46395e',
      code: { keyword: '#c4a7e7', string: '#f3c27e', number: '#eba7a4', function: '#9ccfd8', type: '#e8b9b8', operator: '#a9a5c4', tag: '#ef7f9f', attribute: '#c4a7e7', invalid: '#f27a96' },
      callout: { note: '#9ccfd8', tip: '#8fcaa5', important: '#c4a7e7', warning: '#f3c27e', caution: '#f27a96' },
    },
    light: {
      bg: '#faf4ed', panel: '#f2e9e1', raised: '#eadfd4',
      text: '#2e293b', muted: '#5f5875', subtle: '#827c95', border: '#e0d5ca',
      accent: '#a24f68', accentStrong: '#853d53', selection: '#ecdbe4',
      code: { keyword: '#715a8a', string: '#8a5a0e', number: '#a24f68', function: '#215c73', type: '#8c4b55', operator: '#655f80', tag: '#a24f68', attribute: '#715a8a', invalid: '#b0304f' },
      callout: { note: '#215c73', tip: '#2f6e48', important: '#715a8a', warning: '#8a5a0e', caution: '#b0304f' },
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Deep evergreen and sage; morning mist in light.',
    dark: {
      bg: '#171c18', panel: '#1d241f', raised: '#252d27',
      text: '#e3e8df', muted: '#a8b2a4', subtle: '#7a8577', border: '#2f3a31',
      accent: '#96c486', accentStrong: '#b2d8a4', selection: '#34503a',
      code: { keyword: '#d699b6', string: '#a7c080', number: '#e69875', function: '#83c092', type: '#dbbc7f', operator: '#7fbbb3', tag: '#e67e80', attribute: '#dbbc7f', invalid: '#ef8486' },
      callout: { note: '#7fbbb3', tip: '#a7c080', important: '#d699b6', warning: '#dbbc7f', caution: '#ef8486' },
    },
    light: {
      bg: '#f2f4ee', panel: '#e8ece2', raised: '#dfe5d7',
      text: '#1f2a1f', muted: '#4f5c4d', subtle: '#717d6e', border: '#d0d9c7',
      accent: '#376d33', accentStrong: '#2a5527', selection: '#d4e4ca',
      code: { keyword: '#83527e', string: '#4f6b1c', number: '#9c4c24', function: '#276b4e', type: '#7a5e00', operator: '#346c67', tag: '#a33a37', attribute: '#7a5e00', invalid: '#a8302d' },
      callout: { note: '#346c67', tip: '#46691c', important: '#83527e', warning: '#7a5e00', caution: '#a8302d' },
    },
  },
  {
    id: 'mono',
    name: 'Mono',
    description: 'Greyscale and nothing else; maximum focus on the words.',
    dark: {
      bg: '#121212', panel: '#1a1a1a', raised: '#232323',
      text: '#ededed', muted: '#adadad', subtle: '#7e7e7e', border: '#333333',
      accent: '#e6e6e6', accentStrong: '#ffffff', selection: '#3d3d3d',
      code: { keyword: '#ffffff', string: '#c2c2c2', number: '#d9d9d9', function: '#e6e6e6', type: '#d0d0d0', operator: '#a6a6a6', tag: '#e6e6e6', attribute: '#c2c2c2', invalid: '#ff7b7b' },
      callout: { note: '#cfcfcf', tip: '#cfcfcf', important: '#cfcfcf', warning: '#cfcfcf', caution: '#ff7b7b' },
    },
    light: {
      bg: '#ffffff', panel: '#f4f4f4', raised: '#ebebeb',
      text: '#111111', muted: '#505050', subtle: '#737373', border: '#dcdcdc',
      accent: '#111111', accentStrong: '#000000', selection: '#d9d9d9',
      code: { keyword: '#000000', string: '#4a4a4a', number: '#333333', function: '#1f1f1f', type: '#383838', operator: '#5c5c5c', tag: '#1f1f1f', attribute: '#4a4a4a', invalid: '#c0262d' },
      callout: { note: '#3d3d3d', tip: '#3d3d3d', important: '#3d3d3d', warning: '#3d3d3d', caution: '#c0262d' },
    },
  },
]

export const DEFAULT_THEME = 'ink'

export type Appearance = 'auto' | 'light' | 'dark'

export function findTheme(id: string): Theme {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0]
}

/** The CSS custom properties a palette sets on the page. */
export function paletteVariables(palette: Palette): Record<string, string> {
  return {
    '--inkline-bg': palette.bg,
    '--inkline-panel': palette.panel,
    '--inkline-panel-raised': palette.raised,
    '--inkline-text': palette.text,
    '--inkline-muted': palette.muted,
    '--inkline-subtle': palette.subtle,
    '--inkline-border': palette.border,
    '--inkline-accent': palette.accent,
    '--inkline-accent-strong': palette.accentStrong,
    '--inkline-selection': palette.selection,
    ...Object.fromEntries(Object.entries(palette.code).map(([name, value]) => [`--inkline-code-${name}`, value])),
    ...Object.fromEntries(Object.entries(palette.callout).map(([name, value]) => [`--inkline-callout-${name}`, value])),
  }
}
