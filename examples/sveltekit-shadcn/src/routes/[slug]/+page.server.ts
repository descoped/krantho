import { error } from '@sveltejs/kit'
import { loadContent, loadJsonLd } from '#lib/cms.ts'

// Any published page without a route of its own: `about` and `services` have theirs,
// and `home` is `/`. A slug with no published page is not found.
export async function load({ params }: { params: { slug: string } }) {
  if (params.slug === 'home') error(404, 'Not found')
  const page = await loadContent('pages', params.slug)
  if (!page) error(404, 'Not found')
  const jsonLd = await loadJsonLd('pages', params.slug)
  return { doc: page.doc, fields: page.fields, html: page.html, body: page.body, jsonLd }
}
