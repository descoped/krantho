import type { Editor } from '@milkdown/core'
import { editorViewCtx } from '@milkdown/core'
import { redoCommand, undoCommand } from '@milkdown/plugin-history'
import {
  toggleEmphasisCommand,
  toggleLinkCommand,
  toggleStrongCommand,
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from '@milkdown/preset-commonmark'
import { toggleStrikethroughCommand } from '@milkdown/preset-gfm'
import { callCommand } from '@milkdown/utils'
import {
  Bold,
  Italic,
  Link,
  List,
  ListOrdered,
  Quote,
  Redo,
  Strikethrough,
  Undo,
} from 'lucide-react'
import type { ReactElement, RefObject } from 'react'
import { Button, IconButton } from '../ui/button.js'
import type { Formatting } from './live-markdown-formatting.js'
import type { TableContext } from './live-table-tools.js'

type Run = (action: (editor: Editor) => void) => void

/** The formatting a section's toolbar offers, each pressed when the selection has it */
function formattingButtons(formatting: Formatting, setLink: (href: string) => void) {
  return [
    {
      icon: Bold,
      label: 'Bold',
      pressed: formatting.bold,
      action: (editor: Editor) => editor.action(callCommand(toggleStrongCommand.key)),
    },
    {
      icon: Italic,
      label: 'Italic',
      pressed: formatting.italic,
      action: (editor: Editor) => editor.action(callCommand(toggleEmphasisCommand.key)),
    },
    {
      icon: Strikethrough,
      label: 'Strikethrough',
      pressed: formatting.strike,
      action: (editor: Editor) => editor.action(callCommand(toggleStrikethroughCommand.key)),
    },
    {
      icon: List,
      label: 'Bullet list',
      block: true,
      pressed: formatting.bullet,
      action: (editor: Editor) => editor.action(callCommand(wrapInBulletListCommand.key)),
    },
    {
      icon: ListOrdered,
      label: 'Numbered list',
      block: true,
      pressed: formatting.ordered,
      action: (editor: Editor) => editor.action(callCommand(wrapInOrderedListCommand.key)),
    },
    {
      icon: Quote,
      label: 'Quote',
      block: true,
      pressed: formatting.quote,
      action: (editor: Editor) => editor.action(callCommand(wrapInBlockquoteCommand.key)),
    },
    {
      icon: Link,
      label: 'Link',
      pressed: formatting.link,
      action: (editor: Editor) => {
        const href = editor.action((ctx) => {
          const view = ctx.get(editorViewCtx)
          const mark = view.state.selection.$from.marks().find((mark) => mark.type.name === 'link')
          return typeof mark?.attrs.href === 'string' ? mark.attrs.href : ''
        })
        setLink(href)
      },
    },
    {
      icon: Undo,
      label: 'Undo',
      action: (editor: Editor) => editor.action(callCommand(undoCommand.key)),
    },
    {
      icon: Redo,
      label: 'Redo',
      action: (editor: Editor) => editor.action(callCommand(redoCommand.key)),
    },
  ]
}

/** Text style and formatting buttons; block formats stay off inside a table */
export function FormattingToolbar(props: {
  formatting: Formatting
  table: TableContext | null
  ready: boolean
  run: Run
  setLink: (href: string) => void
}): ReactElement {
  const { formatting, table, ready, run } = props
  const buttons = formattingButtons(formatting, props.setLink)
  return (
    <div
      className="live-context-actions live-formatting"
      role="toolbar"
      aria-label="Text formatting"
    >
      <select
        aria-label="Text style"
        disabled={!ready || table !== null}
        title={
          table
            ? 'Table cells support text formatting; headings belong outside the table.'
            : undefined
        }
        value={formatting.style}
        onChange={(event) => {
          const level = Number(event.target.value)
          run((editor) =>
            editor.action(
              level === 0
                ? callCommand(turnIntoTextCommand.key)
                : callCommand(wrapInHeadingCommand.key, level),
            ),
          )
        }}
      >
        {formatting.style === 'mixed' && (
          <option value="mixed" disabled>
            Mixed styles
          </option>
        )}
        {!['0', '3', '4', 'mixed'].includes(formatting.style) && (
          <option value={formatting.style} disabled>
            {/^\d$/.test(formatting.style) ? `Heading ${formatting.style}` : 'Code block'}
          </option>
        )}
        <option value="0">Paragraph</option>
        <option value="3">Heading</option>
        <option value="4">Subheading</option>
      </select>
      {buttons.map((button) => {
        const { icon, label, action } = button
        return (
          <IconButton
            key={label}
            icon={icon}
            label={label}
            size="sm"
            disabled={!ready || (table !== null && 'block' in button)}
            aria-pressed={'pressed' in button ? button.pressed : undefined}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => run(action)}
          />
        )
      })}
    </div>
  )
}

/** The link URL of the selection, applied as a link mark */
export function LinkForm(props: {
  link: string
  input: RefObject<HTMLInputElement | null>
  setLink: (link: string | null) => void
  run: Run
}): ReactElement {
  const { link, setLink, run } = props
  const linkInput = props.input
  return (
    <form
      className="live-link-form"
      onSubmit={(event) => {
        event.preventDefault()
        run((editor) => editor.action(callCommand(toggleLinkCommand.key, { href: link.trim() })))
        setLink(null)
      }}
    >
      <label>
        Link URL
        <input
          ref={linkInput}
          type="text"
          value={link}
          placeholder="https://…"
          onChange={(event) => setLink(event.target.value)}
        />
      </label>
      <Button size="sm" type="submit">
        Apply link
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setLink(null)
          run(() => undefined)
        }}
      >
        Back
      </Button>
    </form>
  )
}
