interface DateInputProps {
  value: string
  onChange: (value: string) => void
  label?: string | undefined
}

export function DateInput({ value, onChange, label }: DateInputProps): React.ReactElement {
  return (
    <input
      type="date"
      className="graph-input graph-input--date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
    />
  )
}
