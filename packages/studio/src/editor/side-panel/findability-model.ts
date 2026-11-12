import type { SeoLimits } from '../../lib/api-types.js'
import type { EffectiveMeta } from '../../lib/findability.js'
import type { MeterSegment, MeterTone } from '../../ui/meter.js'

/**
 * How a title or meta description measures against the limits the site
 * configures (`seo.limits` of `/api/site-config` — the same values the API's
 * checks use). Under the meta description's target is a warning, over its
 * limit is danger.
 */
export type LengthState = 'missing' | 'under' | 'within' | 'over'

export function metaLengthState(length: number, limits: SeoLimits['metaDescription']): LengthState {
  if (length === 0) return 'missing'
  if (length < limits.minChars) return 'under'
  return length > limits.maxChars ? 'over' : 'within'
}

export function titleLengthState(length: number, maxChars: number): LengthState {
  if (length === 0) return 'missing'
  return length > maxChars ? 'over' : 'within'
}

const TONES: Readonly<Record<LengthState, MeterTone>> = {
  missing: 'muted',
  under: 'ahead',
  within: 'live',
  over: 'danger',
}

/** The meter's one part: the length, in the state's tone, on a scale that holds the limit */
export function lengthMeter(
  length: number,
  state: LengthState,
  limit: number,
): { segments: MeterSegment[]; max: number } {
  return { segments: [{ value: length, tone: TONES[state] }], max: Math.max(limit, length) }
}

/** What the state reads as beside the figure, so it never rests on colour */
export function lengthWords(state: LengthState, target: 'range' | 'limit'): string {
  switch (state) {
    case 'missing':
      return 'none'
    case 'under':
      return 'under the target'
    case 'over':
      return target === 'range' ? 'over the target' : 'over the limit'
    default:
      return target === 'range' ? 'within the target' : 'within the limit'
  }
}

/** A piece of advice on the meta description; `field` is the one Edit focuses, when the form has it */
export interface MetaAdvice {
  text: string
  field: string | null
}

/**
 * Advice when the meta description falls back to `description`, is too long,
 * or is missing. `formFields` are the fields Structure mode shows, so Edit is
 * offered only for a field the form has.
 */
export function metaAdvice(
  meta: EffectiveMeta,
  state: LengthState,
  limits: SeoLimits['metaDescription'],
  formFields: ReadonlySet<string>,
): MetaAdvice[] {
  const own = formFields.has('meta-description') ? 'meta-description' : null
  const advice: MetaAdvice[] = []
  if (meta.source === null) {
    const field = own ?? (formFields.has('description') ? 'description' : null)
    advice.push({ text: 'No meta description: search engines pick text from the page.', field })
  }
  if (meta.source === 'description') {
    advice.push(
      own
        ? {
            text: 'Search results show the description. Write a meta description of its own.',
            field: own,
          }
        : {
            text: 'Search results show the description: this collection has no meta-description field.',
            field: null,
          },
    )
  }
  if (state === 'over' && meta.source) {
    const text = `The meta description is ${meta.text.length} characters; search results cut it near ${limits.maxChars}.`
    advice.push({ text, field: formFields.has(meta.source) ? meta.source : null })
  }
  return advice
}
