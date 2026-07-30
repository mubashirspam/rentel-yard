/**
 * Shared error codes and the error type every layer throws.
 *
 * Per §06, codes are stable identifiers the offline client matches on, and
 * messages are plain text that is safe to show a yard worker. Per §14, codes
 * live in one shared enum rather than as string literals scattered around.
 */

export const ERROR_CODES = {
  /** A RETURN / RETURN_DAMAGED / LOST for more units than the account holds. */
  RETURN_EXCEEDS_OUTSTANDING: 'RETURN_EXCEEDS_OUTSTANDING',
  /** A date was not a real calendar day in YYYY-MM-DD form. */
  INVALID_DATE: 'INVALID_DATE',
  /** A movement quantity was zero, negative, or fractional. */
  INVALID_QUANTITY: 'INVALID_QUANTITY',
  /** The billing configuration object is malformed. */
  INVALID_CONFIG: 'INVALID_CONFIG',
  /** A REVERSAL row arrived without a `reversesId`. */
  REVERSAL_MISSING_TARGET: 'REVERSAL_MISSING_TARGET',
  /** A movement carried a type the engine does not know. */
  UNKNOWN_MOVEMENT_TYPE: 'UNKNOWN_MOVEMENT_TYPE',
  /** An account close was attempted while items are still out. */
  ACCOUNT_NOT_EMPTY: 'ACCOUNT_NOT_EMPTY',

  // --- authentication and authorisation (§05) ---
  /** No valid staff session on the request. */
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  /** Signed in, but the role does not hold the required capability. */
  FORBIDDEN: 'FORBIDDEN',
  /** Row absent, or belongs to another org — deliberately indistinguishable. */
  NOT_FOUND: 'NOT_FOUND',
  /** A duplicate that a unique constraint rejected. */
  CONFLICT: 'CONFLICT',

  // --- customer portal (§05.4) ---
  /** Portal token unknown, expired, or revoked. */
  PORTAL_TOKEN_INVALID: 'PORTAL_TOKEN_INVALID',
  /** Mobile-number lookup found no customer. */
  PORTAL_MOBILE_UNKNOWN: 'PORTAL_MOBILE_UNKNOWN',
  /** Too many lookups from this number or address. */
  RATE_LIMITED: 'RATE_LIMITED',
  /** A mobile number that is not valid E.164. */
  INVALID_MOBILE: 'INVALID_MOBILE',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface LedgerErrorOptions {
  /** Dot-path of the offending field, e.g. `lines[2].qty`. */
  field?: string;
  /** Structured detail the UI can use to explain the failure. */
  context?: Record<string, unknown>;
}

/** HTTP status for each code. Anything unlisted is a 400 business rejection. */
const STATUS_BY_CODE: Partial<Record<ErrorCode, number>> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PORTAL_TOKEN_INVALID: 401,
  PORTAL_MOBILE_UNKNOWN: 404,
};

/**
 * The only error type thrown by domain code. Route handlers serialise it
 * straight into the §06 envelope; they never leak a stack trace or a raw
 * Postgres error.
 */
export class LedgerError extends Error {
  readonly code: ErrorCode;
  readonly field?: string;
  readonly context?: Record<string, unknown>;
  /** HTTP status a route handler should respond with. */
  readonly status: number;

  constructor(code: ErrorCode, message: string, options: LedgerErrorOptions = {}) {
    super(message);
    this.name = 'LedgerError';
    this.code = code;
    this.field = options.field;
    this.context = options.context;
    this.status = STATUS_BY_CODE[code] ?? 400;
  }

  /** Shape required by the §06 error envelope. */
  toEnvelope(): {
    error: { code: ErrorCode; message: string; field?: string; context?: Record<string, unknown> };
  } {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.field === undefined ? {} : { field: this.field }),
        ...(this.context === undefined ? {} : { context: this.context }),
      },
    };
  }
}

export function isLedgerError(value: unknown): value is LedgerError {
  return value instanceof LedgerError;
}
