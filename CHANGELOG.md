# Changelog

All notable changes to Inkline are documented here. This project follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
