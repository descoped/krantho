import type { SemanticStyle } from '@krantho/core'

export interface MUICMSTextProps {
  slug: string
  field: string
  variant?: SemanticStyle['variant']
  color?: SemanticStyle['color']
  align?: SemanticStyle['align']
  fallback?: string
  className?: string
  component?: string
  gutterBottom?: boolean
}

export interface MUICMSMarkdownProps {
  slug: string
  section?: string
  className?: string
}

export interface MUICMSImageProps {
  slug: string
  field: string
  alt?: string
  width?: number
  height?: number
  lazy?: boolean
  className?: string
}
