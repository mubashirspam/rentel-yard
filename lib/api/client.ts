/**
 * The browser side of the §06 envelope.
 *
 * Every route handler answers a failure as `{ error: { code, message, field } }`
 * with a message written for a yard worker, so the client's job is to surface it
 * verbatim rather than invent copy of its own. Keep this module free of server
 * imports — it runs in the browser.
 */

export class ApiError extends Error {
  readonly code: string;
  readonly field?: string;
  readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    options: { code?: string; field?: string; context?: Record<string, unknown> } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = options.code ?? 'INTERNAL';
    this.field = options.field;
    this.context = options.context;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    // At M5 this is where the outbox takes over. Until then, say so plainly.
    throw new ApiError('No connection. Check the network and try again.', { code: 'OFFLINE' });
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string; field?: string } })
      ?.error;
    throw new ApiError(error?.message ?? 'That did not work. Try again.', {
      code: error?.code,
      field: error?.field,
      context: (payload as { error?: { context?: Record<string, unknown> } })?.error?.context,
    });
  }

  return payload as T;
}

export function getJson<T>(url: string): Promise<T> {
  return request<T>(url);
}

export function postJson<T>(url: string, body: unknown): Promise<T> {
  return request<T>(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function patchJson<T>(url: string, body: unknown): Promise<T> {
  return request<T>(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * An idempotency key for one movement line (§07.2).
 *
 * Minted on the device, not the server, so a retry — a flaky tap now, a queued
 * push at M5 — lands the same row exactly once.
 */
export function newClientUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
