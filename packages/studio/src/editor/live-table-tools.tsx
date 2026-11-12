import { type Editor, editorViewCtx } from '@milkdown/core'
import {
  addColAfterCommand,
  addColBeforeCommand,
  addRowAfterCommand,
  addRowBeforeCommand,
} from '@milkdown/preset-gfm'
import { type EditorState, TextSelection } from '@milkdown/prose/state'
import {
  deleteColumn,
  deleteRow,
  deleteTable,
  isInTable,
  selectedRect,
} from '@milkdown/prose/tables'
import type { EditorView } from '@milkdown/prose/view'
import { callCommand } from '@milkdown/utils'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Table2,
  Trash2,
} from 'lucide-react'
import { type ReactElement, useEffect, useId, useRef, useState } from 'react'
import { Button, IconButton } from '../ui/button.js'

export interface TableContext {
  position: number
  row: number
  lastRow: number
  column: number
  lastColumn: number
  canDeleteRow: boolean
  canDeleteColumn: boolean
  alignment: 'left' | 'center' | 'right' | 'mixed'
}

/** The selected cell rectangle; Markdown keeps one header and at least one content row. */
export function tableContextOf(state: EditorState): TableContext | null {
  if (!isInTable(state)) return null
  const rect = selectedRect(state)
  const alignments: unknown[] = []
  for (let col = rect.left; col < rect.right; col++) {
    alignments.push(rect.table.firstChild?.child(col).attrs.alignment ?? 'left')
  }
  const alignment = alignments[0]
  return {
    position: rect.tableStart,
    row: rect.top,
    lastRow: rect.bottom - 1,
    column: rect.left,
    lastColumn: rect.right - 1,
    canDeleteRow: rect.top > 0 && rect.map.height - (rect.bottom - rect.top) >= 2,
    canDeleteColumn: rect.map.width - (rect.right - rect.left) >= 1,
    alignment:
      alignments.every((value) => value === alignment) &&
      (alignment === 'left' || alignment === 'center' || alignment === 'right')
        ? alignment
        : 'mixed',
  }
}

export type TableAction =
  | 'row-before'
  | 'row-after'
  | 'column-before'
  | 'column-after'
  | 'delete-row'
  | 'delete-column'
  | 'delete-table'
  | 'left'
  | 'center'
  | 'right'

/** After insertion, typing starts in the new row or column at the same crossing. */
function focusCell(view: EditorView, row: number, column: number): void {
  if (!isInTable(view.state)) return
  const rect = selectedRect(view.state)
  const offset = rect.map.map[row * rect.map.width + column]
  if (offset === undefined) return
  const position = view.state.doc.resolve(rect.tableStart + offset + 1)
  view.dispatch(view.state.tr.setSelection(TextSelection.near(position)))
}

/** Use engine commands for structure, and one transaction for whole-column Markdown alignment. */
export function runTableAction(editor: Editor, action: TableAction): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const context = tableContextOf(view.state)
    if (!context) return
    switch (action) {
      case 'row-before':
        if (context.row > 0) {
          callCommand(addRowBeforeCommand.key)(ctx)
          focusCell(view, context.row, context.column)
        }
        break
      case 'row-after':
        callCommand(addRowAfterCommand.key)(ctx)
        focusCell(view, context.lastRow + 1, context.column)
        break
      case 'column-before':
        callCommand(addColBeforeCommand.key)(ctx)
        focusCell(view, context.row, context.column)
        break
      case 'column-after':
        callCommand(addColAfterCommand.key)(ctx)
        focusCell(view, context.row, context.lastColumn + 1)
        break
      case 'delete-row':
        if (context.canDeleteRow) deleteRow(view.state, view.dispatch)
        break
      case 'delete-column':
        if (context.canDeleteColumn) deleteColumn(view.state, view.dispatch)
        break
      case 'delete-table':
        deleteTable(view.state, view.dispatch)
        break
      default: {
        const { table, tableStart, left, right } = selectedRect(view.state)
        const transaction = view.state.tr
        table.forEach((row, rowOffset) => {
          row.forEach((cell, cellOffset, column) => {
            if (column >= left && column < right) {
              transaction.setNodeMarkup(tableStart + rowOffset + 1 + cellOffset, undefined, {
                ...cell.attrs,
                alignment: action,
              })
            }
          })
        })
        view.dispatch(transaction)
      }
    }
  })
}

/** A contextual disclosure: ordinary buttons and keyboard focus, without a second editor or menu framework. */
export function TableTools({
  table,
  onAction,
}: {
  table: TableContext
  onAction: (action: TableAction) => void
}): ReactElement {
  const [open, setOpen] = useState(false)
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLFieldSetElement>(null)
  useEffect(() => {
    if (open) panel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [open])
  const apply = (action: TableAction): void => {
    setOpen(false)
    onAction(action)
  }
  const range = (first: number, last: number): string =>
    first === last ? String(first + 1) : `${first + 1}–${last + 1}`
  return (
    <>
      <Button
        ref={trigger}
        className="live-table-trigger"
        size="sm"
        variant="ghost"
        icon={Table2}
        aria-expanded={open}
        aria-controls={id}
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            event.preventDefault()
            event.stopPropagation()
            setOpen(false)
          }
        }}
      >
        Table
        {open ? (
          <ChevronUp className="ui-button-icon" aria-hidden="true" />
        ) : (
          <ChevronDown className="ui-button-icon" aria-hidden="true" />
        )}
      </Button>
      {open && (
        <fieldset
          ref={panel}
          id={id}
          className="live-table-panel"
          aria-label="Table actions"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              setOpen(false)
              trigger.current?.focus()
            }
          }}
        >
          <fieldset className="live-table-group" aria-label="Row actions">
            <strong>
              {table.row === 0 && table.lastRow === 0
                ? 'Header row'
                : `Row ${range(table.row, table.lastRow)}`}
            </strong>
            <Button
              icon={ArrowUp}
              size="sm"
              variant="ghost"
              aria-label="Insert row above"
              disabled={table.row === 0}
              title={table.row === 0 ? 'The header stays first. Insert a row below it.' : undefined}
              onClick={() => apply('row-before')}
            >
              Above
            </Button>
            <Button
              icon={ArrowDown}
              size="sm"
              variant="ghost"
              aria-label="Insert row below"
              onClick={() => apply('row-after')}
            >
              Below
            </Button>
            <IconButton
              icon={Trash2}
              size="sm"
              label="Delete row"
              disabled={!table.canDeleteRow}
              title={
                !table.canDeleteRow
                  ? 'Keep the header and one content row. You can delete the whole table.'
                  : 'Delete row'
              }
              onClick={() => apply('delete-row')}
            />
          </fieldset>
          <fieldset className="live-table-group" aria-label="Column actions">
            <strong>Column {range(table.column, table.lastColumn)}</strong>
            <Button
              icon={ArrowLeft}
              size="sm"
              variant="ghost"
              aria-label="Insert column left"
              onClick={() => apply('column-before')}
            >
              Left
            </Button>
            <Button
              icon={ArrowRight}
              size="sm"
              variant="ghost"
              aria-label="Insert column right"
              onClick={() => apply('column-after')}
            >
              Right
            </Button>
            <IconButton
              icon={Trash2}
              size="sm"
              label="Delete column"
              disabled={!table.canDeleteColumn}
              title={
                !table.canDeleteColumn
                  ? 'Keep one column, or delete the whole table.'
                  : 'Delete column'
              }
              onClick={() => apply('delete-column')}
            />
          </fieldset>
          <fieldset className="live-table-group" aria-label="Column alignment">
            <strong>Align column</strong>
            {(
              [
                { alignment: 'left', icon: AlignLeft },
                { alignment: 'center', icon: AlignCenter },
                { alignment: 'right', icon: AlignRight },
              ] as const
            ).map(({ alignment, icon }) => (
              <IconButton
                key={alignment}
                icon={icon}
                size="sm"
                label={`Align column ${alignment}`}
                aria-pressed={table.alignment === alignment}
                onClick={() => apply(alignment)}
              />
            ))}
          </fieldset>
          <div className="live-table-footer">
            <span className="side-note">Tab moves between cells. Undo restores deletions.</span>
            <Button
              size="sm"
              variant="ghost"
              icon={Trash2}
              className="live-context-cancel"
              onClick={() => apply('delete-table')}
            >
              Delete table
            </Button>
          </div>
        </fieldset>
      )}
    </>
  )
}
