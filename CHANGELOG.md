# Changelog

All notable changes to Inkline are documented here. This project follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
