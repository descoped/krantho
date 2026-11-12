import { kranthoField } from '@krantho/core/marks'
import React from 'react'
import { getCMSContent } from '../../server/cms-context'
import type { CMSTextServerProps } from '../../types'
import { semanticClasses, variantToTag } from '../utils'

export async function CMSTextServer({
  collection,
  slug,
  locale,
  field,
  variant,
  color,
  align,
  weight,
  size,
  fallback = '',
  className,
  component,
}: CMSTextServerProps): Promise<React.ReactElement> {
  try {
    const content = await getCMSContent(collection, slug, locale ? { locale } : undefined)
    const text = String(content.fields[field] ?? fallback)
    const Tag = (component || variantToTag(variant)) as keyof React.JSX.IntrinsicElements

    return React.createElement(
      Tag,
      {
        className: semanticClasses('cms-text', { variant, color, align, weight, size }, className),
        ...kranthoField(content, field),
      },
      text,
    )
  } catch (error) {
    if (process.env.NODE_ENV !== 'production')
      console.error(`[CMSTextServer] ${collection}/${slug} field="${field}"`, error)
    return <span>{fallback}</span>
  }
}
