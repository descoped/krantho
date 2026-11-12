import { useState } from 'react'

interface UrlInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string | undefined
  label?: string | undefined
}

export function UrlInput({
  value,
  onChange,
  placeholder,
  label,
}: UrlInputProps): React.ReactElement {
  const [touched, setTouched] = useState(false)
  const isValid = value === '' || isValidUrl(value)

  return (
    <input
      type="url"
      className={`graph-input graph-input--url ${touched && !isValid ? 'graph-input--invalid' : ''}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => setTouched(true)}
      placeholder={placeholder ?? 'https://'}
      aria-label={label}
      aria-invalid={touched && !isValid}
    />
  )
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}
