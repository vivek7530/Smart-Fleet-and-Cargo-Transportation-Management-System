export interface FieldIssue {
  field: string;
  message: string;
}

/** Mirrors the API's error envelope so the UI can react to specific codes. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly issues?: FieldIssue[];

  constructor(status: number, code: string, message: string, issues?: FieldIssue[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.issues = issues;
  }

  get isUnauthenticated() {
    return this.status === 401;
  }
  get isForbidden() {
    return this.status === 403;
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Query parameters appended to the path; empty values are dropped. */
  params?: Record<string, string | number | boolean | undefined | null>;
}

/**
 * The API lives inside this same Next.js app under /api, so requests are
 * same-origin: no CORS, and the HTTP-only auth cookie travels automatically.
 */
function buildUrl(path: string, params?: RequestOptions['params']): string {
  const query = new URLSearchParams();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      query.set(key, String(value));
    }
  }
  const normalised = path.startsWith('/') ? path : `/${path}`;
  const search = query.toString();
  return `/api${normalised}${search ? `?${search}` : ''}`;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, params, headers, ...rest } = options;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, params), {
      ...rest,
      // Same-origin already sends cookies, but this stays explicit.
      credentials: 'same-origin',
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Check your connection and try again.');
  }

  if (response.status === 204) return undefined as T;

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const envelope = payload as
    | { success: true; data: T }
    | { success: false; message?: string; code?: string; issues?: FieldIssue[] }
    | null;

  if (!response.ok || !envelope || envelope.success === false) {
    const error = envelope && envelope.success === false ? envelope : null;
    throw new ApiError(
      response.status,
      error?.code ?? 'REQUEST_FAILED',
      error?.message ?? 'Something went wrong. Please try again.',
      error?.issues,
    );
  }

  return envelope.data;
}

export const api = {
  get: <T>(path: string, params?: RequestOptions['params']) => apiFetch<T>(path, { method: 'GET', params }),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};

/** Turns an API error into per-field messages react-hook-form can consume. */
export function fieldErrorsFrom(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || !error.issues) return {};
  return Object.fromEntries(error.issues.map((issue) => [issue.field, issue.message]));
}

export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
