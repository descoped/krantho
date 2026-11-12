/** Every problem found while resolving the configuration, reported at once */
export class KranthoConfigError extends Error {
  readonly issues: readonly string[]

  constructor(issues: readonly string[]) {
    const body = issues.map((issue) => `  - ${issue}`).join('\n')
    super(`Invalid krantho configuration:\n${body}`)
    this.name = 'KranthoConfigError'
    this.issues = issues
  }
}
