#!/usr/bin/env node
/**
 * Load an env file when it exists, then run a script in this process:
 *
 *   node ../../scripts/with-env.mjs ../../.env node_modules/next/dist/bin/next dev
 *
 * The same as `node --env-file-if-exists=<file> <script>`, without the flag:
 * `next dev` copies its own Node flags into the NODE_OPTIONS of the server it
 * starts, and Node refuses `--env-file` there. The variables loaded here reach
 * that server through the environment instead.
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const [envFile, script, ...args] = process.argv.slice(2)
if (!envFile || !script) {
  console.error('Usage: node scripts/with-env.mjs <env file> <script> [args…]')
  process.exit(1)
}

if (existsSync(envFile)) process.loadEnvFile(envFile)

// The script runs in this process, as if Node had started it: it must read its
// arguments from process.argv, which a CLI entry such as Next's does
const path = resolve(script)
process.argv = [process.argv[0], path, ...args]
await import(pathToFileURL(path).href)
