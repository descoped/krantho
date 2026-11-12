interface NumberInputProps {
  value: number | string
  onChange: (value: number | string) => void
  label?: string | undefined
  min?: number | undefined
  max?: number | undefined
}

export function NumberInput({
  value,
  onChange,
  label,
  min,
  max,
}: NumberInputProps): React.ReactElement {
  return (
    <input
      type="number"
      className="graph-input graph-input--number"
      value={value}
      onChange={(e) => {
        const raw = e.target.value
        onChange(raw === '' ? '' : Number(raw))
      }}
      aria-label={label}
      min={min}
      max={max}
    />
  )
}
