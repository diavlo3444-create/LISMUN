let appPromise: Promise<((req: any, res: any, next?: any) => void)> | undefined;

/**
 * Explicit Vercel function for the bulk account provisioning endpoint.
 * The shared Express app retains all authentication, authorization,
 * validation, database transaction, and audit behavior.
 */
export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Use POST for bulk account import.' });
      return;
    }

    if (!appPromise) {
      appPromise = import('../../../src/server/app.ts').then(({ createApiApp }) => createApiApp());
    }

    const app = await appPromise;
    app(req, res);
  } catch (error) {
    console.error('[lismun-bulk-api-bootstrap]', error);
    res.status(500).json({
      error: 'API_BOOTSTRAP_FAILED',
      message: 'The LIS MUN bulk account API could not start. Check Vercel runtime logs.',
    });
  }
}
