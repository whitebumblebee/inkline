<p align="center">
  <img src="media/logo.png" width="96" alt="Inkline logo">
</p>

# Inkline

Inkline turns a Markdown file in VS Code into something that reads like a page.
Headings look like headings, tables are tables, checkboxes tick. When you click
into a line, its Markdown comes back so you can edit it, then steps aside again
when you move on.

Your file stays plain Markdown the whole time. Inkline doesn't convert it,
reformat it or add anything to it, so it works as usual with Git, other
editors and anything else that reads Markdown.

## Getting started

Install **Inkline** from the Extensions view, then open any `.md` file and
click the Inkline icon at the top right of the editor. The same file reopens
in Inkline.

To go back to the plain text editor, open the Command Palette and run
**Inkline: Reopen in Native Markdown Editor**.

VS Code keeps opening Markdown in its usual editor until you choose otherwise.
To have every Markdown file open in Inkline, add this to your settings:

```json
"workbench.editorAssociations": {
  "*.md": "inkline.markdownEditor"
}
```

## What you can write

**Text.** Headings, bold, italic, strikethrough, `==highlights==`, inline code
and links. Links open with **⌘-click** (**Ctrl-click** on Windows and Linux) or
the small arrow after them. `[[Wikilinks]]` and footnotes are styled too.

**Lists and checklists.** Press **Enter** to continue a list, and **Enter** on
an empty item to end it. **Tab** and **Shift+Tab** indent and outdent, and a
numbered item you outdent picks up the next number in the list above it. Task
items show a checkbox you can click. Done items are struck through.

**Tables.** Tables are drawn as real tables, with column alignment and inline
formatting. Click a row to edit its source, and click away to see the table
again.

**Code.** Fenced code blocks are highlighted for JavaScript, TypeScript,
Python, Go, Rust, Java, C and C++, PHP, SQL, HTML, CSS, JSON, YAML, XML and
Markdown. Anything you write inside a code block stays as code.

**Math.** `$inline$` and `$$block$$` formulas are rendered with KaTeX. Click a
formula to edit it.

**Callouts.** GitHub and Obsidian style callouts, like `> [!NOTE]`,
`> [!TIP]` and `> [!WARNING]`, get a colour and an icon. Put your own title
after the marker if you want one.

**Images.** Images in your workspace show inline. Run **Inkline: Insert Image**
to pick one: Inkline copies it into an `.inkline-assets` folder in your
workspace and writes the link for you. Images from the web show as their
Markdown link, not a preview.

**Everything else.** Blockquotes, horizontal rules, `<!-- comments -->` and
`%% comments %%` are all handled, and YAML frontmatter at the top of a file is
set apart as a small metadata block.

## Shortcuts

| | macOS | Windows and Linux |
|---|---|---|
| Bold | ⌘B | Ctrl+B |
| Italic | ⌘I | Ctrl+I |
| Inline code | ⌘\` | Ctrl+\` |
| Highlight | ⌘⇧8 | Ctrl+Shift+8 |
| Comment | ⌘/ | Ctrl+/ |
| Indent / outdent a list item | Tab / ⇧Tab | Tab / Shift+Tab |

Undo, redo and save work the way they do everywhere else in VS Code.

## Your file, always

Inkline edits the same document VS Code does. Saving, the unsaved-changes dot,
**Revert File** and Git all behave normally. If the file changes on disk while
it's open (a `git pull`, another editor), Inkline shows the new contents and
keeps your cursor where it was. Undo only goes through your own edits, so it
never undoes a change that came from outside.

Inkline is only an editor. It doesn't have Obsidian's graph, backlinks or
plugins.

## Settings

| Setting | Default | What it does |
|---|---|---|
| `inkline.assetsDirectory` | `.inkline-assets` | Where **Insert Image** copies images, relative to the workspace |

## Installing

Inkline is on the
[VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=shishirjha.inkline)
and on [Open VSX](https://open-vsx.org/extension/shishirjha/inkline), which is
where editors like VSCodium and Antigravity get their extensions.

Each [release on GitHub](https://github.com/whitebumblebee/inkline/releases)
also has a `.vsix` file, for any editor that can install one:

```bash
code --install-extension inkline-<version>.vsix
```

## Building from source

You'll need Node.js 22 or newer.

```bash
npm install
npm run verify
```

`npm run verify` type-checks, lints, runs the tests and builds. To work on the
editor itself, `npm run dev` opens it in a browser with a sample document. To
run the whole extension, open this folder in VS Code and press **F5**.

To build a `.vsix` and install it:

```bash
npm run package
code --install-extension inkline-<version>.vsix
```

## Feedback

Found a bug or missing something you use every day?
[Open an issue](https://github.com/whitebumblebee/inkline/issues).

## License

MIT. See [LICENSE](LICENSE).
