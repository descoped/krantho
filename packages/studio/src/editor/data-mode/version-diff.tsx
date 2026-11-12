import { X } from 'lucide-react'
import { lazy, type ReactElement, Suspense, useEffect, useId, useRef, useState } from 'react'
import type { VersionInfo } from '../../lib/api-types.js'
import { Button, IconButton } from '../../ui/button.js'
import { DataNote } from './data-card.js'

const ReactDiffViewer = lazy(() => import('react-diff-viewer-continued'))

/** Two versions side by side: two saved ones, or a saved one against the form's work */
export interface Comparison {
  base: VersionInfo
  /** The newer side */
  compare: VersionInfo
  /** The newer side is the form, not a saved version */
  form: boolean
}

type DiffPart = 'fields' | 'metadata' | 'body'

/** Whether Studio shows the dark theme now: chosen, or followed from the system */
function darkTheme(): boolean {
  const chosen = document.documentElement.getAttribute('data-theme')
  if (chosen === 'dark') return true
  if (chosen === 'light') return false
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

/**
 * Whether Studio shows the dark theme, kept current while the diff is open: a
 * theme switch changes `data-theme` on <html>, and with "system" the OS can change
 */
function useDarkTheme(): boolean {
  const [dark, setDark] = useState(darkTheme)
  useEffect(() => {
    const update = (): void => setDark(darkTheme())
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    media?.addEventListener('change', update)
    return () => {
      observer.disconnect()
      media?.removeEventListener('change', update)
    }
  }, [])
  return dark
}

function sideTitle(version: VersionInfo, form: boolean): string {
  return form ? 'Your form' : `v${version.version}`
}

/** A two-way choice as pressed buttons: fields or body, unified or side by side */
function Toggle({
  pressed,
  onPress,
  children,
}: {
  pressed: boolean
  onPress: () => void
  children: string
}): ReactElement {
  return (
    <Button
      size="sm"
      variant={pressed ? 'secondary' : 'ghost'}
      aria-pressed={pressed}
      onClick={onPress}
    >
      {children}
    </Button>
  )
}

interface DiffView {
  part: DiffPart
  split: boolean
}

/** Fields or body, unified or Split, and Close */
function DiffControls({
  view,
  onView,
  onClose,
}: {
  view: DiffView
  onView: (view: DiffView) => void
  onClose: () => void
}): ReactElement {
  return (
    <div className="data-diff-controls">
      <Toggle pressed={view.part === 'fields'} onPress={() => onView({ ...view, part: 'fields' })}>
        Fields
      </Toggle>
      <Toggle
        pressed={view.part === 'metadata'}
        onPress={() => onView({ ...view, part: 'metadata' })}
      >
        Details
      </Toggle>
      <Toggle pressed={view.part === 'body'} onPress={() => onView({ ...view, part: 'body' })}>
        Body
      </Toggle>
      <Toggle pressed={view.split} onPress={() => onView({ ...view, split: !view.split })}>
        Split
      </Toggle>
      <IconButton icon={X} label="Close the diff" size="sm" onClick={onClose} />
    </div>
  )
}

/**
 * The difference of two versions: their fields or their body, unified or
 * side by side (Split). Its heading takes focus whenever a comparison opens;
 * Close hands focus back to the caller.
 */
export function VersionDiff({
  comparison,
  onClose,
}: {
  comparison: Comparison
  onClose: () => void
}): ReactElement {
  const [view, setView] = useState<DiffView>({ part: 'fields', split: false })
  const dark = useDarkTheme()
  const titleId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const { base, compare, form } = comparison
  // biome-ignore lint/correctness/useExhaustiveDependencies: each new comparison takes focus
  useEffect(() => headingRef.current?.focus(), [comparison])
  const text = (version: VersionInfo): string =>
    view.part === 'body'
      ? version.body
      : JSON.stringify(view.part === 'fields' ? version.fields : version.metadata, null, 2)
  return (
    <section className="data-diff" aria-labelledby={titleId}>
      <div className="data-diff-head">
        <h3 id={titleId} ref={headingRef} tabIndex={-1} className="data-diff-title">
          v{base.version} → {sideTitle(compare, form)}
        </h3>
        <DiffControls view={view} onView={setView} onClose={onClose} />
      </div>
      <Suspense fallback={<DataNote>Loading the diff…</DataNote>}>
        <div className="data-diff-body">
          <ReactDiffViewer
            oldValue={text(base)}
            newValue={text(compare)}
            splitView={view.split}
            useDarkTheme={dark}
            leftTitle={`v${base.version}`}
            rightTitle={sideTitle(compare, form)}
          />
        </div>
      </Suspense>
    </section>
  )
}
