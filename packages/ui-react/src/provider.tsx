'use client'

import type { ReactElement, ReactNode } from 'react'
import { useMemo } from 'react'
import { CMSContext, defaultConfig } from './context.js'
import type { CMSConfig } from './types.js'

interface CMSProviderProps {
  children: ReactNode
  config?: Partial<CMSConfig>
}

export function CMSProvider({ children, config = {} }: CMSProviderProps): ReactElement {
  const contentPath = config.contentPath
  const assetsPath = config.assetsPath
  const imagesPath = config.imagesPath
  const autoReload = config.autoReload
  const errorBoundary = config.errorBoundary
  const cacheContent = config.cacheContent

  const mergedConfig = useMemo((): CMSConfig => {
    const overrides = Object.fromEntries(
      Object.entries({
        contentPath,
        assetsPath,
        imagesPath,
        autoReload,
        errorBoundary,
        cacheContent,
      }).filter(([, v]) => v != null),
    )
    return { ...defaultConfig, ...overrides }
  }, [contentPath, assetsPath, imagesPath, autoReload, errorBoundary, cacheContent])

  return <CMSContext.Provider value={mergedConfig}>{children}</CMSContext.Provider>
}
