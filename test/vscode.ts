import * as path from 'node:path'

export class Uri {
  readonly fsPath: string
  readonly scheme = 'file'
  constructor(fsPath: string) { this.fsPath = path.normalize(fsPath) }
  static file(fsPath: string): Uri { return new Uri(fsPath) }
  static joinPath(base: Uri, ...segments: string[]): Uri { return new Uri(path.join(base.fsPath, ...segments)) }
  toString(): string { return `file://${this.fsPath}` }
}

export class Position {
  constructor(readonly line: number, readonly character: number) {}
}

export class Range {
  readonly start: Position
  readonly end: Position
  /** Mirrors the real API, which takes either two Positions or four numbers. */
  constructor(start: Position | number, end: Position | number, endLine?: number, endCharacter?: number) {
    if (typeof start === 'number') {
      this.start = new Position(start, end as number)
      this.end = new Position(endLine ?? 0, endCharacter ?? 0)
    } else {
      this.start = start
      this.end = end as Position
    }
  }
}

export enum EndOfLine {
  LF = 1,
  CRLF = 2,
}

export class TextDocument {
  readonly eol = EndOfLine.LF
  constructor(
    readonly uri: Uri,
    readonly version: number,
    private readonly text: string,
  ) {}
  positionAt(offset: number): Position {
    const before = this.text.slice(0, offset).split('\n')
    return new Position(before.length - 1, before[before.length - 1].length)
  }
  get lineCount(): number { return this.text.split('\\n').length }
  lineAt(line: number): { text: string } { return { text: this.text.split('\\n')[line] ?? '' } }
  getText(): string { return this.text }
}

export class WorkspaceEdit {
  /** Recorded so tests can assert on the shape of an edit, not just that one happened. */
  readonly edits: { uri: unknown; range: unknown; text: string }[] = []
  replace(uri: unknown, range: unknown, text: string): void { this.edits.push({ uri, range, text }) }
  insert(uri: unknown, position: unknown, text: string): void { this.edits.push({ uri, range: position, text }) }
}

export const window = {
  showErrorMessage: () => undefined,
  showOpenDialog: () => Promise.resolve(undefined),
}

export const workspace = {
  getWorkspaceFolder: () => undefined,
  getConfiguration: () => ({ get: <T>(_key: string, fallback: T) => fallback }),
  applyEdit: () => Promise.resolve(true),
  openTextDocument: (uri: Uri) => Promise.resolve(new TextDocument(uri, 2, 'After')),
  save: () => Promise.resolve(Uri.file('/workspace/essay.md')),
  fs: {
    copy: () => Promise.resolve(),
    createDirectory: () => Promise.resolve(),
  },
}

export const commands = {
  executeCommand: () => Promise.resolve(),
}

export const UriPath = path
