'use client'

import type { ContentData } from '@krantho/core'
import React, { createContext, type ReactNode, useContext } from 'react'

type ContentCache = Record<string, ContentData>

const CMSContentContext = createContext<ContentCache>({})

export function CMSContentProvider({
  data,
  children,
}: {
  data: ContentCache
  children: ReactNode
}): React.ReactElement {
  return <CMSContentContext.Provider value={data}>{children}</CMSContentContext.Provider>
}

export function usePreloadedContent(slug: string): ContentData | null {
  const cache = useContext(CMSContentContext)
  return cache[slug] || null
}
