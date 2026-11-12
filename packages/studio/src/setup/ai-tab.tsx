import { type ReactElement, useState } from 'react'
import { fetchLLMSettings, type LLMSettings } from '../lib/api.js'
import { useAuth } from '../lib/auth.js'
import { useLoaded } from '../site/use-loaded.js'
import { useProviderActions } from './ai-actions.js'
import { AvailableCard, ConfiguredCard } from './ai-cards.js'
import { DeveloperFold } from './ai-developer.js'
import {
  availableProviders,
  developerProviders,
  modelName,
  providerName,
  readyProviders,
  statusLine,
} from './ai-model.js'
import { LoadError, Loading, SetupSection } from './setup-section.js'
import { SiteRun } from './site-run.js'

interface ProvidersProps {
  settings: LLMSettings
  readOnly: boolean
  onChange: (settings: LLMSettings) => void
}

/** The AIs that are on: which one the site uses, and what can be done with each */
function Configured({ settings, readOnly, onChange }: ProvidersProps): ReactElement | null {
  const actions = useProviderActions(onChange)
  const ready = readyProviders(settings)
  const available = availableProviders(settings)
  return (
    <>
      {ready.length > 0 && (
        <section className="ai-group" aria-labelledby="ai-configured">
          <h3 id="ai-configured" className="ai-group-title">
            Ready to use
          </h3>
          <ul className="ai-cards">
            {ready.map((status) => (
              <ConfiguredCard
                key={status.provider}
                status={status}
                actions={actions}
                readOnly={readOnly}
                onChange={onChange}
              />
            ))}
          </ul>
        </section>
      )}
      {!readOnly && available.length > 0 && (
        <section className="ai-group" aria-labelledby="ai-available">
          <h3 id="ai-available" className="ai-group-title">
            {ready.length > 0 ? 'Add another' : 'Add a key to turn one on'}
          </h3>
          <ul className="ai-cards">
            {available.map((status) => (
              <AvailableCard key={status.provider} status={status} actions={actions} />
            ))}
          </ul>
        </section>
      )}
      {!readOnly && (
        <DeveloperFold
          settings={settings}
          providers={developerProviders(settings)}
          actions={actions}
        />
      )}
    </>
  )
}

/**
 * Setup › AI provider: which AIs are ready, which can be turned on by adding a key, and
 * Run across the site. Read-only below admin, as the API refuses the writes.
 */
export function AiTab(): ReactElement {
  const admin = useAuth().hasRole('admin')
  const { loaded, reload } = useLoaded(fetchLLMSettings, 'The AI provider could not be read')
  const [saved, setSaved] = useState<LLMSettings | null>(null)
  if (loaded.state === 'loading') return <Loading what="the AI provider" />
  if (loaded.state === 'error') return <LoadError message={loaded.message} onRetry={reload} />
  const settings = saved ?? loaded.data
  return (
    <div className="setup-stack">
      <SetupSection
        title="AI help"
        sources={
          <p className="setup-source">
            An AI turns on when it has a key. Pick the one the site uses; the assistant lets editors
            pick another.
          </p>
        }
      >
        <p className={settings.configured ? 'ai-status ai-status--on' : 'ai-status'} role="status">
          {statusLine(settings, admin)}
        </p>
        <Configured settings={settings} readOnly={!admin} onChange={setSaved} />
        {settings.assistantProvider && (
          <p className="setup-note">
            The assistant is set to {providerName(settings.assistantProvider)} in the site's
            configuration.
          </p>
        )}
      </SetupSection>
      <SiteRun configured={settings.configured} admin={admin} model={modelName(settings)} />
    </div>
  )
}
