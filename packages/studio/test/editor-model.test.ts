import { describe, expect, it } from 'vitest'
import { fieldHelp, fieldKind, seoFieldUses, typePill } from '../src/editor/field-model.js'
import {
  type HeaderFacts,
  headerStatus,
  publishBlocker,
  publishLead,
  publishTitle,
  saveBlocker,
  saveToast,
  siteLink,
  statusBlocker,
  versionDetail,
} from '../src/editor/header-model.js'
import { editorModes, modeFromParam } from '../src/editor/modes.js'
import { leavesDocument } from '../src/editor/use-leave-guard.js'

describe('field model', () => {
  it('reads the type pill from the schema in plain words: text, number, yes/no, image or file, link to a page, …', () => {
    expect(typePill({ type: 'string' }, 'title')).toBe('text')
    expect(typePill({ type: 'number' }, 'order')).toBe('number')
    expect(typePill({ type: 'integer' }, 'count')).toBe('number')
    expect(typePill({ type: 'boolean' }, 'featured')).toBe('yes/no')
    expect(typePill({ type: 'string', description: 'media' }, 'hero')).toBe('image or file')
    expect(typePill({ type: 'string', description: 'ref:services' }, 'service')).toBe(
      'link to a page',
    )
    expect(typePill({ type: 'string', enum: ['a', 'b'] }, 'kind')).toBe('choice')
    expect(typePill({ type: 'array', items: { type: 'string' } }, 'tags')).toBe('list of text')
    expect(typePill({ type: 'string', format: 'date' }, 'date')).toBe('date')
    expect(typePill({ type: 'string', format: 'uri' }, 'link')).toBe('web address')
    expect(typePill({ type: 'string' }, 'brand-color')).toBe('color')
  })

  it('picks the input a field is edited with', () => {
    expect(fieldKind({ type: 'string' }, 'description')).toBe('textarea')
    expect(fieldKind({ type: 'string', maxLength: 500 }, 'summary')).toBe('textarea')
    expect(fieldKind({ type: 'array', items: { type: 'string' } }, 'tags')).toBe('tags')
    expect(fieldKind({ type: 'string', format: 'date-time' }, 'at')).toBe('date')
    expect(fieldKind({ type: 'string' }, 'title')).toBe('text')
  })

  it('takes help text from the schema description, never from a media or reference marker', () => {
    expect(fieldHelp({ type: 'string', description: 'Shown in search results' })).toBe(
      'Shown in search results',
    )
    expect(fieldHelp({ type: 'string', description: 'media' })).toBeNull()
    expect(fieldHelp({ type: 'string', description: 'ref:services' })).toBeNull()
    expect(fieldHelp({ type: 'string' })).toBeNull()
  })

  it('names the SEO outputs that read a field, from seo-shared, with backups', () => {
    const uses = seoFieldUses(['title', 'meta-description', 'description', 'ingress', 'body-note'])
    expect(uses.get('title')).toBe('title')
    expect(uses.get('meta-description')).toBe('meta description')
    expect(uses.get('description')).toBe('backup for meta description')
    expect(uses.get('ingress')).toBe('backup for meta description')
    // seo-shared does not know the field: no chip
    expect(uses.has('body-note')).toBe(false)
  })

  it('reads an image as the image and sharing image, and a second image field as their backup', () => {
    expect(seoFieldUses(['image']).get('image')).toBe('image · sharing image')
    const both = seoFieldUses(['og-image', 'image'])
    expect(both.get('og-image')).toBe('image · sharing image')
    expect(both.get('image')).toBe('backup for image, sharing image')
  })
})

describe('header model', () => {
  const facts = (over: Partial<HeaderFacts> = {}): HeaderFacts => ({
    saved: { version: 5, liveVersion: 4 },
    dirty: false,
    busy: false,
    canEdit: true,
    lockedBy: null,
    rebased: false,
    conflict: false,
    ...over,
  })

  it('reads the status model and the version detail', () => {
    expect(headerStatus({ version: 4, liveVersion: 4 })).toBe('live')
    expect(headerStatus({ version: 5, liveVersion: 4 })).toBe('ahead')
    expect(headerStatus({ version: 1, liveVersion: null })).toBe('draft')
    expect(headerStatus(null)).toBe('draft')
    expect(versionDetail({ version: 5, liveVersion: 4 })).toBe('Draft v5 · live is v4')
    expect(versionDetail({ version: 4, liveVersion: 4 })).toBe('v4 is live')
    expect(versionDetail({ version: 1, liveVersion: null })).toBe('Draft v1 · nothing is live')
  })

  it('saves only unsaved changes, and never over someone else’s lock', () => {
    expect(saveBlocker(facts())).toBe('No unsaved changes')
    expect(saveBlocker(facts({ dirty: true }))).toBeNull()
    expect(saveBlocker(facts({ rebased: true }))).toBeNull()
    expect(saveBlocker(facts({ dirty: true, lockedBy: 'other@e2e.local' }))).toBe(
      'other@e2e.local is editing',
    )
    expect(saveBlocker(facts({ dirty: true, canEdit: false }))).toBe('Your role cannot edit')
    // A new document can always be saved
    expect(saveBlocker(facts({ saved: null }))).toBeNull()
  })

  it('publishes the saved version only: not while dirty, not when it is already live', () => {
    expect(publishBlocker(facts())).toBeNull()
    expect(publishBlocker(facts({ dirty: true }))).toMatch(/^Save the draft first/)
    expect(publishBlocker(facts({ saved: { version: 4, liveVersion: 4 } }))).toBe('v4 is live')
    expect(publishBlocker(facts({ saved: null }))).toBe('Save the draft first')
    expect(publishBlocker(facts({ lockedBy: 'other@e2e.local' }))).toBe(
      'other@e2e.local is editing',
    )
  })

  it('changes the status only once the form’s work is saved and answered', () => {
    expect(statusBlocker(facts())).toBeNull()
    expect(statusBlocker(facts({ dirty: true }))).toBe('Save the draft first')
    expect(statusBlocker(facts({ rebased: true }))).toBe('Save the draft first')
    expect(statusBlocker(facts({ conflict: true, dirty: true }))).toBe(
      'Answer the version conflict first',
    )
    expect(statusBlocker(facts({ lockedBy: 'other@e2e.local' }))).toBe('other@e2e.local is editing')
  })

  it('says the live page is unchanged after Save draft', () => {
    expect(saveToast({ version: 5, liveVersion: 4 })).toBe(
      'Draft saved · v5. The live page is unchanged until you publish.',
    )
    expect(saveToast({ version: 1, liveVersion: null })).toBe(
      'Draft saved · v1. Nothing is live until you publish.',
    )
  })

  it('titles the publish confirmation and says what visitors see', () => {
    expect(publishTitle('about', 5)).toBe('Publish about v5?')
    expect(publishLead({ version: 5, liveVersion: 4 })).toBe('Visitors see v4 now and will see v5.')
  })

  it('opens the draft preview when the site renders drafts, else the live page, else nothing', () => {
    const services = {
      name: 'services',
      source: 'database' as const,
      directory: undefined,
      pages: true,
      sections: [],
    }
    const input = {
      collection: services,
      slug: 'design',
      liveVersion: 2,
      preview: true,
      baseUrl: 'https://fjord.example/',
    }
    expect(siteLink(input)).toEqual({
      kind: 'preview',
      href: '/api/preview?collection=services&slug=design',
    })
    expect(siteLink({ ...input, preview: false })).toEqual({
      kind: 'live',
      href: 'https://fjord.example/services/design',
    })
    expect(siteLink({ ...input, preview: false, liveVersion: null })).toBeNull()
    const globals = { ...services, name: 'globals', pages: false }
    expect(siteLink({ ...input, collection: globals })).toBeNull()
  })

  it('shows only the modes that exist', () => {
    expect(editorModes('page').map((mode) => mode.label)).toEqual(['Live', 'Structure', 'Data'])
    expect(editorModes('global').map((mode) => mode.label)).toEqual(['Fields', 'Where it appears'])
  })

  it('opens the mode the address asks for when the editor has it, otherwise the first', () => {
    expect(modeFromParam('data', 'page')).toBe('data')
    expect(modeFromParam('structure', 'page')).toBe('structure')
    expect(modeFromParam(null, 'page')).toBe('live')
    expect(modeFromParam('live', 'page')).toBe('live')
    expect(modeFromParam('live', 'global')).toBe('fields')
    expect(modeFromParam('data', 'global')).toBe('fields')
    expect(modeFromParam('where', 'global')).toBe('where')
    expect(modeFromParam('where', 'page')).toBe('live')
  })

  it('opens a new document in Structure mode: it has no page to preview until saved', () => {
    expect(modeFromParam(null, 'page', { isNew: true })).toBe('structure')
    expect(modeFromParam('nope', 'page', { isNew: true })).toBe('structure')
    expect(modeFromParam('live', 'page', { isNew: true })).toBe('live')
    expect(modeFromParam('data', 'page', { isNew: true })).toBe('data')
    expect(modeFromParam(null, 'global', { isNew: true })).toBe('fields')
  })

  it('gives a document of a collection without pages no Live mode: Structure and Data only', () => {
    expect(editorModes('page', false).map((mode) => mode.label)).toEqual(['Structure', 'Data'])
    expect(modeFromParam(null, 'page', { hasPage: false })).toBe('structure')
    expect(modeFromParam('live', 'page', { hasPage: false })).toBe('structure')
    expect(modeFromParam('data', 'page', { hasPage: false })).toBe('data')
  })

  it('lets a mode switch through the leave guard; another document or locale leaves', () => {
    const at = (pathname: string, search = '') => ({ pathname, search })
    const pricing = at('/site/pages/pricing', '?locale=no')
    expect(leavesDocument(pricing, at('/site/pages/pricing', '?locale=no&mode=data'))).toBe(false)
    expect(leavesDocument(at('/site/pages/pricing', '?mode=data&locale=no'), pricing)).toBe(false)
    expect(leavesDocument(pricing, at('/site/pages/pricing', '?locale=en&mode=data'))).toBe(true)
    expect(leavesDocument(pricing, at('/site/pages/about', '?locale=no'))).toBe(true)
  })
})
