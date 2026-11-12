import { describe, expect, it } from 'vitest'
import { resolveRouteQuestions } from '../src/seo/map-faq'
import type { FAQQuestion, RouteGroup } from '../src/seo/types'

function makeQuestion(q: string): FAQQuestion {
  return { question: q, answer: `Answer for: ${q}` }
}

function buildRouteMap(groups: RouteGroup[]): Map<string, RouteGroup> {
  const map = new Map<string, RouteGroup>()
  for (const group of groups) {
    map.set(group.target, group)
  }
  return map
}

describe('resolveRouteQuestions', () => {
  it('returns own entries for a route with no parents', () => {
    const q1 = makeQuestion('Root question')
    const routeMap = buildRouteMap([{ target: '/', inherit: false, questions: [q1] }])

    const result = resolveRouteQuestions('/', routeMap)
    expect(result).toEqual([q1])
  })

  it('returns empty array for route with no entries', () => {
    const routeMap = buildRouteMap([])
    const result = resolveRouteQuestions('/unknown', routeMap)
    expect(result).toEqual([])
  })

  it('inherits parent entries when parent has inherit: true', () => {
    const parentQ = makeQuestion('Parent question')
    const childQ = makeQuestion('Child question')

    const routeMap = buildRouteMap([
      { target: '/services', inherit: true, questions: [parentQ] },
      {
        target: '/services/strategy',
        inherit: false,
        questions: [childQ],
      },
    ])

    const result = resolveRouteQuestions('/services/strategy', routeMap)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual(childQ)
    expect(result[1]).toEqual(parentQ)
  })

  it('does NOT inherit when parent has inherit: false', () => {
    const parentQ = makeQuestion('Parent question')
    const childQ = makeQuestion('Child question')

    const routeMap = buildRouteMap([
      { target: '/services', inherit: false, questions: [parentQ] },
      {
        target: '/services/strategy',
        inherit: false,
        questions: [childQ],
      },
    ])

    const result = resolveRouteQuestions('/services/strategy', routeMap)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(childQ)
  })

  it('own entries come before inherited entries', () => {
    const parentQ = makeQuestion('Inherited')
    const ownQ = makeQuestion('Own')

    const routeMap = buildRouteMap([
      { target: '/about', inherit: true, questions: [parentQ] },
      { target: '/about/approach', inherit: false, questions: [ownQ] },
    ])

    const result = resolveRouteQuestions('/about/approach', routeMap)
    expect(result[0].question).toBe('Own')
    expect(result[1].question).toBe('Inherited')
  })

  it('leaf route with no own entries still inherits from parent', () => {
    const parentQ = makeQuestion('Services question')

    const routeMap = buildRouteMap([{ target: '/services', inherit: true, questions: [parentQ] }])

    const result = resolveRouteQuestions('/services/digital-transformation', routeMap)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(parentQ)
  })

  it('inherits through multiple levels when all parents inherit', () => {
    const rootQ = makeQuestion('Root')
    const midQ = makeQuestion('Mid')
    const leafQ = makeQuestion('Leaf')

    const routeMap = buildRouteMap([
      { target: '/', inherit: true, questions: [rootQ] },
      { target: '/a', inherit: true, questions: [midQ] },
      { target: '/a/b', inherit: false, questions: [leafQ] },
    ])

    const result = resolveRouteQuestions('/a/b', routeMap)
    expect(result).toHaveLength(3)
    expect(result[0].question).toBe('Leaf')
    expect(result[1].question).toBe('Mid')
    expect(result[2].question).toBe('Root')
  })

  it('stops inheriting at non-inherit parent', () => {
    const rootQ = makeQuestion('Root')
    const midQ = makeQuestion('Mid')

    const routeMap = buildRouteMap([
      { target: '/', inherit: true, questions: [rootQ] },
      { target: '/a', inherit: false, questions: [midQ] },
    ])

    const result = resolveRouteQuestions('/a/b', routeMap)
    // /a has inherit: false, so /a/b does NOT get /a's entries
    // But / has inherit: true, so /a/b DOES get /'s entries
    expect(result).toHaveLength(1)
    expect(result[0].question).toBe('Root')
  })
})
