import { type MouseEvent, type ReactElement, type ReactNode, useEffect, useId, useRef } from 'react'
import './data-table.css'

/** One column: its header, how a row fills its cell, and how the cell reads as a stacked card */
export interface DataColumn<Row> {
  id: string
  header: string
  cell: (row: Row) => ReactNode
  /** Figures: mono, tabular, right-aligned */
  numeric?: boolean | undefined
  /** The row's name: the first line of a stacked card, shown without a label */
  primary?: boolean | undefined
  /** A fixed width at table size, as a CSS length */
  width?: string | undefined
}

/** Row checkboxes: which rows are selected, and how to change that */
export interface RowSelection<Row> {
  selected: ReadonlySet<string>
  onToggle: (key: string) => void
  /** Selects every row, or clears the selection when every row is selected */
  onToggleAll: () => void
  /** The row's name in its checkbox's label: "Select <name>" */
  rowLabel: (row: Row) => string
}

export interface DataTableProps<Row> {
  /** The table's accessible name */
  caption: string
  columns: readonly DataColumn<Row>[]
  rows: readonly Row[]
  rowKey: (row: Row) => string
  selection?: RowSelection<Row> | undefined
  /** A click anywhere on a row that is not a control — the row's own link stays the way for keyboards */
  onRowClick?: ((row: Row) => void) | undefined
}

/** Clicks on a control inside the row are the control's own */
function onControl(event: MouseEvent): boolean {
  return (event.target as Element).closest('a, button, input, label, select, textarea') !== null
}

function SelectAll({
  count,
  selected,
  onToggleAll,
}: {
  count: number
  selected: number
  onToggleAll: () => void
}): ReactElement {
  const ref = useRef<HTMLInputElement>(null)
  const some = selected > 0 && selected < count
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = some
  }, [some])
  return (
    <input
      ref={ref}
      type="checkbox"
      className="ui-data-table-check"
      aria-label="Select all shown"
      checked={count > 0 && selected === count}
      disabled={count === 0}
      onChange={onToggleAll}
    />
  )
}

function HeaderRow<Row>({
  columns,
  rows,
  rowKey,
  selection,
}: Pick<DataTableProps<Row>, 'columns' | 'rows' | 'rowKey' | 'selection'>): ReactElement {
  const shownSelected = selection ? rows.filter((r) => selection.selected.has(rowKey(r))) : []
  return (
    <tr>
      {selection && (
        <th scope="col" className="ui-data-table-select">
          <SelectAll
            count={rows.length}
            selected={shownSelected.length}
            onToggleAll={selection.onToggleAll}
          />
        </th>
      )}
      {columns.map((column) => (
        <th
          key={column.id}
          scope="col"
          className={column.numeric ? 'ui-data-table-numeric' : undefined}
          style={column.width ? { width: column.width } : undefined}
        >
          {column.header}
        </th>
      ))}
    </tr>
  )
}

function cellClass<Row>(column: DataColumn<Row>): string | undefined {
  const classes = [
    column.numeric && 'ui-data-table-numeric',
    column.primary && 'ui-data-table-primary',
  ].filter(Boolean)
  return classes.length > 0 ? classes.join(' ') : undefined
}

/** A body cell: the primary column heads its row (`th scope="row"`), the rest are labelled data cells */
function BodyCell<Row>({ row, column }: { row: Row; column: DataColumn<Row> }): ReactElement {
  if (column.primary) {
    return (
      <th scope="row" className={cellClass(column)}>
        {column.cell(row)}
      </th>
    )
  }
  return (
    <td data-label={column.header} className={cellClass(column)}>
      {column.cell(row)}
    </td>
  )
}

function SelectCell<Row>({
  row,
  rowId,
  selection,
}: {
  row: Row
  rowId: string
  selection: RowSelection<Row>
}): ReactElement {
  return (
    <td className="ui-data-table-select">
      <input
        type="checkbox"
        className="ui-data-table-check"
        aria-label={`Select ${selection.rowLabel(row)}`}
        checked={selection.selected.has(rowId)}
        onChange={() => selection.onToggle(rowId)}
      />
    </td>
  )
}

interface BodyRowProps<Row> {
  row: Row
  rowId: string
  columns: readonly DataColumn<Row>[]
  selection: RowSelection<Row> | undefined
  onRowClick: ((row: Row) => void) | undefined
}

function BodyRow<Row>({
  row,
  rowId,
  columns,
  selection,
  onRowClick,
}: BodyRowProps<Row>): ReactElement {
  const onClick = onRowClick
    ? (event: MouseEvent) => {
        if (!onControl(event)) onRowClick(row)
      }
    : undefined
  return (
    <tr
      data-selected={selection?.selected.has(rowId) || undefined}
      className={onRowClick ? 'ui-data-table-row--link' : undefined}
      onClick={onClick}
    >
      {selection && <SelectCell row={row} rowId={rowId} selection={selection} />}
      {columns.map((column) => (
        <BodyCell key={column.id} row={row} column={column} />
      ))}
    </tr>
  )
}

/**
 * A real table with column headers and a sticky header row; below 640px each
 * row becomes a stacked card whose cells are labelled with their column —
 * the same DOM, restyled. Selection is a column of native checkboxes, so it
 * works from the keyboard.
 */
export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  selection,
  onRowClick,
}: DataTableProps<Row>): ReactElement {
  const captionId = useId()
  return (
    <table className="ui-data-table" aria-labelledby={captionId}>
      <caption id={captionId} className="visually-hidden">
        {caption}
      </caption>
      <thead>
        <HeaderRow columns={columns} rows={rows} rowKey={rowKey} selection={selection} />
      </thead>
      <tbody>
        {rows.map((row) => (
          <BodyRow
            key={rowKey(row)}
            row={row}
            rowId={rowKey(row)}
            columns={columns}
            selection={selection}
            onRowClick={onRowClick}
          />
        ))}
      </tbody>
    </table>
  )
}

/** Keys for placeholder rows, which have no identity of their own */
const SKELETON_KEYS = ['first', 'second', 'third', 'fourth'] as const

/** A table's frame while its rows load, at the height they will take */
export function DataTableSkeleton({ rows = 4 }: { rows?: number | undefined }): ReactElement {
  return (
    <div className="ui-data-table-skeleton" aria-hidden="true">
      {SKELETON_KEYS.slice(0, rows).map((key) => (
        <div key={key} className="ui-data-table-skeleton-row">
          <span className="ui-data-table-skeleton-bar" />
          <span className="ui-data-table-skeleton-bar ui-data-table-skeleton-bar--short" />
        </div>
      ))}
    </div>
  )
}
