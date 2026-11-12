import type { ContentRef, PageDefinition } from './types.js'

/**
 * Define a page's route and content requirements.
 *
 * @example
 * ```ts
 * export const homePage = definePage({
 *   route: '/',
 *   content: {
 *     hero: slug('home'),
 *     serviceCards: sections('services', ['strategy', 'advisory']),
 *     latestPosts: collection('blog', { status: 'published', limit: 3 }),
 *   },
 * })
 * ```
 */
export function definePage(config: {
  route: string
  content: Record<string, ContentRef>
}): PageDefinition {
  if (!config.route) {
    throw new Error('Page route is required')
  }

  if (Object.keys(config.content).length === 0) {
    throw new Error(`Page "${config.route}" must have at least one content reference`)
  }

  return {
    route: config.route,
    content: config.content,
  }
}
