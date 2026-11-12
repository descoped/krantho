'use client'

import { Box } from '@mui/material'
import type React from 'react'
import type { MUICMSMarkdownProps } from './types'

export function CMSMarkdown({ className }: MUICMSMarkdownProps): React.ReactElement {
  return <Box className={className} />
}
