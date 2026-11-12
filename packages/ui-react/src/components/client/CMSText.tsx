'use client'

import { kranthoField } from '@krantho/core/marks'
import React from 'react'
import { useContent } from '../../hooks/use-content'
import type { CMSTextProps } from '../../types'
import { semanticClasses, variantToTag } from '../utils'

export function CMSText({
  slug,
  field,
  variant,
  color,
  align,
  weight,
  size,
  fallback = '',
  className,
  component,
}: CMSTextProps): React.ReactElement {
  const { fields, document } = useContent(slug)
  const text = String(fields[field] ?? fallback)
  const Tag = (component || variantToTag(variant)) as keyof React.JSX.IntrinsicElements

  return React.createElement(
    Tag,
    {
      className: semanticClasses('cms-text', { variant, color, align, weight, size }, className),
      ...kranthoField(document, field),
    },
    text,
  )
}
