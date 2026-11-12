import Database from 'better-sqlite3'

/** Connection tuning applied by {@link openDatabase} */
export interface SqliteConnectionOptions {
  /** How long a statement waits for another connection's write lock before failing */
  busyTimeoutMs: number
  /** Attempts to switch a brand-new database file into WAL mode */
  walRetries: number
  /** Pause between WAL switch attempts */
  walRetryDelayMs: number
}

/**
 * Tuning used when a caller supplies none.
 *
 * A deployment sets these through `persistence.sqlite` in the krantho
 * configuration tree; the server passes the resolved values down. These
 * literals are the standalone-library fallback and mirror that tree's
 * defaults.
 */
export const DEFAULT_SQLITE_CONNECTION_OPTIONS: SqliteConnectionOptions = {
  busyTimeoutMs: 10000,
  walRetries: 10,
  walRetryDelayMs: 50,
}

function isBusyError(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && (err as { code?: string }).code === 'SQLITE_BUSY'
  )
}

/** Block the thread. better-sqlite3 is synchronous, so there is nothing to await. */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/**
 * Put the connection into WAL mode.
 *
 * Changing the journal mode needs an exclusive lock, and SQLite does not run the
 * busy handler for it — a `busy_timeout` does not make this particular statement
 * wait. Read the mode first so that only a connection finding a brand-new file
 * attempts the write at all; every connection opened after the file is already in
 * WAL skips it. The retry covers the remaining case of several connections opening
 * the same new file at the same moment.
 */
function enableWalMode(db: Database.Database, retries: number, retryDelayMs: number): void {
  for (let attempt = 1; attempt <= retries; attempt++) {
    if (db.pragma('journal_mode', { simple: true }) === 'wal') return

    try {
      db.pragma('journal_mode = WAL')
      return
    } catch (err) {
      if (!isBusyError(err) || attempt === retries) throw err
      sleepSync(retryDelayMs)
    }
  }
}

/**
 * Register `kr_lower`, the case fold content queries match with.
 *
 * SQLite's `lower()` folds ASCII only. Folding with JavaScript's `toLowerCase`, as the
 * query's needle is folded, makes "ørret" find "Ørret". Functions belong to a connection,
 * so every connection the adapter opens registers it here.
 */
function registerFold(db: Database.Database): void {
  db.function('kr_lower', { deterministic: true }, (text) =>
    typeof text === 'string' ? text.toLowerCase() : text,
  )
}

/**
 * Open a connection to a SQLite database file.
 *
 * Several processes hold the same file open in normal operation: a server, a CLI,
 * a framework that spawns one build worker per core. Opening is therefore written
 * to tolerate a concurrent opener — the busy timeout is set before anything else
 * so later statements wait for a writer rather than failing outright.
 */
export function openDatabase(
  dbPath: string,
  options: Partial<SqliteConnectionOptions> = {},
): Database.Database {
  const { busyTimeoutMs, walRetries, walRetryDelayMs } = {
    ...DEFAULT_SQLITE_CONNECTION_OPTIONS,
    ...options,
  }
  const db = new Database(dbPath)
  db.pragma(`busy_timeout = ${busyTimeoutMs}`)
  enableWalMode(db, walRetries, walRetryDelayMs)
  db.pragma('foreign_keys = ON')
  registerFold(db)
  return db
}
