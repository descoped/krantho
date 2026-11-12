import type { IPersistenceAdapter } from '@krantho/persistence'
import matter from 'gray-matter'
import type { ZodObject, ZodRawShape } from 'zod'
import type { Collection } from './collection.js'
import type { ContentConfig } from './config.js'
import type { ValidationError, ValidationResult } from './errors.js'
import { ContentValidationError } from './errors.js'

/**
 * Options for content validation.
 */
export interface ValidateOptions {
  /** 'strict' throws on first collection with errors, 'warn' collects all errors */
  mode?: 'strict' | 'warn' | undefined
}

/**
 * Validate content fields against a collection's Zod schema.
 *
 * Returns an array of validation errors (empty if valid).
 */
export function validateFields(
  fields: Record<string, unknown>,
  collection: Collection<ZodObject<ZodRawShape>>,
  slug: string,
): ValidationError[] {
  const result = collection.schema.safeParse(fields)

  if (result.success) {
    return []
  }

  const errors: ValidationError[] = []
  for (const issue of result.error.issues) {
    const field = issue.path.join('.')
    errors.push({
      collection: collection.name,
      slug,
      field: field || '(root)',
      message: issue.message,
      expected: 'expected' in issue ? String(issue.expected) : 'valid value',
      received: 'received' in issue ? String(issue.received) : 'invalid',
    })
  }

  return errors
}

/**
 * Validate all content across all filesystem-mastered collections.
 *
 * Reads each content file via the persistence adapter, parses fields,
 * and validates against the collection's Zod schema.
 *
 * @param config - The project content configuration from defineConfig()
 * @param adapter - A persistence adapter that reads each collection's files
 * @param options - Validation options (mode: 'strict' | 'warn')
 */
export async function validateAllContent(
  config: ContentConfig,
  adapter: IPersistenceAdapter,
  options: ValidateOptions = {},
): Promise<ValidationResult> {
  const mode = options.mode ?? 'strict'
  const allErrors: ValidationError[] = []
  let total = 0

  for (const [, collection] of config.collections) {
    // Only validate filesystem-mastered collections (database validation happens at write time)
    if (collection.source !== 'filesystem') continue

    if (adapter.query) {
      const { items } = await adapter.query({
        state: 'current',
        projection: 'summary',
        collections: [collection.name],
      })

      for (const item of items) {
        total++
        const errors = validateFields(item.fields, collection, item.meta.slug)

        if (errors.length > 0) {
          allErrors.push(...errors)
          if (mode === 'strict') {
            throw new ContentValidationError(errors)
          }
        }
      }
    } else {
      // Fallback: listSlugs + read (no directory scoping)
      const slugs = await adapter.listSlugs()

      for (const slug of slugs) {
        total++
        const raw = await adapter.read(slug)
        const { data: parsedFrontmatter } = matter(raw)
        const errors = validateFields(parsedFrontmatter, collection, slug)

        if (errors.length > 0) {
          allErrors.push(...errors)
          if (mode === 'strict') {
            throw new ContentValidationError(errors)
          }
        }
      }
    }
  }

  const invalid = new Set(allErrors.map((e) => `${e.collection}/${e.slug}`)).size

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    summary: {
      total,
      valid: total - invalid,
      invalid,
    },
  }
}
