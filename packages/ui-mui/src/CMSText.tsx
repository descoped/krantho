'use client'

import { Typography } from '@mui/material'
import type React from 'react'
import type { MUICMSTextProps } from './types'

export function CMSText({
  variant = 'body1',
  color = 'inherit',
  align,
  fallback = '',
  className,
  gutterBottom,
}: MUICMSTextProps): React.ReactElement {
  return (
    <Typography
      variant={variant}
      color={color}
      align={align}
      className={className}
      gutterBottom={gutterBottom}
    >
      {fallback}
    </Typography>
  )
}
