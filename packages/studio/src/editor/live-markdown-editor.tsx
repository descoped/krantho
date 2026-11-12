import type { Editor } from '@milkdown/core'
import { editorViewCtx } from '@milkdown/core'
import type { EditorState } from '@milkdown/prose/state'
import { Check, X } from 'lucide-react'
import { type ReactElement, useEffect, useRef, useState } from 'react'
import { IconButton } from '../ui/button.js'
import { useMarkdownEngine } from './live-markdown-engine.js'
import { type Formatting, formattingOf } from './live-markdown-formatting.js'
import { FormattingToolbar, LinkForm } from './live-markdown-toolbar.js'
import {
  contentLabel,
  type InlineEditorProps,
  openSplice,
  useMeasuredSize,
  usePlacement,
} from './live-overlay.js'
import {
  runTableAction,
  type TableContext,
  TableTools,
  tableContextOf,
} from './live-table-tools.js'
import { spliceBody } from './side-panel/page-sections.js'

/** A section's visual Markdown editor lives in its page element; only its toolbar lives in Studio. */
export function LiveMarkdownEditor(props: InlineEditorProps): ReactElement {
  const [opened] = useState(() => openSplice(props.target, props.draft.body))
  const element = props.elements[0]
  const originalRenderings = useRef(
    new Map(props.elements.map((element) => [element, element.innerHTML])),
  )
  const [formatting, setFormatting] = useState<Formatting>({
    bold: false,
    italic: false,
    strike: false,
    link: false,
    bullet: false,
    ordered: false,
    quote: false,
    style: '0',
  })
  const [table, setTable] = useState<TableContext | null>(null)
  const followSelection = (state: EditorState): void => {
    const nextTable = tableContextOf(state)
    setTable((previous) =>
      JSON.stringify(previous) === JSON.stringify(nextTable) ? previous : nextTable,
    )
    const next = formattingOf(state)
    setFormatting((previous) =>
      Object.keys(next).every(
        (key) => previous[key as keyof Formatting] === next[key as keyof Formatting],
      )
        ? previous
        : next,
    )
  }
  const [link, setLink] = useState<string | null>(null)
  const linkInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (link !== null) linkInput.current?.focus()
  }, [link])
  const controls = useRef<HTMLFieldSetElement>(null)
  const at = usePlacement({ ...props, toolbar: true }, useMeasuredSize(controls))
  const { engine, text, changed, ready, error } = useMarkdownEngine(props, opened, followSelection)
  const run = (action: (editor: Editor) => void): void => {
    const editor = engine.current
    if (!editor) return
    action(editor)
    editor.action((ctx) => ctx.get(editorViewCtx).focus())
  }
  const cancel = (): void => {
    if (opened) {
      text.current = opened.text
      props.onBody(spliceBody(opened, opened.text))
      changed.current = false
      for (const [other, html] of originalRenderings.current) {
        if (other !== element) other.innerHTML = html
      }
    }
    props.onClose()
  }
  return (
    <fieldset
      ref={controls}
      className="live-context live-context--markdown"
      aria-label={`Editing ${contentLabel(props.target)}`}
      style={{ top: at.top, left: at.left, width: at.width ?? undefined }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          props.onClose()
        }
      }}
    >
      <strong>{contentLabel(props.target)}</strong>
      {table && ready && (
        <TableTools
          key={table.position}
          table={table}
          onAction={(action) => run((editor) => runTableAction(editor, action))}
        />
      )}
      {error ? (
        <span role="alert">{error}</span>
      ) : (
        <FormattingToolbar
          formatting={formatting}
          table={table}
          ready={ready}
          run={run}
          setLink={setLink}
        />
      )}
      {link !== null && <LinkForm link={link} input={linkInput} setLink={setLink} run={run} />}
      <div className="live-context-actions">
        <IconButton
          icon={X}
          label="Cancel this element’s edit"
          className="live-context-cancel"
          size="sm"
          onPointerDown={(event) => event.preventDefault()}
          onClick={cancel}
        />
        <IconButton
          icon={Check}
          label="Done editing"
          className="live-context-done"
          size="sm"
          onPointerDown={(event) => event.preventDefault()}
          onClick={props.onClose}
        />
      </div>
    </fieldset>
  )
}
