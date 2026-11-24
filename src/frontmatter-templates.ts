export interface FrontmatterTemplate {
  id: string
  label: string
  detail: string
  /** The properties, in order; `title` and `date` are filled in. */
  properties: [key: string, value: 'title' | 'date' | string][]
}

export const FRONTMATTER_TEMPLATES: readonly FrontmatterTemplate[] = [
  {
    id: 'blog',
    label: 'Blog post',
    detail: 'title, description, date, tags, draft',
    properties: [['title', 'title'], ['description', '""'], ['date', 'date'], ['tags', '[]'], ['draft', 'false']],
  },
  {
    id: 'note',
    label: 'Note',
    detail: 'title, date, tags',
    properties: [['title', 'title'], ['date', 'date'], ['tags', '[]']],
  },
  {
    id: 'docs',
    label: 'Documentation page',
    detail: 'title, description, sidebar_position',
    properties: [['title', 'title'], ['description', '""'], ['sidebar_position', '1']],
  },
  {
    id: 'task',
    label: 'Task or plan',
    detail: 'title, status, owner, due',
    properties: [['title', 'title'], ['status', 'todo'], ['owner', '""'], ['due', 'date']],
  },
  {
    id: 'minimal',
    label: 'Just a title',
    detail: 'title',
    properties: [['title', 'title']],
  },
]

/** A YAML value for any text: plain when it is safe, quoted otherwise. */
export function yamlString(text: string): string {
  if (text !== '' && /^[\p{L}\p{N}][\p{L}\p{N} .,'()!?&/-]*$/u.test(text) && !/^(?:true|false|null|yes|no|~)$/iu.test(text) && !/^\d/u.test(text)) {
    return text
  }
  return JSON.stringify(text)
}

/** The file's title: its first `# Heading`, or else its file name in words. */
export function titleFor(markdown: string, fileName: string): string {
  const heading = /^#\s+(.+?)\s*#*\s*$/mu.exec(markdown)?.[1]
  if (heading) return heading.replace(/[*_`]/gu, '').trim()
  const base = fileName.replace(/\.[^.]+$/u, '').replace(/[-_]+/gu, ' ').trim()
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : 'Untitled'
}

/** Today as YYYY-MM-DD, in local time. */
export function today(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** The frontmatter block for a template, ending with a newline. */
export function buildFrontmatter(template: FrontmatterTemplate, title: string, date: string): string {
  const lines = template.properties.map(([key, value]) => {
    if (value === 'title') return `${key}: ${yamlString(title)}`
    if (value === 'date') return `${key}: ${date}`
    return `${key}: ${value}`
  })
  return ['---', ...lines, '---', ''].join('\n')
}

/** Whether a file already starts with frontmatter. */
export function hasFrontmatter(markdown: string): boolean {
  return /^---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/u.test(markdown)
}

/** The text to put at the top of a file: the block, and a blank line before any content. */
export function frontmatterInsert(markdown: string, block: string): string {
  if (markdown.trim() === '') return block
  return /^\r?\n/u.test(markdown) ? block : `${block}\n`
}
