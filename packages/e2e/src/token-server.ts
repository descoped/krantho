import { type ChildProcess, spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { E2eTarget } from './targets.js'

/**
 * A second production server of a target, signing people in with a shared
 * token: what a spec needs to reach screens only signed-in admins see (Setup ›
 * People). It runs on its own port and a fresh data directory of its own,
 * beside the run's server, and is stopped when the spec is done.
 */
export interface TokenServer {
  baseURL: string
  /** The shared secret the login form takes */
  token: string
  stop: () => Promise<void>
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const TOKEN = 'krantho-e2e-admin-token'
const STARTUP_MS = 120_000
/** How long a server has to stop after SIGTERM before it is killed */
const STOP_MS = 10_000

async function ready(baseURL: string, child: ChildProcess): Promise<void> {
  const until = Date.now() + STARTUP_MS
  while (Date.now() < until) {
    if (child.exitCode !== null) throw new Error(`The token server exited with ${child.exitCode}`)
    const up = await fetch(new URL('/api/capabilities', baseURL)).then(
      (res) => res.ok,
      () => false,
    )
    if (up) return
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`The token server did not answer at ${baseURL}`)
}

function stopper(child: ChildProcess, dataDir: string): () => Promise<void> {
  return async () => {
    if (child.exitCode === null) {
      const exited = new Promise((resolve) => child.once('exit', resolve))
      // The server runs under pnpm in a process group of its own: stop the whole group (a
      // negative pid is a group on POSIX, which the suite runs on — macOS and Linux CI)
      if (child.pid !== undefined) process.kill(-child.pid, 'SIGTERM')
      // A server that ignores SIGTERM is killed, so teardown never hangs
      const late = setTimeout(() => {
        if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL')
      }, STOP_MS)
      await exited
      clearTimeout(late)
    }
    rmSync(dataDir, { recursive: true, force: true })
  }
}

/** The target's own settings, moved to `port`: a port or origin it names is the e2e port */
function movedEnv(target: E2eTarget, port: number): Record<string, string> {
  const from = String(target.port)
  return Object.fromEntries(
    Object.entries(target.env).map(([name, value]) => [name, value.replaceAll(from, String(port))]),
  )
}

/** Start the target's production server with token sign-in on `port`; resolves once it answers */
export async function startTokenServer(target: E2eTarget, port: number): Promise<TokenServer> {
  const dataDir = mkdtempSync(join(tmpdir(), 'krantho-e2e-token-'))
  const command = target.command.replace(String(target.port), String(port)).split(' ')
  const [bin = 'pnpm', ...args] = command
  const child = spawn(bin, args, {
    cwd: join(repoRoot, target.dir),
    stdio: 'ignore',
    detached: true,
    env: {
      ...process.env,
      ...movedEnv(target, port),
      KRANTHO_PATHS_DATA_DIR: dataDir,
      KRANTHO_MEDIA_LOCAL_DIR: join(dataDir, 'uploads'),
      KRANTHO_JWT_SECRET: 'krantho-e2e-token-jwt-secret-not-for-production',
      KRANTHO_AUTH: 'token',
      KRANTHO_API_TOKEN: TOKEN,
      KRANTHO_TOKEN_EMAIL: 'admin@e2e.local',
      KRANTHO_TOKEN_ROLE: 'admin',
    },
  })
  const baseURL = `http://localhost:${port}`
  const stop = stopper(child, dataDir)
  try {
    await ready(baseURL, child)
  } catch (err: unknown) {
    await stop()
    throw err
  }
  return { baseURL, token: TOKEN, stop }
}
