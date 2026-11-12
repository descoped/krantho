import type { KranthoConfig } from '@krantho/config'
import pLimit from 'p-limit'

/**
 * Create a concurrency-limited task runner.
 */
export function createLimiter(concurrency: number): ReturnType<typeof pLimit> {
  return pLimit(concurrency)
}

/**
 * How many model calls run at once: `--concurrency <n>` wins, otherwise the
 * resolved `tools.concurrency` — which already folds in `CLAUDE_CONCURRENCY`
 * and the shipped default.
 */
export function resolveConcurrency(args: string[], config: KranthoConfig): number {
  const index = args.indexOf('--concurrency')
  const flag = index === -1 ? undefined : args[index + 1]
  if (flag) {
    const value = parseInt(flag, 10)
    if (!isNaN(value) && value > 0) return value
  }
  return config.tools.concurrency
}
