import type { CheckpointInfo, CheckpointTrigger } from '../lib/api.js'

/** What took a checkpoint, in words */
export const TRIGGER_LABELS: Readonly<Record<CheckpointTrigger, string>> = {
  manual: 'By hand',
  'pre-restore': 'Before a restore',
  'pre-migration': 'Before a migration',
  'pre-import': 'Before an import',
}

/** "v3 · Before the relaunch", or "v3" for one without a name */
export function checkpointName(checkpoint: Pick<CheckpointInfo, 'version' | 'name'>): string {
  return checkpoint.name ? `v${checkpoint.version} · ${checkpoint.name}` : `v${checkpoint.version}`
}
