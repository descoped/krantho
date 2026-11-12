import { ApiError } from '../lib/api-client.js'
import { lockHolderName } from '../lib/locks.js'

/** A failed save or publish, as the editor shows it */
export interface SaveFailure {
  message: string
  /** Messages per field: the schema's validation, or a refused slug */
  fieldErrors: Record<string, string>
  /** Someone else holds the edit lock: their name */
  lockedBy?: string | undefined
  /** A newer version was saved than the one the work is based on: that version */
  conflictWith?: number | undefined
}

/** A save the editor refuses before asking the API, because of one field */
export class FieldRefusal extends Error {
  readonly field: string
  constructor(field: string, message: string) {
    super(message)
    this.name = 'FieldRefusal'
    this.field = field
  }
}

function validationErrors(details: unknown): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!Array.isArray(details)) return errors
  for (const detail of details) {
    if (typeof detail !== 'object' || detail === null) continue
    const { field, message } = detail as { field?: unknown; message?: unknown }
    if (typeof field === 'string' && typeof message === 'string')
      errors[field.startsWith('fields.') ? field.slice(7) : field] = message
  }
  return errors
}

/**
 * A version conflict: says what happened, and never suggests overwriting.
 * Whether the work is also kept in this browser is the notice's to say.
 */
function conflict(current: number, yours: unknown): SaveFailure {
  const base = typeof yours === 'number' ? `v${yours}` : 'the version you opened'
  return {
    message: `v${current} was saved after ${base}, the version your changes are based on. Nothing was saved; your changes are still in the form.`,
    fieldErrors: {},
    conflictWith: current,
  }
}

function apiFailure(err: ApiError, fallback: string): SaveFailure {
  const { body } = err
  if (err.status === 409 && typeof body.currentVersion === 'number') {
    return conflict(body.currentVersion, body.yourVersion)
  }
  if (err.status === 423 && typeof body.lockedBy === 'string') {
    const holder = lockHolderName(body.lockedBy)
    return { message: `${holder} is editing this document.`, fieldErrors: {}, lockedBy: holder }
  }
  const fieldErrors = validationErrors(body.details)
  if (Object.keys(fieldErrors).length > 0) {
    return {
      message: 'Some fields are not valid. Fix the marked fields and save again.',
      fieldErrors,
    }
  }
  return { message: err.message || fallback, fieldErrors: {} }
}

/** What went wrong: a refused field, a version conflict, a lock, invalid fields, or else the message */
export function saveFailure(err: unknown, fallback: string): SaveFailure {
  if (err instanceof FieldRefusal) {
    return { message: err.message, fieldErrors: { [err.field]: err.message } }
  }
  if (err instanceof ApiError) return apiFailure(err, fallback)
  return { message: err instanceof Error ? err.message : fallback, fieldErrors: {} }
}
