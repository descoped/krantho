'use client'

import React from 'react'
import { tailwindClasses } from './utils'

export interface TailwindCMSMarkdownProps {
  slug: string
  section?: string
  className?: string
}

export function CMSMarkdown({ className }: TailwindCMSMarkdownProps): React.ReactElement {
  return React.createElement('div', {
    className: tailwindClasses({}, `prose ${className ?? ''}`),
  })
}
