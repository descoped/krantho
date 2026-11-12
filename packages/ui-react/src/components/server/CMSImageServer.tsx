import { kranthoField } from '@krantho/core/marks'
import React from 'react'
import { getCMSContent } from '../../server/cms-context'
import type { CMSImageServerProps } from '../../types'
import { semanticClasses } from '../utils'

export async function CMSImageServer({
  collection,
  slug,
  locale,
  field,
  alt,
  width,
  height,
  lazy = false,
  className,
}: CMSImageServerProps): Promise<React.ReactElement> {
  try {
    const content = await getCMSContent(collection, slug, locale ? { locale } : undefined)
    const src = String(content.fields[field] ?? '')
    const altText = alt || String(content.fields[`${field}-alt`] ?? '')

    return React.createElement('img', {
      src,
      alt: altText,
      width,
      height,
      loading: lazy ? 'lazy' : undefined,
      className: semanticClasses('cms-image', {}, className),
      ...kranthoField(content, field),
    })
  } catch (error) {
    if (process.env.NODE_ENV !== 'production')
      console.error(`[CMSImageServer] ${collection}/${slug} field="${field}"`, error)
    return <span />
  }
}
