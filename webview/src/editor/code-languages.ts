import { LanguageDescription } from '@codemirror/language'

/**
 * Languages highlighted inside fenced code blocks.
 *
 * Deliberately a hand-picked list rather than `@codemirror/language-data`. That
 * package covers every language CodeMirror supports, and because the webview is
 * bundled into a single file its lazy imports all get inlined - about 600 KB of
 * highlighters for languages nobody pastes into a note.
 *
 * A language that is not here still renders as a code block, just without
 * colour. Adding one is a line below plus its `@codemirror/lang-*` dependency.
 */
export const codeLanguages: LanguageDescription[] = [
  LanguageDescription.of({
    name: 'JavaScript',
    alias: ['js', 'jsx', 'ts', 'tsx', 'typescript', 'node'],
    extensions: ['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx'],
    load: () => import('@codemirror/lang-javascript').then((m) => m.javascript({ jsx: true, typescript: true })),
  }),
  LanguageDescription.of({
    name: 'Python',
    alias: ['py'],
    extensions: ['py'],
    load: () => import('@codemirror/lang-python').then((m) => m.python()),
  }),
  LanguageDescription.of({
    name: 'JSON',
    extensions: ['json'],
    load: () => import('@codemirror/lang-json').then((m) => m.json()),
  }),
  LanguageDescription.of({
    name: 'HTML',
    alias: ['htm'],
    extensions: ['html', 'htm'],
    load: () => import('@codemirror/lang-html').then((m) => m.html()),
  }),
  LanguageDescription.of({
    name: 'CSS',
    extensions: ['css'],
    load: () => import('@codemirror/lang-css').then((m) => m.css()),
  }),
  LanguageDescription.of({
    name: 'SQL',
    extensions: ['sql'],
    load: () => import('@codemirror/lang-sql').then((m) => m.sql()),
  }),
  LanguageDescription.of({
    name: 'Rust',
    alias: ['rs'],
    extensions: ['rs'],
    load: () => import('@codemirror/lang-rust').then((m) => m.rust()),
  }),
  LanguageDescription.of({
    name: 'Go',
    alias: ['golang'],
    extensions: ['go'],
    load: () => import('@codemirror/lang-go').then((m) => m.go()),
  }),
  LanguageDescription.of({
    name: 'Java',
    extensions: ['java'],
    load: () => import('@codemirror/lang-java').then((m) => m.java()),
  }),
  LanguageDescription.of({
    name: 'C++',
    alias: ['cpp', 'c', 'cc'],
    extensions: ['cpp', 'cc', 'c', 'h', 'hpp'],
    load: () => import('@codemirror/lang-cpp').then((m) => m.cpp()),
  }),
  LanguageDescription.of({
    name: 'YAML',
    alias: ['yml'],
    extensions: ['yaml', 'yml'],
    load: () => import('@codemirror/lang-yaml').then((m) => m.yaml()),
  }),
  LanguageDescription.of({
    name: 'XML',
    extensions: ['xml', 'svg'],
    load: () => import('@codemirror/lang-xml').then((m) => m.xml()),
  }),
  LanguageDescription.of({
    name: 'PHP',
    extensions: ['php'],
    load: () => import('@codemirror/lang-php').then((m) => m.php()),
  }),
  LanguageDescription.of({
    name: 'Markdown',
    alias: ['md'],
    extensions: ['md', 'markdown'],
    load: () => import('@codemirror/lang-markdown').then((m) => m.markdown({ base: m.markdownLanguage })),
  }),
]
