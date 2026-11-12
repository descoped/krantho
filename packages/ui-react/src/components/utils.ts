import type { SemanticStyle } from '@krantho/core'

export { variantToTag } from '@krantho/core'

export function semanticClasses(
  base: string,
  style: Partial<SemanticStyle>,
  className?: string,
): string {
  const classes = [base]
  if (style.variant) classes.push(`cms-variant-${style.variant}`)
  if (style.color) classes.push(`cms-color-${style.color}`)
  if (style.align) classes.push(`cms-align-${style.align}`)
  if (style.weight) classes.push(`cms-weight-${style.weight}`)
  if (style.size) classes.push(`cms-size-${style.size}`)
  if (className) classes.push(className)
  return classes.join(' ')
}
