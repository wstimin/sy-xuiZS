const HEALTH_CHECK_TIMEOUT_MS = 4_000;
const HEALTH_CHECK_ATTEMPTS = 2;

export async function ensureAssistantConnection(parentSignal?: AbortSignal): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < HEALTH_CHECK_ATTEMPTS; attempt += 1) {
    if (parentSignal?.aborted) throw new DOMException('Request aborted', 'AbortError');

    const controller = new AbortController();
    const handleParentAbort = () => controller.abort();
    parentSignal?.addEventListener('abort', handleParentAbort, { once: true });
    const timeout = window.setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);

    try {
      const response = await fetch(`/api/health?connectionCheck=${Date.now()}-${attempt}`, {
        cache: 'no-store',
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return;
    } catch (error) {
      if (parentSignal?.aborted) throw error;
      lastError = error;
    } finally {
      window.clearTimeout(timeout);
      parentSignal?.removeEventListener('abort', handleParentAbort);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Unable to connect to the deployment assistant');
}
