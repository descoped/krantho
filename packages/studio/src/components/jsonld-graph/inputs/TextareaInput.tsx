interface TextareaInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string | undefined
  label?: string | undefined
}

export function TextareaInput({
  value,
  onChange,
  placeholder,
  label,
}: TextareaInputProps): React.ReactElement {
  return (
    <textarea
      className="graph-input graph-input--textarea"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={label}
      rows={3}
    />
  )
}
