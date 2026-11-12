import { request } from './api-client.js'
import type {
  LLMSettings,
  LLMSettingsUpdate,
  LLMTestResult,
  LocaleSettings,
  SiteConfigResponse,
} from './api-types.js'

/** Fetch site configuration */
export async function fetchSiteConfig(): Promise<SiteConfigResponse> {
  return request<SiteConfigResponse>('/site-config')
}

/** Get locale settings */
export async function fetchLocaleSettings(): Promise<LocaleSettings> {
  return request<LocaleSettings>('/settings/locales')
}

/** Choose which of the configured locales are active */
export async function updateLocaleSettings(supportedLocales: string[]): Promise<LocaleSettings> {
  return request<LocaleSettings>('/settings/locales', {
    method: 'PUT',
    body: JSON.stringify({ supportedLocales }),
  })
}

export async function fetchLLMSettings(): Promise<LLMSettings> {
  return request<LLMSettings>('/settings/llm')
}

export async function updateLLMSettings(data: LLMSettingsUpdate): Promise<LLMSettings> {
  return request<LLMSettings>('/settings/llm', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

/** Remove what was saved here for one provider: its key, model and base URL */
export async function deleteLLMSettings(provider: string): Promise<LLMSettings> {
  return request<LLMSettings>(`/settings/llm?provider=${encodeURIComponent(provider)}`, {
    method: 'DELETE',
  })
}

/** Test one provider with a minimal request */
export async function testLLMConnection(provider: string): Promise<LLMTestResult> {
  return request<LLMTestResult>('/settings/llm/test', {
    method: 'POST',
    body: JSON.stringify({ provider }),
  })
}
