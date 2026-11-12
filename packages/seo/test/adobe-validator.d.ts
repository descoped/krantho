declare module '@adobe/structured-data-validator' {
  /** An issue the validator reports for a node */
  export interface AdobeIssue {
    rootType: string
    severity: 'ERROR' | 'WARNING'
    issueMessage: string
    fieldNames?: string[] | undefined
  }

  /** Validates `@marbec/web-auto-extractor` output; without the Schema.org JSON it runs only its Google rules */
  export default class Validator {
    constructor(schemaOrgJson?: unknown)
    validate(data: { jsonld: Record<string, unknown[]> }): Promise<AdobeIssue[]>
  }
}
