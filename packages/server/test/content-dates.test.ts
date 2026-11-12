import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CONTENT_DATES_FILE,
  contentDateKey,
  contentDateLookup,
  contentVersion,
  generateContentDates,
  loadContentDates,
} from '../src/content-dates.js'

let root: string

function git(cwd: string, args: string[], date?: string): void {
  const env = date
    ? { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }
    : process.env
  execFileSync('git', args, { cwd, env, stdio: 'ignore' })
}

/** Write a content file and commit it at `date` */
function commit(repo: string, file: string, date: string): void {
  const path = join(repo, 'content', file)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, `---\ntitle: ${file}\n---\nChanged ${date}\n`)
  git(repo, ['add', join('content', file)])
  git(repo, ['commit', '-q', '-m', `add ${file}`], date)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'krantho-content-dates-'))
  git(root, ['init', '-q', '-b', 'main'])
  git(root, ['config', 'user.email', 'test@example.com'])
  git(root, ['config', 'user.name', 'Test'])
  git(root, ['config', 'commit.gpgsign', 'false'])
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('contentVersion', () => {
  it('is the time of the last commit that touched the content, also a deletion', async () => {
    commit(root, 'docs/install.md', '2026-01-02T03:04:05Z')
    commit(root, 'pages/about.md', '2026-02-03T04:05:06Z')
    const contentDir = join(root, 'content')
    expect(await contentVersion(contentDir)).toBe(Date.parse('2026-02-03T04:05:06Z') / 1000)

    git(root, ['rm', '-q', join('content', 'pages', 'about.md')])
    git(root, ['commit', '-q', '-m', 'remove about'], '2026-03-04T05:06:07Z')
    expect(await contentVersion(contentDir)).toBe(Date.parse('2026-03-04T05:06:07Z') / 1000)
  })

  it('is null before the content has a commit', async () => {
    expect(await contentVersion(root)).toBeNull()
  })
})

describe('generateContentDates', () => {
  it('writes each committed markdown file’s last commit date, keyed by its path', async () => {
    commit(root, 'docs/install.md', '2026-01-02T03:04:05Z')
    commit(root, 'pages/about.md', '2026-02-03T04:05:06Z')
    commit(root, 'docs/install.md', '2026-03-04T05:06:07Z')
    writeFileSync(join(root, 'content', 'pages', 'draft.md'), 'not committed')

    const contentDir = join(root, 'content')
    const dates = await generateContentDates(contentDir)

    expect(dates).toEqual({
      'docs/install.md': '2026-03-04T05:06:07.000Z',
      'pages/about.md': '2026-02-03T04:05:06.000Z',
    })
    const written = JSON.parse(readFileSync(join(contentDir, CONTENT_DATES_FILE), 'utf-8'))
    expect(written).toEqual(dates)
  })

  it('writes nothing from a shallow clone, where every file would carry the latest date', async () => {
    commit(root, 'docs/install.md', '2026-01-02T03:04:05Z')
    commit(root, 'pages/about.md', '2026-02-03T04:05:06Z')
    const clone = join(root, 'clone')
    execFileSync('git', ['clone', '-q', '--depth', '1', `file://${root}`, clone], {
      stdio: 'ignore',
    })

    const contentDir = join(clone, 'content')
    expect(await generateContentDates(contentDir)).toBeNull()
    expect(existsSync(join(contentDir, CONTENT_DATES_FILE))).toBe(false)
  })

  it('writes nothing outside a git repository', async () => {
    const plain = mkdtempSync(join(tmpdir(), 'krantho-no-git-'))
    try {
      writeFileSync(join(plain, 'page.md'), 'x')
      expect(await generateContentDates(plain)).toBeNull()
      expect(existsSync(join(plain, CONTENT_DATES_FILE))).toBe(false)
    } finally {
      rmSync(plain, { recursive: true, force: true })
    }
  })
})

describe('loadContentDates', () => {
  it('reads no dates when the build wrote none, or wrote something else', async () => {
    const contentDir = join(root, 'content')
    mkdirSync(contentDir)
    expect(await loadContentDates(contentDir)).toEqual({})

    writeFileSync(join(contentDir, CONTENT_DATES_FILE), '["not", "a", "map"]')
    expect(await loadContentDates(contentDir)).toEqual({})

    writeFileSync(
      join(contentDir, CONTENT_DATES_FILE),
      JSON.stringify({ 'a.md': '2026-01-01T00:00:00.000Z', 'b.md': 7 }),
    )
    expect(await loadContentDates(contentDir)).toEqual({ 'a.md': '2026-01-01T00:00:00.000Z' })
  })
})

describe('contentDateLookup', () => {
  it('finds a file’s date by its path under the content directory', async () => {
    commit(root, 'docs/install.md', '2026-01-02T03:04:05Z')
    const contentDir = join(root, 'content')
    await generateContentDates(contentDir)

    const dateOf = await contentDateLookup(contentDir)
    expect(dateOf(join(contentDir, 'docs', 'install.md'))).toBe('2026-01-02T03:04:05.000Z')
    expect(dateOf(join(contentDir, 'docs', 'missing.md'))).toBeUndefined()
    expect(contentDateKey(contentDir, join(contentDir, 'docs', 'install.md'))).toBe(
      'docs/install.md',
    )
  })
})
