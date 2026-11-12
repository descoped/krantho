'use client'

import type { SemanticStyle } from '@krantho/core'
import React from 'react'
import { tailwindClasses, variantToTag } from './utils'

export interface TailwindCMSTextProps {
  slug: string
  field: string
  variant?: SemanticStyle['variant']
  color?: SemanticStyle['color']
  align?: SemanticStyle['align']
  weight?: SemanticStyle['weight']
  fallback?: string
  className?: string
}

export function CMSText({
  variant,
  color,
  align,
  weight,
  fallback = '',
  className,
}: TailwindCMSTextProps): React.ReactElement {
  const Tag = variantToTag(variant) as keyof React.JSX.IntrinsicElements
  return React.createElement(
    Tag,
    { className: tailwindClasses({ variant, color, align, weight }, className) },
    fallback,
  )
}
