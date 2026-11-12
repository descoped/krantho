import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { envReference } from '../src/index.js'

/** Regenerate `docs/configuration.md` from the leaf registry. */
const target = join(import.meta.dirname, '..', '..', '..', 'docs', 'configuration.md')
writeFileSync(target, envReference(), 'utf8')
console.log(`Wrote ${target}`)
