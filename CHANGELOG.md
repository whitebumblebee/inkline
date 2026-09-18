# Changelog

All notable changes to Inkline are documented here. This project follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Obsidian-style Live Preview for Markdown, backed by a source-first CodeMirror 6
  editor. The document on disk stays canonical; the webview never rewrites it.
- Tables render as real tables with column alignment, inline formatting and
  `<br>` line breaks. Clicking a row returns it to editable source.
- Inline previews for workspace images, with the Markdown source restored as soon
  as the caret enters the line. Remote URLs are never fetched.
- YAML frontmatter is recognised and set apart as metadata rather than parsed as
  Markdown.
- Setext headings (`Title` over `===`) alongside ATX headings.
- Horizontal rules are drawn as dividers instead of shown as `---`.
- WikiLinks (`[[slug|alias]]`) and Obsidian / GitHub callouts
  (`> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`).
- Real-time KaTeX styling for inline (`$...$`) and block (`$$...$$`) math.
- Smart list editing: `Enter` continues lists, task lists and quotes and ends an
  empty item; `Tab` indents and starts a `1.` sub-list; `Shift+Tab` outdents and
  renumbers.
- The editor takes focus when a note opens, so a note is ready to type into. A
  note restored into a background tab waits until that tab is shown.

### Fixed

- Clicks now land exactly where they are pressed. Margins on editor lines were
  invisible to CodeMirror's height map, so every line below a code block was
  drawn lower than CodeMirror believed it was, accumulating down the document.
- Concealed Markdown syntax no longer derails click resolution. A zero-width box
  still reports a rect, which broke the search CodeMirror runs over a line, so
  clicks past the first concealed marker collapsed onto it.
- Mouse drag selection keeps its direction, and vertical cursor movement keeps
  its goal column.
- Saving during the editor's debounce window no longer writes a stale revision
  and leaves the document dirty.
- An external change to the file no longer enters the editor's undo history, and
  undo cannot reach VS Code's own undo stack from inside Inkline - so undo can
  no longer revert someone else's edit to the file.
- An external change no longer resets the cursor to the top of the document.
  Both sides now apply only the span that changed.
- Markdown written inside a fenced or inline code block is left as code rather
  than styled as markup.
- Line endings are preserved: the editor works in `\n` and the document keeps
  the endings it had.

### Changed

- Focus / Zen mode has been removed. It rearranged the whole IDE and broke down
  in narrow layouts.
- Character count includes whitespace.
