import { useEffect, useState } from 'react'
import { fetchLLMSettings } from '../lib/api.js'

/** Whether a language model is set up in Setup › AI provider; unknown while unread or unreadable */
export type LlmProvider = 'loading' | 'configured' | 'missing' | 'unknown'

/** Whether enrichment has a language model to run on (`GET /api/settings/llm`) */
export function useLlmProvider(): LlmProvider {
  const [provider, setProvider] = useState<LlmProvider>('loading')
  useEffect(() => {
    let active = true
    fetchLLMSettings()
      .then((settings) => active && setProvider(settings.configured ? 'configured' : 'missing'))
      .catch(() => active && setProvider('unknown'))
    return () => {
      active = false
    }
  }, [])
  return provider
}
