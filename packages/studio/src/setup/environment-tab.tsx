import type { ReactElement } from 'react'
import { frameworkLabel, type RuntimeCapabilities, useCapabilities } from '../lib/capabilities.js'
import { Chip } from '../ui/chip.js'
import { type DataColumn, DataTable } from '../ui/data-table.js'
import { SetupSection, ValuesFrom } from './setup-section.js'

/** One line of what the server reports */
export interface EnvironmentRow {
  name: string
  value: string
}

function capabilityName(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())
}

/** The rows: the framework when known, persistence, auth, the schema version when known, then every feature */
export function environmentRows(caps: RuntimeCapabilities): EnvironmentRow[] {
  const rows: EnvironmentRow[] = []
  const framework = frameworkLabel(caps)
  if (framework) rows.push({ name: 'Framework', value: framework })
  rows.push(
    { name: 'Persistence', value: caps.persistence },
    { name: 'Auth', value: caps.authMode },
  )
  if (caps.schemaVersion !== null) {
    rows.push({ name: 'Schema version', value: `v${String(caps.schemaVersion).padStart(3, '0')}` })
  }
  for (const [key, value] of Object.entries(caps.features)) {
    rows.push({ name: capabilityName(key), value })
  }
  return rows
}

/** Off reads as a neutral chip, anything else as on: the value is the server's own word */
function Value({ value }: { value: string }): ReactElement {
  const off = value === 'disabled' || value === 'none'
  return <Chip tone={off ? 'neutral' : 'success'}>{value}</Chip>
}

const COLUMNS: readonly DataColumn<EnvironmentRow>[] = [
  { id: 'name', header: 'Capability', primary: true, cell: (row) => row.name },
  { id: 'value', header: 'Value', cell: (row) => <Value value={row.value} /> },
]

/** Setup › Environment: what the running server reports about itself, read-only */
export function EnvironmentTab(): ReactElement {
  const caps = useCapabilities()
  return (
    <SetupSection
      title="Environment"
      sources={
        <ValuesFrom source="server">
          What the running server reports (<code>GET /api/capabilities</code>), read-only. It
          follows the configuration and the persistence the server started with.
        </ValuesFrom>
      }
    >
      <DataTable
        caption="What the server reports"
        columns={COLUMNS}
        rows={environmentRows(caps)}
        rowKey={(row) => row.name}
      />
    </SetupSection>
  )
}
