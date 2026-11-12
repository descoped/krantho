import React from 'react'
import { variantToTag } from '@krantho/core'
import { useContent } from '../hooks/use-content'

interface CMSTextProps {
  slug: string
  field: string
  variant?: string
  component?: string
  className?: string
}

export function CMSText({ slug, field, variant = 'body1', component, className }: CMSTextProps) {
  const { fields } = useContent(slug)
  const text = String(fields[field] ?? '')
  const Tag = (component ?? variantToTag(variant)) as keyof React.JSX.IntrinsicElements
  const classes = ['cms-text', variant && `cms-variant-${variant}`, className].filter(Boolean).join(' ')
  return React.createElement(Tag, { className: classes }, text)
}
