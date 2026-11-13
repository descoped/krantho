import { error } from '@sveltejs/kit'
import { loadContent, loadJsonLd } from '#lib/cms.ts'

export async function load({ params }: { params: { slug: string } }) {
  const svc = await loadContent('services', params.slug)
  if (!svc) error(404, 'Service not found')
  const jsonLd = await loadJsonLd('services', params.slug)
  return { slug: params.slug, doc: svc.doc, fields: svc.fields, html: svc.html, body: svc.body, jsonLd }
}
