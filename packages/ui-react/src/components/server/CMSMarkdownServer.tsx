import { kranthoSection, markBodySections } from '@krantho/core/marks'
import React from 'react'
import { getCMSContent } from '../../server/cms-context'
import type { CMSMarkdownServerProps } from '../../types'
import { semanticClasses } from '../utils'

export async function CMSMarkdownServer({
  collection,
  slug,
  locale,
  section,
  variant,
  color,
  align,
  className,
}: CMSMarkdownServerProps): Promise<React.ReactElement> {
  try {
    const content = await getCMSContent(collection, slug, locale ? { locale } : undefined)
    const html = section
      ? (content.sections[section] ?? '')
      : markBodySections(content.html, content.rawContent, content)

    return React.createElement('div', {
      className: semanticClasses('cms-markdown', { variant, color, align }, className),
      ...(section ? kranthoSection(content, section) : {}),
      dangerouslySetInnerHTML: { __html: html },
    })
  } catch (error) {
    if (process.env.NODE_ENV !== 'production')
      console.error(`[CMSMarkdownServer] ${collection}/${slug}`, error)
    return <div />
  }
}
