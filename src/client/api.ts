export class ApiError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let inMemoryBearerToken: string | null = null;
const TEST_SESSION_STORAGE_KEY = 'lismun_test_session_token';
let inMemoryTestSessionToken: string | null = (() => {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(TEST_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
})();

export function setAuthTokens(params: {
  bearerToken?: string | null;
  testSessionToken?: string | null;
}): void {
  if (params.bearerToken !== undefined) {
    inMemoryBearerToken = params.bearerToken;
  }
  if (params.testSessionToken !== undefined) {
    inMemoryTestSessionToken = params.testSessionToken;
    try {
      if (params.testSessionToken) {
        window.sessionStorage.setItem(TEST_SESSION_STORAGE_KEY, params.testSessionToken);
      } else {
        window.sessionStorage.removeItem(TEST_SESSION_STORAGE_KEY);
      }
    } catch {
      // Test mode remains usable for the current page even when storage is blocked.
    }
  }
}

export function getAuthTokens() {
  return {
    bearerToken: inMemoryBearerToken,
    testSessionToken: inMemoryTestSessionToken,
  };
}

export async function apiRequest<T = unknown>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    rawBody?: Blob | File;
    contentType?: string;
    skipAuth?: boolean;
    skipTestSession?: boolean;
  } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (!options.skipAuth && inMemoryBearerToken) {
    headers.Authorization = `Bearer ${inMemoryBearerToken}`;
  }
  if (!options.skipAuth && !options.skipTestSession && inMemoryTestSessionToken) {
    headers['X-Test-Session'] = inMemoryTestSessionToken;
  }

  let bodyInit: BodyInit | undefined;
  if (options.rawBody) {
    headers['Content-Type'] = options.contentType || options.rawBody.type || 'application/octet-stream';
    bodyInit = options.rawBody;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    bodyInit = JSON.stringify(options.body);
  }

  const resp = await fetch(path, {
    method: options.method || 'GET',
    headers,
    body: bodyInit,
  });

  const text = await resp.text();
  let parsed: Record<string, unknown> = {};
  if (text) {
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      parsed = { message: text };
    }
  }

  if (!resp.ok) {
    throw new ApiError(
      resp.status,
      String(parsed.error || `HTTP_${resp.status}`),
      String(parsed.message || `Request failed (${resp.status})`),
      parsed
    );
  }

  return parsed as T;
}
