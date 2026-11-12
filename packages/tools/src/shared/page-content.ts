/**
 * Shared page content extraction for enrichment tools.
 *
 * Resolves route -> CMS content with section extraction,
 * composition merging, and frontmatter fallback.
 */

import { findSection, splitSections } from '@krantho/core'
import { readCMSContent } from './cms-reader'
import { cleanMarkdown } from './markdown-utils'
import { getPageCompositions, getRouteToSection, getRouteToSlug } from './route-maps'

export type FrontmatterFallback = (fm: Record<string, unknown>) => string

/** Simple fallback: all string frontmatter values joined */
export const simpleFrontmatterFallback: FrontmatterFallback = (fm) => {
  const values: string[] = []
  for (const [, value] of Object.entries(fm)) {
    if (typeof value === 'string' && !value.startsWith('http') && value.length > 3) {
      values.push(value)
    }
  }
  return values.join('. ')
}

/**
 * Get page content for a route, resolving sections and compositions.
 *
 * @param route - The route path (e.g., '/services/strategy')
 * @param fallback - Optional function to extract text from frontmatter when body is too short
 * @param maxLength - Maximum content length (default: 3000)
 */
export function getPageContent(
  route: string,
  fallback?: FrontmatterFallback,
  maxLength: number = 3000,
): string {
  const slug = getRouteToSlug()[route]
  if (!slug) return ''

  const { frontmatter, content } = readCMSContent(slug)
  const sectionSlug = getRouteToSection()[route]

  let text = ''

  if (sectionSlug) {
    text = cleanMarkdown(findSection(splitSections(content), sectionSlug)?.markdown ?? '')
    const title = frontmatter[`${sectionSlug}-title`]
    const ingress = frontmatter[`${sectionSlug}-ingress`]
    if (title) text = `${String(title)}. ${String(ingress || '')} ${text}`
  } else {
    text = cleanMarkdown(content)
  }

  const compositions = getPageCompositions()[route]
  if (compositions) {
    for (const compSlug of compositions) {
      try {
        const comp = readCMSContent(compSlug)
        const compText = cleanMarkdown(comp.content)
        if (compText.length > 20) text = text ? `${text} ${compText}` : compText
      } catch (error) {
        console.warn(
          `Skipping composition "${compSlug}" for route "${route}": ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
  }

  if (text.length < 20 && fallback) {
    text = fallback(frontmatter)
  }

  return text.slice(0, maxLength)
}
