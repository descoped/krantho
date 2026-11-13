import { error } from '@sveltejs/kit'
import { loadContent, loadJsonLd, loadSummaries } from '#lib/cms.ts'

export async function load() {
  const home = await loadContent('pages', 'home')
  if (!home) error(404, 'Not found')
  const jsonLd = await loadJsonLd('pages', 'home')
  // Each service is its own collection doc (title/ingress/body), not fields on
  // a single 'services' page.
  const services = (await loadSummaries('services')).map((svc) => ({
    title: String(svc.fields['title'] ?? ''),
    description: String(svc.fields['ingress'] ?? ''),
    href: `/services/${svc.slug}`,
    doc: svc.doc,
  }))
  return {
    doc: home.doc,
    fields: home.fields,
    html: home.html,
    body: home.body,
    jsonLd,
    services,
  }
}
