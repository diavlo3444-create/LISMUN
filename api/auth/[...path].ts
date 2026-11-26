let appPromise: Promise<((req: any, res: any, next?: any) => void)> | undefined;

export default async function handler(req: any, res: any) {
  try {
    if (!appPromise) {
      appPromise = import('../../src/server/app.ts').then(({ createApiApp }) => createApiApp());
    }
    const app = await appPromise;
    app(req, res);
  } catch (error) {
    console.error('[lismun-api-auth-bootstrap]', error);
    res.status(500).json({
      error: 'API_BOOTSTRAP_FAILED',
      message: 'The LIS MUN API could not start. Check Vercel runtime logs.',
    });
  }
}
