/** Common error handling. Errors carry a stable machine code and a user-safe message. */
export type ErrorCode =
  | 'validation_failed'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'quota_exceeded'
  | 'budget_exhausted'
  | 'feature_disabled'
  | 'safety_blocked'
  | 'country_unavailable'
  | 'upstream_failure'
  | 'internal';

const HTTP_STATUS: Record<ErrorCode, number> = {
  validation_failed: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  quota_exceeded: 429,
  budget_exhausted: 503,
  feature_disabled: 503,
  safety_blocked: 422,
  country_unavailable: 451,
  upstream_failure: 502,
  internal: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  /** Safe to show to the user; never contains secrets or internal detail. */
  readonly userMessage: string;
  constructor(code: ErrorCode, userMessage: string, options?: { cause?: unknown }) {
    super(`${code}: ${userMessage}`, options);
    this.name = 'AppError';
    this.code = code;
    this.userMessage = userMessage;
  }
  get httpStatus(): number {
    return HTTP_STATUS[this.code];
  }
}

export type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E = AppError>(error: E): Result<never, E> => ({ ok: false, error });

/** Converts anything thrown into an AppError without leaking internal detail. */
export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  return new AppError('internal', 'Something went wrong. Please try again.', { cause: e });
}
