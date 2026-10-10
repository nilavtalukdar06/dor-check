export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Timed out after ${ms} ms`);
    this.name = "TimeoutError";
  }
}

/** Reject if `promise` does not settle within `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Run `fn`, retrying with exponential backoff. Each attempt gets its own timeout.
 * Throws the last error when every attempt fails.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { retries = 2, timeoutMs = 25_000, baseDelayMs = 400, shouldRetry = () => true }: {
    retries?: number;
    timeoutMs?: number;
    baseDelayMs?: number;
    shouldRetry?: (err: unknown) => boolean;
  } = {},
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await withTimeout(fn(), timeoutMs);
    } catch (err) {
      lastError = err;
      if (attempt === retries || !shouldRetry(err)) break;
      await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** attempt));
    }
  }
  throw lastError;
}
