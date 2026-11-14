/**
 * Wraps an async save so it can never run twice at once, and never again after it has succeeded.
 * Prevents a double tap, or a retry after a slow success, from recording the same workout twice.
 * A failed attempt can be retried.
 */
export function once<A extends unknown[]>(fn: (...a: A) => Promise<void>) {
  let running = false;
  let done = false;
  return {
    run: async (...a: A): Promise<boolean> => {
      if (running || done) return false;
      running = true;
      try {
        await fn(...a);
        done = true;
        return true;
      } finally {
        running = false;
      }
    },
    get done() {
      return done;
    },
  };
}
