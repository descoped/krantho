/** Where the browser lands after a sign-in or refresh when the request names nowhere */
const DEFAULT_RETURN_TO = '/studio/'

/**
 * The path from `?returnTo=`, kept only when it is a same-origin path —
 * anything that could leave the site (`//host`, `/\host`, a scheme, control
 * characters) falls back to Studio.
 */
export function safeReturnTo(value: string | undefined): string {
  if (!value?.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return DEFAULT_RETURN_TO
  }
  const hasControlCharacter = [...value].some((ch) => ch <= '\u001f' || ch === '\u007f')
  return hasControlCharacter ? DEFAULT_RETURN_TO : value
}
