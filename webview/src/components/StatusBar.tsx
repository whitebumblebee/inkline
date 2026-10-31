interface StatusBarProps {
  status: string
  /** Shown on hover over the status. */
  hint?: string
  /** When given, the status is a button that does this. */
  onStatusClick?: () => void
  words: number
  characters: number
}

export function StatusBar({ status, hint, onStatusClick, words, characters }: StatusBarProps) {
  return (
    <footer className="status-bar">
      {onStatusClick ? (
        <button type="button" className="status-copy status-button" title={hint} aria-live="polite" onClick={onStatusClick}>{status}</button>
      ) : (
        <div className="status-copy" role="status" aria-live="polite" title={hint}>{status}</div>
      )}
      <div className="document-stats" aria-label={`${words} words, ${characters} characters`}>
        <span>{words.toLocaleString()} words</span>
        <span aria-hidden="true">·</span>
        <span>{characters.toLocaleString()} characters</span>
      </div>
    </footer>
  )
}
