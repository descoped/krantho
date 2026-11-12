import type { DataColumn } from '../ui/data-table.js'
import {
  type CellContext,
  FindabilityCell,
  LiveCell,
  LocalesCell,
  PageCell,
  SlugCell,
  StatusCell,
  UpdatedCell,
} from './site-cells.js'
import type { SiteRow } from './site-model.js'

/** The Locales column, only when the site tracks locale versions */
function localesColumn(localization: boolean): DataColumn<SiteRow>[] {
  if (!localization) return []
  return [{ id: 'locales', header: 'Locales', cell: (row) => <LocalesCell row={row} /> }]
}

const STATUS_COLUMN: DataColumn<SiteRow> = {
  id: 'status',
  header: 'Status',
  width: '11rem',
  cell: (row) => <StatusCell row={row} />,
}

const UPDATED_COLUMN: DataColumn<SiteRow> = {
  id: 'updated',
  header: 'Updated',
  numeric: true,
  width: '9.5rem',
  cell: (row) => <UpdatedCell row={row} />,
}

/** The overview's columns: Page, Status, Findability, Locales, Updated */
export function overviewColumns(
  context: CellContext,
  localization: boolean,
): DataColumn<SiteRow>[] {
  return [
    {
      id: 'page',
      header: 'Page',
      primary: true,
      cell: (row) => <PageCell row={row} context={context} />,
    },
    STATUS_COLUMN,
    {
      id: 'findability',
      header: 'Findability',
      cell: (row) => <FindabilityCell row={row} context={context} />,
    },
    ...localesColumn(localization),
    UPDATED_COLUMN,
  ]
}

/** The collection view's columns: Slug, Status, Live, SEO, Locales, Updated */
export function collectionColumns(
  context: CellContext,
  localization: boolean,
): DataColumn<SiteRow>[] {
  return [
    {
      id: 'slug',
      header: 'Slug',
      primary: true,
      cell: (row) => <SlugCell row={row} context={context} />,
    },
    STATUS_COLUMN,
    {
      id: 'live',
      header: 'Live',
      numeric: true,
      width: '4.5rem',
      cell: (row) => <LiveCell row={row} />,
    },
    {
      id: 'seo',
      header: 'SEO',
      cell: (row) => <FindabilityCell row={row} context={context} />,
    },
    ...localesColumn(localization),
    UPDATED_COLUMN,
  ]
}
