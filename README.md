# Inkline

Inkline is a focused Markdown editor for VS Code-compatible editors. It brings a calm, ergonomic writing surface into the editor while keeping the Markdown file as the source of truth.

The project is designed for VS Code, Cursor, and Kiro where the host supports the VS Code custom editor and webview APIs.

## What is here

- A custom editor for `.md` and `.markdown` files.
- Obsidian-style Live Preview backed by a source-first CodeMirror 6 editor.
- Exact cursor placement and native mouse-drag selection across every construct, including headings, fenced code, tables, and callouts.
- One source-preserving Live Preview editor with contextual Markdown syntax and selection-preserving edits.
- Source-preserving syntax styling for ATX and Setext headings, bold/italic/highlight, inline code, task lists, strikethrough, links, comments, footnotes, and blockquotes.
- Tables rendered as real tables with column alignment, inline formatting and `<br>` line breaks; click any row to edit its source. Horizontal rules are drawn as real dividers, and YAML frontmatter is set apart as metadata.
- Editable backtick and tilde fenced code blocks with language-specific styling and reliable Enter/exit behavior. Markdown written inside a code block is left as code, never styled as markup.
- Real-time KaTeX source styling for inline (`$...$`) and block (`$$...$$`) LaTeX formulas.
- First-class support for WikiLinks (`[[slug|alias]]`) and Obsidian / GitHub callout alerts (`> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`, etc.).
- Smart list editing: `Enter` continues lists, task lists and quotes and ends an empty item; `Tab` indents and starts a `1. ` sub-list; `Shift+Tab` outdents and renumbers sequentially.
- Native file save, dirty state, undo/redo, reload, and external-change behavior. Edits pending in the editor are handed over before a save, external changes keep your cursor where it was, and undo never reverts someone else's change to the file.
- Local image insertion into a workspace-relative `.inkline-assets` directory, with inline previews for workspace images.

Inkline is 100% Markdown-first. The workspace document remains canonical; the webview is an unobtrusive projection of it. No AST loss, no hidden round-trips.

# Development

Requirements: Node.js 22 or newer and npm.

```bash
npm install
npm run verify
npm run dev
```

`npm run dev` watches the webview bundle. Use the Extension Development Host in VS Code to launch the extension with the repository open.

Build and package a local extension:

```bash
npm run package
code --install-extension inkline-0.1.0.vsix
```

## Install

Inkline is on the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=shishirjha.inkline)
and on [Open VSX](https://open-vsx.org/extension/shishirjha/inkline) for Cursor,
Windsurf, VSCodium and Gitpod.

Every release also attaches a `.vsix` to its
[GitHub release](https://github.com/whitebumblebee/inkline/releases), which can
be installed directly:

```bash
code --install-extension inkline-0.1.0.vsix
```

## Use

Open a Markdown file, run **Inkline: Open in Inkline**, and choose Inkline when prompted. The custom editor is opt-in by default, so the native Markdown editor remains available.

Commands are available from the Command Palette:

- **Inkline: Open in Inkline**
- **Inkline: Insert Image**
- **Inkline: Reopen in Native Markdown Editor**

## Markdown fidelity

Inkline targets CommonMark, GFM, and the focused Markdown editing features people commonly use in Obsidian: ATX and Setext headings, emphasis, highlights, links, WikiLinks, callout blockquotes, images, nested lists, task lists, code blocks, thematic breaks, tables, comments, footnotes, math, and YAML frontmatter. Preview styling never removes source text from the focused editor, so unsupported or incomplete Markdown remains editable.

Inkline is an editor, not a full Obsidian application shell. Canvas, graph view, workspaces, backlinks, bookmarks, and community-plugin management are outside this extension’s scope.

Inkline will prefer showing a resynchronization state over overwriting newer file content or pretending unsupported syntax was preserved.

## Images

Images selected through Inkline are copied into the configured workspace-relative directory and inserted as relative Markdown paths. Change the directory with `inkline.assetsDirectory`. Workspace images are previewed inline, and the source returns for editing as soon as the cursor enters the line. The webview only receives approved workspace image URIs. Remote image URLs remain source-editable but are never fetched by the webview, so they show their Markdown source instead of a preview.

# Compatibility

VS Code compatibility is the first verification target. Cursor and Kiro compatibility will be advertised only after their current builds pass the custom editor, webview, save, external-change, and image smoke flows.

## License

Inkline is released under the MIT License. See the included `LICENSE` file.
