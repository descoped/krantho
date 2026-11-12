import type { TrailItem } from '@krantho/core'
import type { SchemaEntity } from '../graph/types.js'
import { isA, nodeById, ref } from './nodes.js'
import type { Decorator } from './types.js'

/** A trail as BreadcrumbList items; the last one may leave out its URL */
export function breadcrumbItems(trail: readonly TrailItem[]): SchemaEntity[] {
  return trail.map((step, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: step.name,
    ...(step.url ? { item: step.url } : {}),
  }))
}

/**
 * The page's place in the hierarchy: a BreadcrumbList from the trail it
 * renders — a configured BreadcrumbList is built from the same trail — linked
 * from the page node.
 */
export const breadcrumbDecorator: Decorator = {
  id: 'breadcrumb',
  decorate(graph, page) {
    let list = graph.find((node) => isA(node, 'BreadcrumbList'))
    if (!list) {
      if (!page.trail?.length) return graph
      list = {
        '@type': 'BreadcrumbList',
        '@id': `${page.pageId.replace(/#[^#]*$/, '')}#breadcrumb`,
        itemListElement: breadcrumbItems(page.trail),
      }
      graph.push(list)
    }
    const node = nodeById(graph, page.pageId)
    if (node && list['@id'] && node['breadcrumb'] === undefined)
      node['breadcrumb'] = ref(list['@id'])
    return graph
  },
}
