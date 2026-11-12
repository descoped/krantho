// The krantho mark: a lowercase k drawn as a small content graph. The hub node —
// the document — sits where stem, arm and leg meet; the outer nodes are what it
// becomes (a page, its structured data, its place in the site). Strokes use
// currentColor, the hub the accent, so the mark follows either theme.

export function Mark({ size = 28, title }: { size?: number; title?: string }): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className="brand-mark"
    >
      <g stroke="currentColor" strokeWidth="2.25" strokeLinecap="round">
        <path d="M9 4.5v23" />
        <path d="M9 17.5 23 7" />
        <path d="M14.5 13.4 23.5 27" />
      </g>
      <g fill="currentColor">
        <circle cx="9" cy="4.5" r="2.6" />
        <circle cx="9" cy="27.5" r="2.6" />
        <circle cx="23" cy="7" r="2.6" />
        <circle cx="23.5" cy="27" r="2.6" />
      </g>
      <circle cx="9" cy="17.5" r="3.6" fill="var(--color-accent)" />
    </svg>
  )
}

export function Wordmark({ size = 28 }: { size?: number }): React.ReactElement {
  return (
    <span className="wordmark">
      <Mark size={size} />
      <span className="wordmark__text">krantho</span>
    </span>
  )
}
