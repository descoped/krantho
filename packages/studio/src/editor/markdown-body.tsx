import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { type ReactElement, type SyntheticEvent, useEffect, useId, useState } from 'react'

/** The rendered body, sanitized; empty while it renders */
function useRendered(markdown: string, active: boolean): string {
  const [html, setHtml] = useState('')
  useEffect(() => {
    if (!active) return
    let current = true
    Promise.resolve(marked.parse(markdown))
      .then((rendered) => {
        if (current) setHtml(DOMPurify.sanitize(rendered))
      })
      .catch(() => {
        if (current) setHtml('')
      })
    return () => {
      current = false
    }
  }, [markdown, active])
  return html
}

export interface MarkdownBodyProps {
  value: string
  onChange: (value: string) => void
  /** Another user holds the lock, or the role cannot edit */
  disabled: boolean
  /** Where the caret sits in the body, as it moves: the side panel shows its section */
  onCaret?: ((body: string, caret: number) => void) | undefined
}

/**
 * The textarea's events that place its caret, reported with the body they
 * move in: focus, a click, and a selection change — which fires only when the
 * caret actually moves, so Esc or Tab never report it again
 */
function caretEvents(
  onCaret: MarkdownBodyProps['onCaret'],
): Partial<
  Record<'onSelect' | 'onClick' | 'onFocus', (event: SyntheticEvent<HTMLTextAreaElement>) => void>
> {
  if (!onCaret) return {}
  const report = (event: SyntheticEvent<HTMLTextAreaElement>): void => {
    const area = event.currentTarget
    onCaret(area.value, area.selectionStart)
  }
  return { onSelect: report, onClick: report, onFocus: report }
}

/** How the body shows: the markdown alone, beside its rendering (Split), or rendered alone (Preview) */
type BodyView = 'write' | 'split' | 'preview'

/** A pressed toggle for one view; pressing it again returns to the markdown alone */
function ViewToggle({
  view,
  own,
  label,
  onView,
}: {
  view: BodyView
  own: BodyView
  label: string
  onView: (view: BodyView) => void
}): ReactElement {
  const pressed = view === own
  return (
    <button
      type="button"
      className="editor-body-toggle"
      aria-pressed={pressed}
      onClick={() => onView(pressed ? 'write' : own)}
    >
      {label}
    </button>
  )
}

/** The body's heading, its markdown hint and the Split and Preview toggles */
function BodyHead({
  headingId,
  hintId,
  view,
  onView,
}: {
  headingId: string
  hintId: string
  view: BodyView
  onView: (view: BodyView) => void
}): ReactElement {
  return (
    <div className="editor-body-head">
      <h2 id={headingId} className="editor-body-title">
        Body
      </h2>
      <span id={hintId} className="editor-body-hint">
        markdown · <code>##</code> headings become sections
      </span>
      <span className="editor-body-views">
        <ViewToggle view={view} own="split" label="Split" onView={onView} />
        <ViewToggle view={view} own="preview" label="Preview" onView={onView} />
      </span>
    </div>
  )
}

/** The rendered body, sanitized by DOMPurify */
function Rendered({ html }: { html: string }): ReactElement {
  return (
    <div className="editor-body-preview">
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized by DOMPurify */}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}

/** The markdown itself: a monospace textarea that reports its caret */
function BodyTextarea({
  headingId,
  hintId,
  props,
}: {
  headingId: string
  hintId: string
  props: MarkdownBodyProps
}): ReactElement {
  const { value, onChange, disabled, onCaret } = props
  return (
    <textarea
      className="editor-body-textarea"
      aria-labelledby={headingId}
      aria-describedby={hintId}
      value={value}
      rows={20}
      spellCheck={false}
      disabled={disabled}
      {...caretEvents(onCaret)}
      onChange={(event) => {
        onChange(event.target.value)
        onCaret?.(event.target.value, event.target.selectionStart)
      }}
    />
  )
}

/**
 * The document's body: one markdown document whose `##` headings are its
 * sections. Split shows the markdown beside its rendering, Preview the
 * rendering alone, as the site's markdown renders it.
 */
export function MarkdownBody(props: MarkdownBodyProps): ReactElement {
  const [view, setView] = useState<BodyView>('write')
  const html = useRendered(props.value, view !== 'write')
  const headingId = useId()
  const hintId = useId()
  const panes =
    view === 'split' ? 'editor-body-panes editor-body-panes--split' : 'editor-body-panes'
  return (
    <section className="editor-body" aria-labelledby={headingId}>
      <BodyHead headingId={headingId} hintId={hintId} view={view} onView={setView} />
      <div className={panes}>
        {view !== 'preview' && <BodyTextarea headingId={headingId} hintId={hintId} props={props} />}
        {view !== 'write' && <Rendered html={html} />}
      </div>
    </section>
  )
}
