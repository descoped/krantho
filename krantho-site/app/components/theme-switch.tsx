// System / Light / Dark. Server-rendered: the active choice is shown by CSS from
// data-theme on <html> — to assistive technology too, as generated text in the
// option's name (shell.css) — and clicks are handled by <Interactions/>, so the
// control is correct on a cached page before any JavaScript runs.

const CHOICES = [
  {
    value: 'system',
    label: 'System theme',
    icon: (
      <>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
      </>
    ),
  },
  {
    value: 'light',
    label: 'Light theme',
    icon: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ),
  },
  {
    value: 'dark',
    label: 'Dark theme',
    icon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />,
  },
] as const

export function ThemeSwitch(): React.ReactElement {
  return (
    <div className="theme-switch" role="group" aria-label="Theme">
      {CHOICES.map((choice) => (
        <button
          key={choice.value}
          type="button"
          className="theme-switch__option"
          data-theme-choice={choice.value}
          title={choice.label}
        >
          <span className="visually-hidden">{choice.label}</span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {choice.icon}
          </svg>
        </button>
      ))}
    </div>
  )
}
