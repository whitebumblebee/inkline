# Changelog

All notable changes to Inkline are documented here. This project follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-10-06

### Added

- Reading mode. **⌘E** (**Ctrl+E**) switches an Inkline tab between editing and
  reading. While reading, nothing reveals its Markdown, links open with a plain
  click, and the file cannot be changed - by typing, pasting, a checkbox or a
  conflict's buttons - though changes made elsewhere still show up. Inkline
  always opens files for editing.

## [0.2.0] - 2026-10-02

### Added

- HTML in Markdown files is drawn as HTML: a README's centred logo, `<details>`
  blocks, tables and links. Like tables, a block shows its source while the
  caret is in it. The HTML is rebuilt from a short allowlist, so scripts,
  styles and frames never run or load; a block holding only those stays as
  source. Images from the workspace show; remote images show their alt text.
- Inline `<kbd>`, `<sub>`, `<sup>`, `<mark>`, `<b>`, `<i>`, `<u>`, `<s>` and
  `<small>` are formatted, their tags hidden like `**` until the caret reaches them.

### Fixed

- A Markdown table inside a code block, such as an example of table syntax, is
  shown as code instead of being drawn as a table.
- `[[wikilinks]]` inside inline code or code blocks are no longer styled as links.
- A file that starts with an HTML block or a table opens with it drawn: the
  caret starts on the line after it instead of inside it.

## [0.1.3] - 2026-09-30

### Fixed

- Pressing **Enter** at the end of a quoted line no longer deletes its trailing
  spaces. Two trailing spaces are a hard line break, so removing them changed
  how the file renders while the editor looked the same.
- Accepting a merge conflict is always its own undo step, so one undo restores
  the markers exactly, even right after typing.
- Conflict markers inside a code block, such as an example in a guide to Git,
  are left as code instead of getting **Accept** buttons that would delete part
  of the example.

## [0.1.2] - 2026-09-29

### Added

- Find and replace: **⌘F** / **Ctrl+F** to find, **⌥⌘F** / **Ctrl+H** to
  replace. They search the Markdown source, so a replace also reaches text the
  preview hides, like a link's URL, and moving to a match reveals its Markdown.

### Fixed

- Merge conflicts are shown as plain source instead of being read as Markdown.
  Before, the `=======` line turned the text above it into a heading and
  `>>>>>>>` into nested quotes. Each conflict now has coloured bands for the
  current and incoming changes, and **Accept Current**, **Accept Incoming** and
  **Accept Both** above it.

## [0.1.1] - 2026-09-25

### Fixed

- Task list items show a single checkbox in place of `- [ ]`, ticked when the
  item is done. Clicking it toggles the item, and done items are struck through.
- Inline math no longer leaves a blank gap after the rendered formula.
- `$$` blocks written across several lines render as one formula instead of
  three bordered boxes. Click the formula to edit it.
- Callouts show their icon and title (`Tip`, `Warning`, or your own title)
  instead of an empty first line.
- List items use the normal text colour instead of the accent colour.
- Brackets in frontmatter, such as `tags: [a, b]`, are no longer styled as links.
- Clicking a hidden code fence line, a `>` spacer line in a quote, or a
  horizontal rule places the caret instead of doing nothing.

## [0.1.0] - 2026-09-24

Initial release.

### Added

- Obsidian-style Live Preview for Markdown files, built on a source-first
  CodeMirror 6 editor. Your file stays plain Markdown; Inkline never rewrites it.
- Tables render as real tables with column alignment, inline formatting and
  `<br>` line breaks. Click any row to edit its source.
- Inline previews for images in your workspace. Remote images are never fetched.
- YAML frontmatter shown as a distinct metadata block.
- Headings (ATX and Setext), bold, italic, strikethrough, highlights, inline
  code, links, task lists, blockquotes, footnotes, comments and horizontal rules.
- Fenced code blocks with syntax highlighting for 14 languages, including
  JavaScript, TypeScript, Python, Rust, Go and SQL.
- WikiLinks (`[[note|alias]]`) and Obsidian / GitHub callouts
  (`> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`).
- KaTeX math, inline (`$...$`) and block (`$$...$$`).
- List editing that works like Obsidian: Enter continues lists, task lists and
  quotes and ends an empty item; Tab and Shift+Tab indent and outdent.
- Precise cursor placement and mouse selection across every kind of block.
- Saving always writes what is on screen, even mid-keystroke.
- Undo only reverses your own edits — never a change made to the file outside
  Inkline.
- Line endings (LF or CRLF) are preserved.
- The editor is focused when a note opens, ready to type.
