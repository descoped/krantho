import React from 'react'
import { useContent } from '../hooks/use-content'

interface CMSMarkdownProps {
  slug: string
  section?: string
  className?: string
}

export function CMSMarkdown({ slug, section, className }: CMSMarkdownProps) {
  const { html, sections } = useContent(slug)
  const content = section ? (sections[section] ?? '') : html
  const classes = ['cms-markdown', className].filter(Boolean).join(' ')
  return React.createElement('div', { className: classes, dangerouslySetInnerHTML: { __html: content } })
}
