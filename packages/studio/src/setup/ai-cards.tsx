import { Check, KeyRound, PlugZap, Power, Trash2 } from 'lucide-react'
import { type ReactElement, useState } from 'react'
import { ActionButton } from '../editor/action-button.js'
import { deleteLLMSettings, type LLMProviderStatus, type LLMSettings } from '../lib/api.js'
import { Button } from '../ui/button.js'
import { Chip } from '../ui/chip.js'
import { useToast } from '../ui/toast.js'
import type { ProviderActions } from './ai-actions.js'
import { CLAUDE_CODE, keySourceText, presetOf, providerName, vendorName } from './ai-model.js'
import { ConfirmModal } from './confirm-modal.js'
import { TextInput } from './setup-inputs.js'

interface CardProps {
  status: LLMProviderStatus
  actions: ProviderActions
}

/** The name of the AI and who makes it */
function CardTitle({ provider }: { provider: string }): ReactElement {
  return (
    <div className="ai-card-title">
      <h3 className="ai-card-name">{providerName(provider)}</h3>
      <span className="setup-muted">{vendorName(provider)}</span>
    </div>
  )
}

/** Remove the key saved here for one provider, behind a confirmation saying what stays */
function RemoveKey({
  provider,
  onRemoved,
  onClose,
}: {
  provider: string
  onRemoved: (settings: LLMSettings) => void
  onClose: () => void
}): ReactElement {
  const toast = useToast()
  async function remove(): Promise<void> {
    onRemoved(await deleteLLMSettings(provider))
    toast({ text: `Removed the saved key for ${providerName(provider)}.` })
    onClose()
  }
  return (
    <ConfirmModal
      title={`Remove the key for ${providerName(provider)}?`}
      confirmLabel="Remove key"
      danger
      onConfirm={remove}
      onClose={onClose}
    >
      <p>
        The key saved here is deleted, and it cannot be shown again: you would have to paste it
        anew. A key set up by your developer is not touched.
      </p>
    </ConfirmModal>
  )
}

/** Model and address, for the few who need them: empty uses the AI's own */
function Advanced({ status, actions }: CardProps): ReactElement {
  const preset = presetOf(status.provider)
  const [model, setModel] = useState(status.model ?? '')
  const [baseUrl, setBaseUrl] = useState(status.baseUrl ?? '')
  const fixed = status.provider === CLAUDE_CODE
  return (
    <details className="ai-advanced">
      <summary>Advanced</summary>
      <div className="setup-stack">
        <TextInput
          label="Model"
          value={fixed ? (preset?.defaultModel ?? '') : model}
          onChange={setModel}
          disabled={fixed}
          placeholder={preset?.defaultModel}
          hint={fixed ? 'Fixed: this one runs a single model.' : 'Empty uses the default model.'}
        />
        <TextInput
          label="Address"
          type="url"
          value={baseUrl}
          onChange={setBaseUrl}
          placeholder={preset?.baseUrl}
          hint="Only for a proxy or your own server. Empty uses the usual address."
        />
        <div className="setup-actions">
          <Button
            aria-disabled={actions.busy}
            onClick={() => actions.save({ provider: status.provider, model, baseUrl })}
          >
            Save
          </Button>
        </div>
      </div>
    </details>
  )
}

export interface ConfiguredCardProps extends CardProps {
  /** Only admins change anything: the API refuses others */
  readOnly: boolean
  onChange: (settings: LLMSettings) => void
}

/** An AI that is on: whether the site uses it, where its key is from, and what can be done with it */
export function ConfiguredCard({
  status,
  actions,
  readOnly,
  onChange,
}: ConfiguredCardProps): ReactElement {
  const [removing, setRemoving] = useState(false)
  const busyReason = actions.busy ? 'Working…' : null
  return (
    <li className="ai-card ai-card--on">
      <div className="ai-card-head">
        <CardTitle provider={status.provider} />
        {status.active && (
          <Chip tone="success" icon={Check}>
            In use
          </Chip>
        )}
      </div>
      <p className="setup-note">{keySourceText(status.keySource)}</p>
      {!readOnly && (
        <div className="setup-actions">
          {!status.active && (
            <ActionButton
              variant="primary"
              icon={Power}
              reason={busyReason}
              onClick={() => actions.use(status.provider)}
            >
              Use this one
            </ActionButton>
          )}
          <ActionButton
            icon={PlugZap}
            reason={busyReason}
            onClick={() => actions.test(status.provider)}
          >
            Test
          </ActionButton>
          {status.keySource === 'saved' && (
            <Button variant="ghost" icon={Trash2} onClick={() => setRemoving(true)}>
              Remove key
            </Button>
          )}
        </div>
      )}
      {!readOnly && <Advanced status={status} actions={actions} />}
      {removing && (
        <RemoveKey
          provider={status.provider}
          onRemoved={onChange}
          onClose={() => setRemoving(false)}
        />
      )}
    </li>
  )
}

/** An AI that is off: paste its key and it turns on, and is tested at once */
export function AvailableCard({ status, actions }: CardProps): ReactElement {
  const [apiKey, setApiKey] = useState('')
  const name = providerName(status.provider)
  const turnOn = (): void => {
    actions.turnOn({ provider: status.provider, apiKey })
    setApiKey('')
  }
  const reason = actions.busy ? 'Working…' : apiKey.trim() === '' ? 'Paste the key first.' : null
  return (
    <li className="ai-card">
      <div className="ai-card-head">
        <CardTitle provider={status.provider} />
      </div>
      <TextInput
        label={`${name} key`}
        type="password"
        value={apiKey}
        onChange={setApiKey}
        hint={`Paste the key from ${vendorName(status.provider)}. It is saved encrypted and never shown again.`}
      />
      <div className="setup-actions">
        <ActionButton variant="primary" icon={KeyRound} reason={reason} onClick={turnOn}>
          Turn on
        </ActionButton>
      </div>
    </li>
  )
}
