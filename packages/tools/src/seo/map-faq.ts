import { writeFileSync } from 'fs'
import { join } from 'path'
import { readYAML } from '../shared/cms-reader'
import { loadSiteConfig } from '../shared/site-config'
import { toolPaths } from '../shared/tool-paths'
import type { FAQEntry, FAQQuestion, RouteGroup } from './types'

/**
 * Walk up the URL hierarchy and collect parent routes.
 * For "/services/strategy", returns ["/services", "/"]
 */
function getParentRoutes(route: string): string[] {
  const parents: string[] = []
  let current = route

  while (current !== '/') {
    const lastSlash = current.lastIndexOf('/')
    current = lastSlash === 0 ? '/' : current.slice(0, lastSlash)
    parents.push(current)
  }

  return parents
}

/**
 * Resolve FAQ entries for a given route using inheritance.
 *
 * Algorithm:
 * 1. Collect own entries (exact target match)
 * 2. Walk up URL hierarchy; for each parent with inherit: true, include its questions
 * 3. Own entries first, then inherited entries (parent before grandparent)
 */
export function resolveRouteQuestions(
  route: string,
  routeMap: Map<string, RouteGroup>,
): FAQQuestion[] {
  const ownGroup = routeMap.get(route)
  const ownQuestions = ownGroup?.questions ?? []

  const inheritedQuestions: FAQQuestion[] = []
  const parentRoutes = getParentRoutes(route)

  for (const parent of parentRoutes) {
    const parentGroup = routeMap.get(parent)
    if (parentGroup?.inherit) {
      inheritedQuestions.push(...parentGroup.questions)
    }
  }

  return [...ownQuestions, ...inheritedQuestions]
}

function toFAQEntry(q: FAQQuestion): FAQEntry {
  return {
    '@type': 'Question',
    name: q.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: q.answer,
    },
  }
}

export function mapFAQ(): Record<string, FAQEntry[]> {
  const routeGroups = readYAML<RouteGroup[]>('guardrails.yaml')

  // Build lookup map
  const routeMap = new Map<string, RouteGroup>()
  for (const group of routeGroups) {
    routeMap.set(group.target, group)
  }

  const result: Record<string, FAQEntry[]> = {}

  for (const route of loadSiteConfig().appRoutes) {
    const questions = resolveRouteQuestions(route, routeMap)
    if (questions.length > 0) {
      result[route] = questions.map(toFAQEntry)
    }
  }

  return result
}

export function generateFAQData(dryRun: boolean = false): void {
  const data = mapFAQ()
  const json = JSON.stringify(data, null, 2) + '\n'

  if (dryRun) {
    console.log('[dry-run] faq-pages.json:')
    console.log(json)
    return
  }

  const outputPath = join(toolPaths().generatedDir, 'faq-pages.json')
  writeFileSync(outputPath, json, 'utf-8')
  console.log(`wrote ${outputPath}`)
}
