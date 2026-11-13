import { error } from '@sveltejs/kit'
import { loadContent, loadJsonLd, loadSummaries } from '#lib/cms.ts'

export async function load() {
  const services = await loadContent('pages', 'services')
  if (!services) error(404, 'Not found')
  const jsonLd = await loadJsonLd('pages', 'services')
  // Cards link to each published service's detail page, sourced from its own doc.
  const cards = (await loadSummaries('services')).map((svc) => ({
    title: String(svc.fields['title'] ?? ''),
    description: String(svc.fields['ingress'] ?? ''),
    href: `/services/${svc.slug}`,
    doc: svc.doc,
  }))
  return { doc: services.doc, fields: services.fields, cards, jsonLd }
}
