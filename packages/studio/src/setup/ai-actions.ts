import {
  type LLMSettings,
  type LLMSettingsUpdate,
  testLLMConnection,
  updateLLMSettings,
} from '../lib/api.js'
import { errorMessage } from '../lib/fetch.js'
import { useToast } from '../ui/toast.js'
import { providerName, testSentence } from './ai-model.js'
import { useSingleFlight } from './use-busy-action.js'

/** What a person can do with a provider; one at a time, a toast saying how each went */
export interface ProviderActions {
  busy: boolean
  /** Save a key (or an address) and check at once that it works */
  turnOn: (update: LLMSettingsUpdate) => void
  /** Use this one for the site */
  use: (provider: string) => void
  /** Save a model and an address, nothing else */
  save: (update: LLMSettingsUpdate) => void
  test: (provider: string) => void
}

/** Save, use and test providers: each answers the person in a sentence, not a status code */
export function useProviderActions(onChange: (settings: LLMSettings) => void): ProviderActions {
  const toast = useToast()
  const { busy, once } = useSingleFlight()

  function act(work: () => Promise<void>, failure: string): void {
    void once(async () => {
      try {
        await work()
      } catch (err: unknown) {
        toast({ text: errorMessage(err, failure), tone: 'error' })
      }
    })
  }

  async function check(provider: string): Promise<void> {
    const result = await testLLMConnection(provider)
    toast({ text: testSentence(provider, result), tone: result.success ? 'success' : 'error' })
  }

  return {
    busy,
    turnOn: (update) =>
      act(async () => {
        onChange(await updateLLMSettings(update))
        await check(update.provider)
      }, 'The key could not be saved'),
    use: (provider) =>
      act(async () => {
        onChange(await updateLLMSettings({ provider, use: true }))
        toast({ text: `The site now uses ${providerName(provider)}.` })
      }, 'The AI could not be changed'),
    save: (update) =>
      act(async () => {
        onChange(await updateLLMSettings(update))
        toast({ text: `Saved the settings for ${providerName(update.provider)}.` })
      }, 'The settings could not be saved'),
    test: (provider) => act(() => check(provider), 'The test failed'),
  }
}
