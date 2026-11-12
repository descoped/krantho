import type { MarkedDocument } from './marks.js'

export class NetworkError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message)
    this.name = 'NetworkError'
  }
}

export interface ContentData {
  fields: Record<string, unknown>
  content: string
  html: string
  sections: Record<string, string>
  loading: boolean
  error: NetworkError | null
  /** The document this content is, for preview-only Live marks; a host that preloads content fills it */
  document?: MarkedDocument | undefined
}
