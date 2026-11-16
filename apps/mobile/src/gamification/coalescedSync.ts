/**
 * Asks the server for the person's progression without flooding it and without ever showing an old answer over a newer one:
 *  - a request whose key (a fingerprint of the person's records and settings) equals the last confirmed key does nothing;
 *  - requests made within `debounceMs` of each other become one call (the newest key wins);
 *  - one call at a time; a newer key asked during a call runs right after it (a trailing call, so nothing is ever skipped);
 *  - an answer is applied only if no newer key has been asked since (latest wins);
 *  - a failure is reported once and not retried until the key changes or `retryMs` has passed.
 */
export interface CoalescedSyncOptions<T> {
  debounceMs: number;
  retryMs: number;
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (h: unknown) => void;
  work: (key: string) => Promise<T>;
  apply: (result: T, key: string) => void;
  onError: (key: string) => void;
}

export function createCoalescedSync<T>(o: CoalescedSyncOptions<T>) {
  let confirmed: string | null = null;
  let wanted: string | null = null;
  let timer: unknown = null;
  let inFlight = false;
  let failedAt = 0;
  let failedKey: string | null = null;
  let calls = 0;

  const pump = () => {
    if (inFlight || wanted === null || wanted === confirmed) return;
    if (failedKey === wanted && o.now() - failedAt < o.retryMs) return;
    const key = wanted;
    inFlight = true;
    calls += 1;
    o.work(key).then(
      (r) => {
        inFlight = false;
        confirmed = key;
        if (wanted === key) o.apply(r, key);
        pump(); // a newer key arrived meanwhile: run it now
      },
      () => {
        inFlight = false;
        failedKey = key;
        failedAt = o.now();
        if (wanted === key) o.onError(key);
        else pump();
      },
    );
  };

  return {
    request(key: string) {
      wanted = key;
      if (key === confirmed && !inFlight) return;
      if (timer !== null) o.clearTimer(timer);
      timer = o.setTimer(() => {
        timer = null;
        pump();
      }, o.debounceMs);
    },
    cancel() {
      if (timer !== null) o.clearTimer(timer);
      timer = null;
      wanted = null;
    },
    /** For tests and diagnostics. */
    get calls() {
      return calls;
    },
  };
}
