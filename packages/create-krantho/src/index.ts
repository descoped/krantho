#!/usr/bin/env node

import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ProjectOptions } from './prompts.js'
import { runPrompts } from './prompts.js'
import { generateFiles } from './scaffold.js'

/**
 * Validate the target project directory. Exits the process with a message if
 * the directory already exists and is non-empty — krantho refuses to scaffold
 * on top of existing files to avoid clobbering the user's work.
 */
function validateProjectDir(projectDir: string, name: string): void {
  if (!existsSync(projectDir)) return

  let entries: string[] = []
  try {
    entries = readdirSync(projectDir)
  } catch {
    // Directory exists but isn't readable — treat as "empty" and continue.
    return
  }

  if (entries.length > 0) {
    console.error(`\nError: Directory "${name}" is not empty.`)
    process.exit(1)
  }
}

/**
 * Write every scaffold file to disk, creating parent directories as needed.
 */
function scaffoldProject(projectDir: string, options: ProjectOptions): void {
  mkdirSync(projectDir, { recursive: true })
  const files = generateFiles(options)
  for (const [filePath, content] of files) {
    const fullPath = resolve(projectDir, filePath)
    mkdirSync(resolve(fullPath, '..'), { recursive: true })
    writeFileSync(fullPath, content, 'utf-8')
  }
}

/**
 * Install dependencies using the user-selected package manager. Failures are
 * non-fatal — print the manual command and continue.
 */
function installDependencies(projectDir: string, pm: string): void {
  console.log(`Installing dependencies with ${pm}...`)
  try {
    execSync(`${pm} install`, { cwd: projectDir, stdio: 'inherit' })
  } catch {
    console.log(`\nDependency install failed. Run "${pm} install" manually.`)
  }
}

/**
 * Initialize a fresh git repository in the project directory if one doesn't
 * already exist. Silently skips when git is not installed or the commit fails.
 */
function initializeGit(projectDir: string): void {
  if (existsSync(resolve(projectDir, '.git'))) return
  try {
    execSync('git init', { cwd: projectDir, stdio: 'ignore' })
    execSync('git add -A', { cwd: projectDir, stdio: 'ignore' })
    execSync('git commit -m "Initial commit from create-krantho"', {
      cwd: projectDir,
      stdio: 'ignore',
    })
  } catch {
    // git not available or commit failed — skip
  }
}

/** Print the "what's next" hint shown after scaffolding completes. */
function printSuccessMessage(options: ProjectOptions): void {
  console.log(`\nDone! Your krantho project is ready.\n`)
  if (options.framework === 'nextjs-static') {
    console.log(`  cd ${options.name}`)
    console.log(`  ${options.packageManager} run dev\n`)
    console.log(
      `Pages are the markdown files in content/docs; \`run build\` writes the site to out/.`,
    )
    console.log(`Publish: push to GitHub, then Settings → Pages → Source: GitHub Actions.\n`)
    return
  }
  console.log(`  cd ${options.name}`)
  console.log(`  ${options.packageManager} run dev\n`)
  console.log(`Studio: http://localhost:${options.port}/studio`)
  console.log(`API endpoint:    http://localhost:${options.port}/api/content\n`)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  // Support: create-krantho my-app
  const targetArg = args.find((a) => !a.startsWith('-'))
  const options = await runPrompts(targetArg)

  const projectDir = resolve(process.cwd(), options.name)
  validateProjectDir(projectDir, options.name)

  console.log(`\nScaffolding ${options.name}...`)
  console.log(`  Framework: ${options.framework}`)
  console.log(`  UI:        ${options.ui}`)
  if (options.auth) console.log(`  Auth:      token mode`)
  if (options.seo) console.log(`  SEO:       enabled`)
  console.log()

  scaffoldProject(projectDir, options)
  installDependencies(projectDir, options.packageManager)
  initializeGit(projectDir)
  printSuccessMessage(options)
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
