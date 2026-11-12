/** A document's fields as text for markup: a missing field is empty. Pure, so pages can import it. */
export function textFields(fields: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, value == null ? '' : String(value)]),
  )
}
