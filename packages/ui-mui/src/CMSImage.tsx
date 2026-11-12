'use client'

import { Box } from '@mui/material'
import React from 'react'
import type { MUICMSImageProps } from './types'

export function CMSImage({
  slug,
  field,
  alt = '',
  width,
  height,
  lazy = true,
  className,
}: MUICMSImageProps): React.ReactElement {
  return React.createElement(
    Box,
    {
      className,
      sx: { position: 'relative', width: '100%', height: 'auto', maxWidth: '100%' },
    },
    React.createElement('img', {
      alt,
      width,
      height,
      loading: lazy ? 'lazy' : undefined,
      style: { width: '100%', height: 'auto', objectFit: 'cover' },
    }),
  )
}
