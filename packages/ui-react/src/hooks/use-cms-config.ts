'use client'

import { useContext } from 'react'
import { CMSContext } from '../context.js'
import type { CMSConfig } from '../types.js'
import { ConfigurationError } from '../types.js'

export function useCMSConfig(): CMSConfig {
  const config = useContext(CMSContext)
  if (!config) {
    throw new ConfigurationError('useCMSConfig must be used within CMSProvider', 'React Context')
  }
  return config
}
