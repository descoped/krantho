import { fireEvent, screen, within } from '@testing-library/react'
import type { FakeDoc } from './editor-api.js'
import { json, type Route } from './site-api.js'

export const BODY =
  'Opening words here.\n\n## Problem\n\nWhat hurts.\n\n## Notes\n\nSome extra notes here.'

export function pricing(fields: Record<string, unknown> = {}): FakeDoc {
  return {
    metadata: {},

    slug: 'pricing',
    version: 3,
    liveVersion: 2,
    fields: { title: 'Pricing', description: 'What it costs', ...fields },
    body: BODY,
  }
}

/** The collection designs Problem, Approach and Proof; SEO answers for the document and the site */
export function seoRoutes(more: Record<string, Route> = {}): Record<string, Route> {
  return {
    'GET /api/collections': () =>
      json({
        collections: [
          {
            name: 'pages',
            source: 'database',
            pages: true,
            sections: ['Problem', 'Approach', 'Proof'],
          },
          { name: 'globals', source: 'database', pages: false, sections: [] },
        ],
      }),
    'GET /api/seo/resolved/pages/pricing': () =>
      json({
        entities: [
          { type: 'Organization', id: '#org', level: 'site', properties: [] },
          { type: 'Article', id: '/pricing#article', level: 'document', properties: [] },
        ],
      }),
    'GET /api/seo/findings/pages/pricing': () =>
      json({
        findings: [
          { severity: 'warning', check: 'meta-description', message: 'Short' },
          {
            severity: 'error',
            check: 'structured-data',
            message: 'Missing image',
            reader: 'google',
          },
        ],
        readers: [{ id: 'google', name: 'Google' }],
      }),
    'GET /api/seo/findings': () =>
      json({
        pages: [
          {
            collection: 'pages',
            slug: 'pricing',
            path: '/pricing',
            readers: { google: { errors: 1, warnings: 0, info: 0 } },
            features: [
              { reader: 'google', feature: 'Article', type: 'Article', eligible: true },
              { reader: 'google', feature: 'Breadcrumb', type: 'BreadcrumbList', eligible: false },
            ],
          },
        ],
        readers: [{ id: 'google', name: 'Google' }],
      }),
    ...more,
  }
}

export function mediaItem(altText: string): Record<string, unknown> {
  return {
    id: 'm1',
    filename: 'fjord.jpg',
    url: '/uploads/fjord.jpg',
    altText,
    mimeType: 'image/jpeg',
    size: 2048,
    width: 800,
    height: 600,
    folder: null,
    tags: [],
    crop: null,
    hotspot: null,
    createdAt: '2026-10-01T10:00:00.000Z',
  }
}

export async function panel(): Promise<HTMLElement> {
  return screen.findByRole('complementary', { name: 'Side panel' })
}

export async function card(name: string): Promise<HTMLElement> {
  return within(await panel()).findByRole('region', { name })
}

export function body(): HTMLTextAreaElement {
  return screen.getByRole('textbox', { name: 'Body' }) as HTMLTextAreaElement
}

/** Put the body's caret at a place and let it report, as a key press would */
export function caretAt(position: number): void {
  const area = body()
  area.focus()
  area.setSelectionRange(position, position)
  fireEvent.keyUp(area)
}
