/** Runs one purge request, retries it once on failure, then logs — never throws */
export async function purgeWithRetry(
  provider: string,
  request: () => Promise<void>,
): Promise<void> {
  try {
    await request()
    return
  } catch {
    // Retried once below; the second failure is the one logged.
  }
  try {
    await request()
  } catch (error) {
    console.error(`[cdn] ${provider} purge failed after a retry:`, error)
  }
}
