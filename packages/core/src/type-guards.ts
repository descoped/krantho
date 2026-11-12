import type { ContentError, ContentResult, SemanticStyle } from './types.js'
import { VALID_ALIGNS, VALID_COLORS, VALID_SIZES, VALID_VARIANTS, VALID_WEIGHTS } from './types.js'

/**
 * Type guards for runtime type validation
 */
export const TypeGuards = {
  isContentResult(value: unknown): value is ContentResult {
    return (
      typeof value === 'object' &&
      value !== null &&
      'fields' in value &&
      'content' in value &&
      'html' in value &&
      'sections' in value &&
      'metadata' in value &&
      'loading' in value &&
      'error' in value
    )
  },

  isSemanticStyle(value: unknown): value is SemanticStyle {
    if (typeof value !== 'object' || value === null) return false

    const style = value as Record<string, unknown>

    const validString = (val: unknown, valid: readonly string[]): boolean =>
      val === undefined || (typeof val === 'string' && (valid as readonly string[]).includes(val))

    return (
      validString(style.variant, VALID_VARIANTS) &&
      validString(style.color, VALID_COLORS) &&
      validString(style.align, VALID_ALIGNS) &&
      validString(style.weight, VALID_WEIGHTS) &&
      validString(style.size, VALID_SIZES)
    )
  },

  isContentError(value: unknown): value is ContentError {
    return (
      typeof value === 'object' &&
      value !== null &&
      'code' in value &&
      'message' in value &&
      typeof (value as ContentError).code === 'string' &&
      typeof (value as ContentError).message === 'string'
    )
  },
}
