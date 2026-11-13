import { addValue, nodeById, ref } from './nodes.js'
import type { Decorator } from './types.js'

/**
 * The page's place in an ordered set — a docs area, a series: the set as a
 * CollectionPage the page is part of, and the page's position in it. Order,
 * as opposed to the hierarchy the breadcrumb states.
 */
export const sequenceDecorator: Decorator = {
  id: 'sequence',
  decorate(graph, page) {
    const { sequence } = page
    const node = nodeById(graph, page.pageId)
    if (!sequence || !node) return graph
    const { name, url } = sequence.partOf
    if (!nodeById(graph, url)) graph.push({ '@type': 'CollectionPage', '@id': url, name, url })
    addValue(node, 'isPartOf', ref(url))
    node.position = sequence.position
    return graph
  },
}
