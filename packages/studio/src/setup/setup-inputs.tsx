import { type ReactElement, type ReactNode, useId } from 'react'

/** A label, the control it names, and an optional hint the control is described by */
function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string
  label: string
  hint: ReactNode | undefined
  children: ReactNode
}): ReactElement {
  return (
    <div className="setup-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && (
        <span id={`${id}-hint`} className="setup-hint">
          {hint}
        </span>
      )}
    </div>
  )
}

interface InputProps<Value> {
  label: string
  value: Value
  onChange: (value: Value) => void
  disabled?: boolean | undefined
  hint?: ReactNode | undefined
}

/** A labelled text input, with an optional hint under it */
export function TextInput({
  label,
  value,
  onChange,
  disabled = false,
  hint,
  type = 'text',
  placeholder,
}: InputProps<string> & {
  type?: 'text' | 'email' | 'password' | 'number' | 'url' | undefined
  placeholder?: string | undefined
}): ReactElement {
  const id = useId()
  return (
    <Field id={id} label={label} hint={hint}>
      <input
        id={id}
        type={type}
        className="setup-input"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  )
}

/** A labelled select of string options, each with its own label */
export function SelectInput<Value extends string>({
  label,
  value,
  onChange,
  disabled = false,
  hint,
  options,
}: InputProps<Value> & { options: readonly { value: Value; label: string }[] }): ReactElement {
  const id = useId()
  const choose = (chosen: string): void => {
    const option = options.find((candidate) => candidate.value === chosen)
    if (option) onChange(option.value)
  }
  return (
    <Field id={id} label={label} hint={hint}>
      <select
        id={id}
        className="setup-input"
        value={value}
        disabled={disabled}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(event) => choose(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  )
}

/** A labelled checkbox */
export function CheckInput({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}): ReactElement {
  return (
    <label className="setup-check">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  )
}
