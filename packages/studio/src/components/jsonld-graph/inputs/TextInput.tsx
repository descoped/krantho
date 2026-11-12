interface TextInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string | undefined
  label?: string | undefined
}

export function TextInput({
  value,
  onChange,
  placeholder,
  label,
}: TextInputProps): React.ReactElement {
  return (
    <input
      type="text"
      className="graph-input graph-input--text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={label}
    />
  )
}
