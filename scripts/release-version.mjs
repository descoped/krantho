#!/usr/bin/env node
// One version for the whole repository: the root and every workspace package,
// the Claude Code plugins and their skills carry the version of the release
// (vMAJOR.MINOR.PATCH, semver.org).
//
//   node scripts/release-version.mjs set 0.7.7     every versioned file to 0.7.7
//   node scripts/release-version.mjs check v0.7.7  fail unless every versioned file is at 0.7.7
//                                                  and CHANGELOG.md has a `## 0.7.7` heading
//   node scripts/release-version.mjs current       print the root version
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')

/** semver.org's grammar: MAJOR.MINOR.PATCH, an optional pre-release, an optional build */
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/

/** The root package.json and every workspace package's, from pnpm-workspace.yaml */
function manifests() {
  const workspace = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf-8')
  const block = workspace.split(/^packages:\s*$/m)[1]?.split(/^\S/m)[0] ?? ''
  const patterns = [...block.matchAll(/^\s+-\s+['"]?([^'"\s]+)['"]?\s*$/gm)].map((m) => m[1])
  const dirs = patterns.flatMap((pattern) => {
    if (!pattern.endsWith('/*')) return [pattern]
    const parent = pattern.slice(0, -2)
    return readdirSync(join(root, parent))
      .map((name) => join(parent, name))
      .filter((dir) => statSync(join(root, dir)).isDirectory())
  })
  return ['package.json', ...dirs.map((dir) => join(dir, 'package.json'))].filter((file) => {
    try {
      return statSync(join(root, file)).isFile()
    } catch {
      return false
    }
  })
}

/** Each plugin's manifest and each of its skills, which name the krantho release they target */
function pluginFiles() {
  const plugins = join(root, 'plugins')
  let names = []
  try {
    names = readdirSync(plugins)
  } catch {
    return []
  }
  return names.flatMap((name) => {
    const manifest = join('plugins', name, '.claude-plugin', 'plugin.json')
    let skills = []
    try {
      skills = readdirSync(join(plugins, name, 'skills')).map((skill) =>
        join('plugins', name, 'skills', skill, 'SKILL.md'),
      )
    } catch {
      skills = []
    }
    return [manifest, ...skills].filter((file) => {
      try {
        return statSync(join(root, file)).isFile()
      } catch {
        return false
      }
    })
  })
}

/** Every file that carries the release version */
function versionedFiles() {
  return [...manifests(), ...pluginFiles()]
}

/** A JSON manifest's `version`, or a skill's `krantho-version` */
const SKILL_VERSION = /^(\s*krantho-version:\s*)(\S+)\s*$/m

function versionOf(file) {
  const text = readFileSync(join(root, file), 'utf-8')
  if (file.endsWith('.md')) return text.match(SKILL_VERSION)?.[2]
  return JSON.parse(text).version
}

/** Set the version, keeping the file's formatting; a manifest without one gets it after `name` */
function setVersion(file, version) {
  const path = join(root, file)
  const text = readFileSync(path, 'utf-8')
  let next
  if (file.endsWith('.md')) next = text.replace(SKILL_VERSION, `$1${version}`)
  else if (/^ {2}"version": "[^"]*"/m.test(text))
    next = text.replace(/^ {2}"version": "[^"]*"/m, `  "version": "${version}"`)
  else next = text.replace(/^( {2}"name": "[^"]*",)$/m, `$1\n  "version": "${version}",`)
  writeFileSync(path, next)
  if (versionOf(file) !== version) throw new Error(`${file}: could not set the version`)
}

/** The project's changelog: one `## MAJOR.MINOR.PATCH` heading per release, newest first */
const CHANGELOG = 'CHANGELOG.md'

/** The changelog's heading for `version`, or undefined */
function changelogEntry(version) {
  let text = ''
  try {
    text = readFileSync(join(root, CHANGELOG), 'utf-8')
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    throw error
  }
  const heading = new RegExp(`^## ${version.replaceAll('.', '\\.')}(?: - \\d{4}-\\d{2}-\\d{2})?\\s*$`, 'm')
  return text.match(heading)?.[0].trim()
}

const [command, argument] = process.argv.slice(2)

if (command === 'current') {
  console.log(versionOf('package.json'))
} else if (command === 'set' && argument && SEMVER.test(argument)) {
  const files = versionedFiles()
  for (const file of files) setVersion(file, argument)
  console.log(`${files.length} files at ${argument}`)
} else if (command === 'check' && argument) {
  const version = argument.startsWith('v') ? argument.slice(1) : ''
  if (!SEMVER.test(version)) {
    console.error(`::error::${argument} is not a vMAJOR.MINOR.PATCH release tag (semver.org)`)
    process.exit(1)
  }
  const files = versionedFiles()
  const wrong = files.filter((file) => versionOf(file) !== version)
  if (wrong.length > 0) {
    console.error(`::error::these files are not at ${version}: ${wrong.join(', ')}`)
    process.exit(1)
  }
  // Every release has a changelog entry; a pre-release needs none
  const entry = version.includes('-') ? 'none needed for a pre-release' : changelogEntry(version)
  if (!entry) {
    console.error(`::error::no changelog entry for ${version}: add a \`## ${version} - YYYY-MM-DD\` heading to ${CHANGELOG}`)
    process.exit(1)
  }
  console.log(`${argument}: all ${files.length} versioned files are at ${version}; ${CHANGELOG}: ${entry}`)
} else {
  console.error('usage: release-version.mjs set <MAJOR.MINOR.PATCH> | check <vMAJOR.MINOR.PATCH> | current')
  process.exit(1)
}
