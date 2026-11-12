import { readFileSync, writeFileSync } from 'node:fs'
import { stringify as stringifyYAML } from 'yaml'

/** Shared YAML stringification options for consistent output across all tools */
export const YAML_WRITE_OPTIONS = {
  singleQuote: true,
  defaultStringType: 'QUOTE_SINGLE' as const,
  defaultKeyType: 'PLAIN' as const,
  lineWidth: 0,
}

/** Stringify data to YAML, preserving any leading comment header from the original file */
export function writeYAMLWithHeader(filePath: string, data: unknown, header?: string): void {
  const yaml = stringifyYAML(data, YAML_WRITE_OPTIONS)

  if (header != null) {
    writeFileSync(filePath, header + yaml)
    return
  }

  // Preserve existing header comment if present
  try {
    const existing = readFileSync(filePath, 'utf-8')
    const commentMatch = existing.match(/^(#[^\n]*\n)/)
    const existingHeader = commentMatch ? commentMatch[1] : ''
    writeFileSync(filePath, existingHeader + yaml)
  } catch {
    writeFileSync(filePath, yaml)
  }
}
