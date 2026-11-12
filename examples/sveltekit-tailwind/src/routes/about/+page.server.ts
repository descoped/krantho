import { error } from '@sveltejs/kit'
import { loadContent, loadJsonLd, loadSection } from '$lib/cms'

export async function load() {
  const about = await loadContent('pages', 'about')
  if (!about) error(404, 'Not found')
  const jsonLd = await loadJsonLd('pages', 'about')
  return {
    doc: about.doc,
    fields: about.fields,
    ourTeam: loadSection(about.sections, 'Our Team'),
    ourApproach: loadSection(about.sections, 'Our Approach'),
    jsonLd,
  }
}
