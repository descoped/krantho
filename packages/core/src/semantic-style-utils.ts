/** Maps semantic variants to HTML tags */
const VARIANT_TAGS: Record<string, string> = {
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  h5: 'h5',
  h6: 'h6',
  body1: 'p',
  body2: 'p',
  caption: 'span',
}

/** Resolve a semantic variant to its HTML tag (default: 'p') */
export function variantToTag(variant?: string): string {
  return (variant && VARIANT_TAGS[variant]) || 'p'
}
