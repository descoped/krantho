import { lifecycleOf, termName } from '../vocabulary/index.js'
import type { Finding } from './types.js'

/** What kind of term is checked, for the message */
export type TermKind = 'Type' | 'Property' | 'Value'

/** Where the term appears */
export interface TermContext {
  nodeId?: string | undefined
  type?: string | undefined
  property?: string | undefined
}

/**
 * Life-cycle findings for a Schema.org term: superseded and retired terms are
 * errors (the message names the replacement), a pending term is information.
 */
export function termFindings(kind: TermKind, term: string, context: TermContext): Finding[] {
  const lifecycle = lifecycleOf(term)
  if (!lifecycle) return []
  const name = termName(term)
  const base = { profile: 'schema.org', ...context }
  switch (lifecycle.status) {
    case 'superseded':
      return [
        {
          ...base,
          severity: 'error',
          code: 'superseded-term',
          message: `${kind} "${name}" is superseded by "${lifecycle.by}" in Schema.org.`,
        },
      ]
    case 'retired':
      return [
        {
          ...base,
          severity: 'error',
          code: 'retired-term',
          message: `${kind} "${name}" is retired from Schema.org.`,
        },
      ]
    case 'pending':
      return [
        {
          ...base,
          severity: 'info',
          code: 'pending-term',
          message: `${kind} "${name}" is a pending Schema.org term, not yet part of the core vocabulary.`,
        },
      ]
  }
}
