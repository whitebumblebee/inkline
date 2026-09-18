export function normalizeMarkdown(markdown: string): string {
  return markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

export function countWords(markdown: string): number {
  const text = markdown
    .replace(/^---[\s\S]*?---\s*/u, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/gu, ' $1 ')
    .replace(/https?:\/\/\S+/gu, ' ')
  return text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0
}

/** Characters as a reader counts them: whitespace included, frontmatter excluded. */
export function countCharacters(markdown: string): number {
  return markdown.replace(/^---[\s\S]*?---\s*/u, '').length
}
