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
let inMemoryTestSessionToken: string | null = null;

export function setAuthTokens(params: {
  bearerToken?: string | null;
  testSessionToken?: string | null;
}): void {
  if (params.bearerToken !== undefined) {
    inMemoryBearerToken = params.bearerToken;
  }
  if (params.testSessionToken !== undefined) {
    inMemoryTestSessionToken = params.testSessionToken;
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
  } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (!options.skipAuth && inMemoryBearerToken) {
    headers.Authorization = `Bearer ${inMemoryBearerToken}`;
  }
  if (!options.skipAuth && inMemoryTestSessionToken) {
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
