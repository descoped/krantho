'use client'

import { createContext } from 'react'
import type { CMSConfig } from './types.js'

export const CMSContext = createContext<CMSConfig | null>(null)

export const defaultConfig: CMSConfig = {
  contentPath: '/content',
  assetsPath: '/assets',
  imagesPath: '/images',
  autoReload: process.env.NODE_ENV === 'development',
  errorBoundary: true,
  cacheContent: process.env.NODE_ENV === 'production',
}
