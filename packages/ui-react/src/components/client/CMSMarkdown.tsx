'use client'

import { kranthoSection, markBodySections } from '@krantho/core/marks'
import React from 'react'
import { useContent } from '../../hooks/use-content'
import type { CMSMarkdownProps } from '../../types'
import { semanticClasses } from '../utils'

export function CMSMarkdown({
  slug,
  section,
  variant,
  color,
  align,
  className,
}: CMSMarkdownProps): React.ReactElement {
  const { html, sections, content, document } = useContent(slug)
  const rendered = section ? (sections[section] ?? '') : markBodySections(html, content, document)

  return React.createElement('div', {
    className: semanticClasses('cms-markdown', { variant, color, align }, className),
    ...(section ? kranthoSection(document, section) : {}),
    dangerouslySetInnerHTML: { __html: rendered },
  })
}
