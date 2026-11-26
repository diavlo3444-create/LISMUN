export function normalizeVercelApiRequestUrl(
  rawUrl: string | undefined,
  headers?: Record<string, string | string[] | undefined>
): string {
  const input = rawUrl && rawUrl.trim() ? rawUrl.trim() : '/api';
  const parsed = new URL(input, 'http://localhost');

  const rewrittenPath = parsed.searchParams.get('__lismun_path');
  if (rewrittenPath !== null) {
    parsed.searchParams.delete('__lismun_path');
    const cleanedSegment = rewrittenPath.replace(/^\/+/, '');
    const pathname = cleanedSegment ? `/api/${cleanedSegment}` : '/api';
    const qs = parsed.searchParams.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  if (parsed.pathname === '/api/index' || parsed.pathname === '/api/index.ts') {
    const forwardedHeader =
      headers?.['x-vercel-original-path'] ?? headers?.['x-matched-path'] ?? '';
    const candidate = Array.isArray(forwardedHeader) ? forwardedHeader[0] : forwardedHeader;
    if (candidate && candidate.startsWith('/api') && !candidate.startsWith('/api/index')) {
      const qs = parsed.searchParams.toString();
      return qs ? `${candidate}?${qs}` : candidate;
    }
    const qs = parsed.searchParams.toString();
    return qs ? `/api?${qs}` : '/api';
  }

  const qs = parsed.searchParams.toString();
  return qs ? `${parsed.pathname}?${qs}` : parsed.pathname;
}

let appPromise: Promise<(req: any, res: any, next?: any) => void> | undefined;

export default async function handler(req: any, res: any) {
  try {
    req.url = normalizeVercelApiRequestUrl(req?.url, req?.headers);
    if (!appPromise) {
      appPromise = import('../src/server/app.ts').then(({ createApiApp }) => createApiApp());
    }
    const app = await appPromise;
    app(req, res);
  } catch (error) {
    console.error('[lismun-api-bootstrap]', error);
    res.status(500).json({
      error: 'API_BOOTSTRAP_FAILED',
      message: 'The LIS MUN API could not start. Check Vercel runtime logs.',
    });
  }
}
