/**
 * A single validation error with context for debugging.
 */
export interface ValidationError {
  collection: string
  slug: string
  field: string
  message: string
  expected: string
  received: string
}

/**
 * Result of validating all content across all collections.
 */
export interface ValidationResult {
  valid: boolean
  errors: readonly ValidationError[]
  summary: {
    total: number
    valid: number
    invalid: number
  }
}

/**
 * Thrown when content validation fails in strict mode.
 */
export class ContentValidationError extends Error {
  readonly errors: readonly ValidationError[]

  constructor(errors: readonly ValidationError[]) {
    // Group by collection/slug
    const grouped = new Map<string, ValidationError[]>()
    for (const err of errors) {
      const key = `${err.collection}/${err.slug}`
      const list = grouped.get(key)
      if (list) {
        list.push(err)
      } else {
        grouped.set(key, [err])
      }
    }

    const parts: string[] = []
    for (const [key, errs] of grouped) {
      parts.push(
        `Invalid frontmatter for "${key}":\n${errs.map((e) => `  - "${e.field}": ${e.message}`).join('\n')}`,
      )
    }

    super(parts.join('\n\n'))
    this.name = 'ContentValidationError'
    this.errors = errors
  }
}
