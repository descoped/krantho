import type { SemanticStyle } from '@krantho/core'

const VARIANT_CLASSES: Record<string, string> = {
  h1: 'text-4xl font-bold tracking-tight',
  h2: 'text-3xl font-semibold tracking-tight',
  h3: 'text-2xl font-semibold',
  h4: 'text-xl font-semibold',
  h5: 'text-lg font-medium',
  h6: 'text-base font-medium',
  body1: 'text-base',
  body2: 'text-sm',
  caption: 'text-xs text-gray-500',
}

const COLOR_CLASSES: Record<string, string> = {
  primary: 'text-blue-600',
  secondary: 'text-gray-600',
  error: 'text-red-600',
  warning: 'text-amber-600',
  info: 'text-sky-600',
  success: 'text-green-600',
  inherit: '',
}

const ALIGN_CLASSES: Record<string, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
  justify: 'text-justify',
}

const WEIGHT_CLASSES: Record<string, string> = {
  light: 'font-light',
  regular: 'font-normal',
  medium: 'font-medium',
  bold: 'font-bold',
}

export { variantToTag } from '@krantho/core'

export function tailwindClasses(style: Partial<SemanticStyle>, className?: string): string {
  const classes: string[] = []
  if (style.variant) classes.push(VARIANT_CLASSES[style.variant] ?? '')
  if (style.color) classes.push(COLOR_CLASSES[style.color] ?? '')
  if (style.align) classes.push(ALIGN_CLASSES[style.align] ?? '')
  if (style.weight) classes.push(WEIGHT_CLASSES[style.weight] ?? '')
  if (className) classes.push(className)
  return classes.filter(Boolean).join(' ')
}
