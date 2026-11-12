import { describe, expect, it } from 'vitest'
import {
  hotspotAt,
  nudgeHotspot,
  previewSrc,
  toMediaCrop,
} from '../src/media/image-editor-model.js'
import {
  dimensionsText,
  folderRows,
  kindLabel,
  mediaPermissions,
  referenceCount,
  referenceText,
  referencingDocuments,
  renameWarning,
  sortItems,
} from '../src/media/media-model.js'
import { FILES, FOLDERS, mediaFile, USAGE } from './fixtures/media-api.js'

describe('media model', () => {
  it('names the kind from the MIME type, SVG for image/svg+xml', () => {
    expect(kindLabel('image/jpeg')).toBe('JPEG')
    expect(kindLabel('image/svg+xml')).toBe('SVG')
    expect(kindLabel('application')).toBe('FILE')
  })

  it('shows dimensions only when the API stored them', () => {
    expect(dimensionsText(mediaFile('a'))).toBe('1200 × 630')
    expect(dimensionsText(mediaFile('b', { width: null, height: null }))).toBeNull()
  })

  it('counts documents, not fields: a document using a file twice is one', () => {
    const documents = referencingDocuments(USAGE.fjord ?? [])
    expect(documents).toEqual([
      { collection: 'pages', slug: 'about', fields: ['hero', 'body'] },
      { collection: 'services', slug: 'design', fields: ['og-image'] },
    ])
    expect(referenceText({ state: 'ready', documents })).toBe('Referenced by 2 documents')
    expect(referenceCount({ state: 'ready', documents })).toBe(2)
  })

  it('shows no number when the references are unknown, and says why', () => {
    expect(referenceText({ state: 'failed' })).toBe('References could not be read')
    expect(referenceCount({ state: 'failed' })).toBeNull()
    expect(referenceText(undefined)).toBe('Reading references…')
    expect(referenceText({ state: 'ready', documents: [] })).toBe('Not referenced')
  })

  it('says a rename changes only the name shown in Studio, never the file or its URL', () => {
    expect(renameWarning(1)).toBe(
      '1 document uses this file. A rename changes only the name shown in Studio: the file and its URL stay the same, so their pages keep the same image.',
    )
    expect(renameWarning(3)).toMatch(/^3 documents use this file\./)
    expect(renameWarning(null)).toMatch(
      /^This file's references are not known, so documents may use it\./,
    )
    expect(renameWarning(2)).not.toContain('by its id')
  })

  it('leaves out the folders inside a collapsed one, and says which have subfolders', () => {
    const open = folderRows(FOLDERS)
    expect(open.map((row) => [row.folder.name, row.hasChildren, row.ancestors])).toEqual([
      ['Brand', true, []],
      ['Logos', false, ['f-brand']],
    ])
    expect(folderRows(FOLDERS, new Set(['f-brand'])).map((row) => row.folder.name)).toEqual([
      'Brand',
    ])
  })

  it('lists folders with each child indented under its parent', () => {
    const rows = folderRows([...FOLDERS].reverse())
    expect(rows.map((row) => [row.folder.name, row.depth])).toEqual([
      ['Brand', 0],
      ['Logos', 1],
    ])
  })

  it('orders the page by name, size or date', () => {
    expect(sortItems(FILES, 'name').map((file) => file.filename)).toEqual([
      'fjord.jpg',
      'logo.png',
      'plan.svg',
    ])
    expect(sortItems(FILES, 'oldest').map((file) => file.id)).toEqual(['plan', 'logo', 'fjord'])
  })

  it('gives editors the edits and admins the bulk delete, as the API allows', () => {
    const as = (roles: string[]) => (role: string) =>
      roles.includes(role) || (role === 'editor' && roles.includes('admin'))
    expect(mediaPermissions(as(['viewer']))).toEqual({ canEdit: false, canAdminister: false })
    expect(mediaPermissions(as(['editor']))).toEqual({ canEdit: true, canAdminister: false })
    expect(mediaPermissions(as(['admin']))).toEqual({ canEdit: true, canAdminister: true })
  })
})

describe('image editor model', () => {
  it('stores a drawn crop to two decimals, and nothing for an empty one', () => {
    expect(toMediaCrop({ x: 10.123, y: 5, width: 50.456, height: 40, unit: '%' })).toEqual({
      x: 10.12,
      y: 5,
      width: 50.46,
      height: 40,
    })
    expect(toMediaCrop({ x: 0, y: 0, width: 0, height: 0, unit: '%' })).toBeNull()
    expect(toMediaCrop(undefined)).toBeNull()
  })

  it('moves the hotspot with the arrow keys, inside the image', () => {
    expect(nudgeHotspot(null, 'ArrowLeft')).toEqual(hotspotAt(50, 50))
    expect(nudgeHotspot(hotspotAt(1, 50), 'ArrowLeft')).toEqual(hotspotAt(0, 50))
    expect(nudgeHotspot(hotspotAt(50, 50), 'ArrowDown')).toEqual(hotspotAt(50, 52))
    expect(nudgeHotspot(hotspotAt(50, 50), 'Enter')).toBeNull()
  })

  it('previews a saved framing through the image route', () => {
    expect(previewSrc('fjord', '16:9', 2)).toBe(
      '/api/media/fjord/image?preset=md&fmt=webp&aspect=16%3A9&v=2',
    )
  })
})
