import { request } from './api-client.js'
import type { CheckpointInfo } from './api-types.js'

/** The checkpoints, newest first */
export async function fetchCheckpoints(): Promise<CheckpointInfo[]> {
  const { checkpoints } = await request<{ checkpoints: CheckpointInfo[] }>('/checkpoints')
  return checkpoints
}

/** Take a manual checkpoint of the whole content store */
export async function createCheckpoint(name?: string | undefined): Promise<CheckpointInfo> {
  return request('/checkpoints', {
    method: 'POST',
    body: JSON.stringify(name ? { name } : {}),
  })
}

/** Rewind the content store to a checkpoint; the API takes a safety checkpoint first */
export async function restoreCheckpoint(
  version: number,
): Promise<{ restored: CheckpointInfo; message: string }> {
  return request(`/checkpoints/${version}/restore`, { method: 'POST' })
}

/** Delete a checkpoint */
export async function deleteCheckpoint(version: number): Promise<void> {
  await request(`/checkpoints/${version}`, { method: 'DELETE' })
}
