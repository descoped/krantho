import { ApiError } from './api-client.js'

/** Check if an error is a 404 Not Found response. */
export function isNotFound(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404
}

/** Extract a human-readable message from an unknown error value. */
export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}
