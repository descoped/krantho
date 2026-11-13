/**
 * JSON value checks for Schema.org data types. A data type absent here
 * (CssSelectorType, XPathType, PronounceableText) is text.
 */

const DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/
const TIME = /^\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/
const DATE_TIME = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/
const BOOLEAN_TEXT = new Set([
  'true',
  'false',
  'True',
  'False',
  'https://schema.org/True',
  'https://schema.org/False',
])

function isAbsoluteUrl(value: string): boolean {
  if (!URL.canParse(value)) return false
  const { protocol } = new URL(value)
  return protocol === 'http:' || protocol === 'https:'
}

function isNumeric(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value)
  return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))
}

function isInteger(value: unknown): boolean {
  return isNumeric(value) && Number.isInteger(Number(value))
}

const CHECKS: Readonly<Record<string, (value: unknown) => boolean>> = {
  Text: (value) => typeof value === 'string',
  URL: (value) => typeof value === 'string' && isAbsoluteUrl(value),
  Date: (value) => typeof value === 'string' && DATE.test(value),
  DateTime: (value) => typeof value === 'string' && DATE_TIME.test(value),
  Time: (value) => typeof value === 'string' && TIME.test(value),
  Number: isNumeric,
  Float: isNumeric,
  Integer: isInteger,
  Boolean: (value) =>
    typeof value === 'boolean' || (typeof value === 'string' && BOOLEAN_TEXT.has(value)),
}

/** Whether a JSON value is a valid literal of the Schema.org data type */
export function matchesDatatype(datatype: string, value: unknown): boolean {
  const check = CHECKS[datatype] ?? CHECKS.Text
  return check?.(value) ?? false
}
