import { type LucideIcon, Monitor, Moon, Sun } from 'lucide-react'
import { type KeyboardEvent, type ReactElement, type RefObject, useRef } from 'react'
import { type Theme, useTheme } from '../hooks/use-theme.js'
import './theme-switch.css'

const OPTIONS: readonly { value: Theme; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

const NEXT_KEYS: Readonly<Record<string, number>> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
}

interface ThemeOptionProps {
  index: number
  checked: boolean
  buttons: RefObject<(HTMLButtonElement | null)[]>
  onChoose: (index: number) => void
}

/** One radio: the chosen one is the group's single tab stop */
function ThemeOption({ index, checked, buttons, onChoose }: ThemeOptionProps): ReactElement | null {
  const option = OPTIONS[index]
  if (!option) return null
  const Icon = option.icon

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    const step = NEXT_KEYS[event.key]
    if (step === undefined) return
    event.preventDefault()
    onChoose((index + step + OPTIONS.length) % OPTIONS.length)
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: the APG radio group pattern, one tab stop with arrow keys
    <button
      ref={(element) => {
        buttons.current[index] = element
      }}
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={option.label}
      title={option.label}
      tabIndex={checked ? 0 : -1}
      className="theme-switch-option"
      onClick={() => onChoose(index)}
      onKeyDown={handleKeyDown}
    >
      <Icon aria-hidden="true" />
    </button>
  )
}

/** Light, dark or system: a radio group, one tab stop, arrow keys move the choice */
export function ThemeSwitch({
  vertical = false,
}: {
  vertical?: boolean | undefined
}): ReactElement {
  const { theme, setTheme } = useTheme()
  const buttons = useRef<(HTMLButtonElement | null)[]>([])

  function choose(index: number): void {
    const option = OPTIONS[index]
    if (!option) return
    setTheme(option.value)
    buttons.current[index]?.focus()
  }

  return (
    <div
      className="theme-switch"
      role="radiogroup"
      aria-label="Theme"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      data-vertical={vertical}
    >
      {OPTIONS.map((option, index) => (
        <ThemeOption
          key={option.value}
          index={index}
          checked={theme === option.value}
          buttons={buttons}
          onChoose={choose}
        />
      ))}
    </div>
  )
}
