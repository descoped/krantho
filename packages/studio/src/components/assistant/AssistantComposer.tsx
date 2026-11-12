import { Send, Square } from 'lucide-react'
import type { RefObject } from 'react'
import { useState } from 'react'
import { buttonClass } from '../../ui/button.js'

interface AssistantComposerProps {
  disabled: boolean
  streaming: boolean
  onSend: (text: string) => void
  onStop: () => void
  inputRef: RefObject<HTMLTextAreaElement | null>
}

/** The message box: Enter sends, Shift+Enter starts a new line; Stop while a reply streams */
export function AssistantComposer({
  disabled,
  streaming,
  onSend,
  onStop,
  inputRef,
}: AssistantComposerProps): React.ReactElement {
  const [text, setText] = useState('')
  const canSend = !disabled && !streaming && text.trim() !== ''

  const submit = (): void => {
    if (!canSend) return
    onSend(text)
    setText('')
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    submit()
  }

  return (
    <form
      className="assistant-composer"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <label htmlFor="assistant-input" className="assistant-sr-only">
        Ask the assistant
      </label>
      <textarea
        id="assistant-input"
        ref={inputRef}
        className="assistant-input"
        rows={3}
        placeholder="Ask the assistant"
        value={text}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
      />
      {streaming ? (
        <button
          type="button"
          className={buttonClass('secondary', 'md', 'assistant-send')}
          onClick={onStop}
        >
          <Square aria-hidden="true" />
          Stop
        </button>
      ) : (
        <button
          type="submit"
          className={buttonClass('primary', 'md', 'assistant-send')}
          disabled={!canSend}
        >
          <Send aria-hidden="true" />
          Send
        </button>
      )}
    </form>
  )
}
