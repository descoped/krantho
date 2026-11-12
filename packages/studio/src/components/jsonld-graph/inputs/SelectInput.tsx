interface SelectInputProps {
  value: string
  onChange: (value: string) => void
  options: readonly string[]
  label?: string | undefined
}

export function SelectInput({
  value,
  onChange,
  options,
  label,
}: SelectInputProps): React.ReactElement {
  return (
    <select
      className="graph-input graph-input--select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
    >
      <option value="">Select…</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  )
}
