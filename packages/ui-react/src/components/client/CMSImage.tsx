'use client'

import { kranthoField } from '@krantho/core/marks'
import React from 'react'
import { useContent } from '../../hooks/use-content'
import type { CMSImageProps } from '../../types'
import { semanticClasses } from '../utils'

export function CMSImage({
  slug,
  field,
  alt,
  width,
  height,
  lazy = true,
  className,
}: CMSImageProps): React.ReactElement {
  const { fields, document } = useContent(slug)
  const src = String(fields[field] ?? '')
  // Prefer the explicit `alt` prop; otherwise look for a sibling `${field}-alt`
  // CMS field. Result is always a string (empty string for missing alt is
  // semantically different from undefined and signals "decorative image").
  const resolvedAlt = alt || String(fields[`${field}-alt`] ?? '')

  return React.createElement('img', {
    src,
    alt: resolvedAlt,
    width,
    height,
    loading: lazy ? 'lazy' : undefined,
    className: semanticClasses('cms-image', {}, className),
    ...kranthoField(document, field),
  })
}
