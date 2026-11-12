import type { SemanticStyle } from '@krantho/core'

export class ConfigurationError extends Error {
  constructor(
    message: string,
    public context?: string,
  ) {
    super(message)
    this.name = 'ConfigurationError'
  }
}

export interface CMSConfig {
  contentPath?: string
  assetsPath?: string
  imagesPath?: string
  autoReload?: boolean
  errorBoundary?: boolean
  cacheContent?: boolean
}

export interface CMSContent {
  collection: string
  slug: string
  locale: string
  fields: Record<string, unknown>
  html: string
  rawContent: string
  sections: Record<string, string>
  excerpt?: string | undefined
  /** Whether it was read for an editor's preview: the Live marks apply (`kranthoField`) */
  preview: boolean
}

/** A published document without its body: its fields, for a page that only lists documents */
export interface CMSSummary {
  collection: string
  slug: string
  locale: string
  fields: Record<string, unknown>
  /** Whether it was read for an editor's preview: the Live marks apply (`kranthoField`) */
  preview: boolean
}

export interface ContentLoaderOptions {
  processMarkdown?: boolean
  extractSections?: boolean
  generateExcerpt?: boolean
  excerptLength?: number
}

/** Options for listing published summaries in server components */
export interface CMSSummaryOptions {
  /** Omitted: the site's default locale */
  locale?: string | undefined
}

/** Options for reading published content in server components */
export interface CMSContentOptions extends ContentLoaderOptions, CMSSummaryOptions {}

/** Which document a server component renders: a slug in a collection, in a locale */
export interface ContentLocation {
  collection: string
  /** Omitted: the site's default locale */
  locale?: string | undefined
}

export interface CMSTextProps {
  slug: string
  field: string
  variant?: SemanticStyle['variant']
  color?: SemanticStyle['color']
  align?: SemanticStyle['align']
  weight?: SemanticStyle['weight']
  size?: SemanticStyle['size']
  fallback?: string
  className?: string
  component?: string
}

export interface CMSMarkdownProps {
  slug: string
  section?: string
  variant?: SemanticStyle['variant']
  color?: SemanticStyle['color']
  align?: SemanticStyle['align']
  className?: string
}

export type CMSTextServerProps = CMSTextProps & ContentLocation
export type CMSMarkdownServerProps = CMSMarkdownProps & ContentLocation
export type CMSImageServerProps = CMSImageProps & ContentLocation

export interface CMSImageProps {
  slug: string
  field: string
  alt?: string
  width?: number
  height?: number
  lazy?: boolean
  className?: string
}
