import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'
import {
  clearNextPageCache,
  dataDirFor,
  dropInheritedSettings,
  opensRun,
  selectedTargets,
  TARGETS,
} from './src/targets.js'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Fixed for the run, so sessions and preview tokens verify across the target's processes */
const JWT_SECRET = 'krantho-e2e-jwt-secret-not-for-production'

// Read before the inherited settings are dropped; CI itself is not one of them.
const ci = Boolean(process.env.CI)

// Every target starts from the runner's environment minus krantho, sign-in, Claude Code and
// language-model settings, plus the harness's own settings below.
dropInheritedSettings()

/** The reference target runs every spec; the others run the specs written for every stack */
const REFERENCE = 'nextjs-shadcn'
const EVERY_STACK = [
  'assistant',
  'core-flows',
  'editor-live',
  'production-html',
  'public-theme',
  'smoke',
].map((spec) => `**/${spec}.spec.ts`)

/**
 * Every target runs its production server on its e2e port (react-spa its Vite server, which
 * alone serves its API), on a fresh data directory, so each run starts from the target's
 * content imported into an empty database and an empty media store, with no page cache left
 * from an earlier run. The target must already be built — the suite builds nothing.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: ci,
  reporter: ci ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: TARGETS.map((target) => ({
    name: target.name,
    ...(target.name === REFERENCE ? {} : { testMatch: EVERY_STACK }),
    use: { baseURL: `http://localhost:${target.port}` },
  })),
  webServer: selectedTargets().map((target) => {
    const targetDir = join(repoRoot, target.dir)
    const dataDir = dataDirFor(target.name)
    mkdirSync(dataDir, { recursive: true })
    if (opensRun) clearNextPageCache(targetDir)
    return {
      command: target.command,
      cwd: targetDir,
      url: `http://localhost:${target.port}/api/collections`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...target.env,
        KRANTHO_PATHS_DATA_DIR: dataDir,
        // Uploads land in the run's directory, never in the example's own files
        KRANTHO_MEDIA_LOCAL_DIR: join(dataDir, 'uploads'),
        KRANTHO_JWT_SECRET: JWT_SECRET,
        KRANTHO_AUTH: 'none',
      },
    }
  }),
})
