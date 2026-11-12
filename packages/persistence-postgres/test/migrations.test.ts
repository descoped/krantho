import { sqliteMigrations } from '@krantho/persistence-sqlite'
import { describe, expect, it } from 'vitest'
import { postgresMigrations } from '../src/migrations/index.js'

describe('Postgres migrations', () => {
  it('has sequential version numbers starting from 1', () => {
    for (let i = 0; i < postgresMigrations.length; i++) {
      expect(postgresMigrations[i]!.version).toBe(i + 1)
    }
  })

  it('has unique version numbers', () => {
    const versions = postgresMigrations.map((m) => m.version)
    expect(new Set(versions).size).toBe(versions.length)
  })

  it('has unique names', () => {
    const names = postgresMigrations.map((m) => m.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('each migration has an apply function', () => {
    for (const m of postgresMigrations) {
      expect(m.apply).toBeTypeOf('function')
    }
  })

  it('matches SQLite migration count (feature parity)', () => {
    expect(postgresMigrations.length).toBe(sqliteMigrations.length)
  })

  it('has same migration names as SQLite (feature parity)', () => {
    for (let i = 0; i < postgresMigrations.length; i++) {
      expect(postgresMigrations[i]!.name).toBe(sqliteMigrations[i]!.name)
    }
  })
})
