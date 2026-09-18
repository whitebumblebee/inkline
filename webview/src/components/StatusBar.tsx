interface StatusBarProps {
  status: string
  words: number
  characters: number
}

export function StatusBar({ status, words, characters }: StatusBarProps) {
  return (
    <footer className="status-bar">
      <div className="status-copy" role="status" aria-live="polite">{status}</div>
      <div className="document-stats" aria-label={`${words} words, ${characters} characters`}>
        <span>{words.toLocaleString()} words</span>
        <span aria-hidden="true">·</span>
        <span>{characters.toLocaleString()} characters</span>
      </div>
    </footer>
  )
}
