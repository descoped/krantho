import { type ReactElement, useState } from 'react'
import type { LLMProviderStatus, LLMSettings } from '../lib/api.js'
import { Button } from '../ui/button.js'
import type { ProviderActions } from './ai-actions.js'
import { AvailableCard } from './ai-cards.js'
import { CLAUDE_CODE, LOCAL_MODEL, presetOf, providerName } from './ai-model.js'
import { TextInput } from './setup-inputs.js'

interface DeveloperProps {
  status: LLMProviderStatus
  actions: ProviderActions
}

/** The subscription provider has no key to paste: its token is set where the site runs */
function SubscriptionCard({ status }: Pick<DeveloperProps, 'status'>): ReactElement {
  return (
    <li className="ai-card">
      <h3 className="ai-card-name">{providerName(status.provider)}</h3>
      <p className="setup-note">
        Runs on your Claude subscription, on your own machine only. Set the token{' '}
        <code>claude setup-token</code> prints as <code>{status.env}</code>, and restart the site.
      </p>
    </li>
  )
}

/** A model on the person's own computer: an address, and no key */
function LocalModelCard({ status, actions }: DeveloperProps): ReactElement {
  const preset = presetOf(status.provider)
  const [model, setModel] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const turnOn = (): void => actions.save({ provider: status.provider, model, baseUrl, use: true })
  return (
    <li className="ai-card">
      <h3 className="ai-card-name">{providerName(status.provider)}</h3>
      <p className="setup-note">Runs a model on your own computer. It needs no key.</p>
      <TextInput
        label="Model"
        value={model}
        onChange={setModel}
        placeholder={preset?.defaultModel}
      />
      <TextInput
        label="Address"
        type="url"
        value={baseUrl}
        onChange={setBaseUrl}
        placeholder={preset?.baseUrl}
      />
      <div className="setup-actions">
        <Button variant="primary" aria-disabled={actions.busy} onClick={turnOn}>
          Turn on
        </Button>
      </div>
    </li>
  )
}

function DeveloperCard({ status, actions }: DeveloperProps): ReactElement {
  if (status.provider === CLAUDE_CODE) return <SubscriptionCard status={status} />
  if (status.provider === LOCAL_MODEL) return <LocalModelCard status={status} actions={actions} />
  return <AvailableCard status={status} actions={actions} />
}

export interface DeveloperFoldProps {
  settings: LLMSettings
  /** The providers a developer sets up that are not on yet */
  providers: LLMProviderStatus[]
  actions: ProviderActions
}

/** The setup that is for developers, out of the way: the other providers, and the variables a key can be set in */
export function DeveloperFold({ settings, providers, actions }: DeveloperFoldProps): ReactElement {
  const keyed = settings.providers.filter((entry) => entry.env !== '')
  return (
    <details className="ai-developer">
      <summary>For developers</summary>
      <div className="setup-stack">
        {providers.length > 0 && (
          <ul className="ai-cards">
            {providers.map((status) => (
              <DeveloperCard key={status.provider} status={status} actions={actions} />
            ))}
          </ul>
        )}
        <div className="setup-prose">
          <p>
            A key can also be set in the environment of the machine that runs the site. A provider
            with a key there turns on at the next start, and no key is saved in the database.
          </p>
          <ul className="ai-variables">
            {keyed.map((entry) => (
              <li key={entry.provider}>
                {providerName(entry.provider)}: <code>{entry.env}</code>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  )
}
