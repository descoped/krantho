import { getAllCMSSummaries } from '@krantho/ui-react/server'

/** The slugs of the published services, in their configured order */
export async function publishedServiceSlugs(): Promise<string[]> {
  const services = await getAllCMSSummaries('services')
  return services
    .sort((a, b) => Number(a.fields['order'] ?? 99) - Number(b.fields['order'] ?? 99))
    .map((service) => service.slug)
}
