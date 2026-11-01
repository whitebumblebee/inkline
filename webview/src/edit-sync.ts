import type { WebviewToHostMessage } from './protocol'

/**
 * Sends the writer's edits to VS Code: after a short pause in typing, and at
 * once when the window loses focus or a save is about to run.
 *
 * Two rules keep this from ever writing anything but an edit:
 * - nothing is sent before the file has been loaded into the editor, and
 * - nothing is sent unless the writer changed something since the last send.
 * Without them, a blur or a save while a reopened tab was still loading sent
 * the editor's empty starting text, and the file was emptied.
 */
export class EditSync {
  private loaded = false
  private dirty = false
  private text = ''
  private version = 0
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(
    private readonly send: (message: WebviewToHostMessage) => void,
    private readonly delay = 300,
  ) {}

  /** The file as VS Code gave it to the editor. */
  load(text: string, version: number): void {
    this.cancel()
    this.loaded = true
    this.dirty = false
    this.text = text
    this.version = version
  }

  /** The file changed outside the editor; the editor now shows this text. */
  external(text: string, version: number): void {
    this.text = text
    this.version = version
  }

  /** VS Code is at this version, including our last edit. */
  synced(version: number): void {
    this.version = version
  }

  /** The writer changed the text. */
  edit(text: string): void {
    if (!this.loaded || text === this.text) return
    this.text = text
    this.dirty = true
    this.cancel()
    this.timer = setTimeout(() => this.flush(), this.delay)
  }

  /** Sends a waiting edit now, if there is one. */
  flush(): void {
    this.cancel()
    if (!this.loaded || !this.dirty) return
    this.dirty = false
    this.send({ type: 'replaceDocument', baseVersion: this.version, markdown: this.text })
  }

  private cancel(): void {
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
  }
}
