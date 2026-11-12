'use client'

import type { ContentData, ContentResult, IContentEngine } from '@krantho/core'
import { ClientFetchLoader, ContentEngineFactory, NetworkError } from '@krantho/core'
import { useEffect, useState } from 'react'
import { usePreloadedContent } from './content-context.js'
import { useCMSConfig } from './use-cms-config.js'

let clientContentEngine: IContentEngine | null = null
let clientContentPath: string | null = null

function getClientContentEngine(contentPath: string): IContentEngine {
  if (!clientContentEngine || clientContentPath !== contentPath) {
    clientContentPath = contentPath
    const fetchLoader = new ClientFetchLoader(contentPath)
    clientContentEngine = ContentEngineFactory.create(fetchLoader, {
      contentPath,
      cacheEnabled: true,
      cacheTTL: 5 * 60 * 1000,
      maxCacheSize: 50,
      enableAtNotation: true,
    })
  }
  return clientContentEngine
}

function emptyContentData(loading: boolean, error: NetworkError | null = null): ContentData {
  return { fields: {}, content: '', html: '', sections: {}, loading, error }
}

function contentResultToContentData(coreResult: ContentResult): ContentData {
  return {
    fields: coreResult.fields,
    content: coreResult.content,
    html: coreResult.html,
    sections: coreResult.sections,
    loading: coreResult.loading,
    error: coreResult.error ? new NetworkError(coreResult.error.message, 500) : null,
  }
}

export function useContent(slug: string): ContentData {
  const config = useCMSConfig()
  const preloaded = usePreloadedContent(slug)

  const [data, setData] = useState<ContentData>(() => {
    if (preloaded) return preloaded
    return emptyContentData(true)
  })

  // Re-run when slug or contentPath changes. `preloaded` is in the dependency
  // array so that if a parent replaces the preloaded map at runtime (rare but
  // possible in SSR hydration edge cases), the effect re-evaluates and skips
  // the network fetch. The `if (preloaded) return` guard is correct for both
  // the initial render and subsequent re-runs.
  useEffect(() => {
    if (preloaded) return

    let cancelled = false

    async function loadContent(): Promise<void> {
      try {
        if (!cancelled) {
          setData((prev) => ({ ...prev, loading: true, error: null }))
        }

        const engine = getClientContentEngine(`${config.contentPath}/pages`)
        const coreResult = await engine.loadContent(slug)

        if (cancelled) return

        const adaptedData = contentResultToContentData(coreResult)

        if (!cancelled) {
          setData(adaptedData)
        }
      } catch (error) {
        if (!cancelled) {
          setData(
            emptyContentData(
              false,
              new NetworkError(
                error instanceof Error ? error.message : 'Unexpected error occurred',
              ),
            ),
          )
        }
      }
    }

    void loadContent()
    return () => {
      cancelled = true
    }
  }, [slug, config.contentPath, preloaded])

  return preloaded || data
}
