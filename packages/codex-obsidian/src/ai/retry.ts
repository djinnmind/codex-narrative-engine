const RETRYABLE_STATUS = new Set([429, 503, 502, 500]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1500;

/**
 * Wraps a request function with exponential backoff retries for transient
 * HTTP errors (429 rate-limit, 503 overloaded, 502/500 server errors).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  isRetryable?: (err: unknown) => boolean,
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: unknown) {
      attempt++;
      const shouldRetry = isRetryable
        ? isRetryable(err)
        : isRetryableError(err);

      if (!shouldRetry || attempt >= MAX_RETRIES) {
        throw err;
      }

      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1) + Math.random() * 500;
      console.debug(`Codex AI: ${label} — retryable error, attempt ${attempt}/${MAX_RETRIES}, waiting ${Math.round(delay)}ms`);
      await sleep(delay);
    }
  }
}

function isRetryableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  for (const code of RETRYABLE_STATUS) {
    if (err.message.includes(`${code}`)) return true;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
