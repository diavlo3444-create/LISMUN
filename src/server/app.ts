import express from 'express';
import { getPool, isDatabaseConfigured } from './db/pool.ts';
import { runMigrationsAndSeed } from './db/migrate.ts';
import { getPrimarySuperAdminEmail } from './services/crypto.ts';
import { authRouter } from './routes/auth.ts';
import { superAdminRouter } from './routes/superAdmin.ts';
import { publicRouter } from './routes/public.ts';
import { applicationsRouter } from './routes/applications.ts';
import { invitesRouter } from './routes/invites.ts';
import { departmentsRouter } from './routes/departments.ts';
import { ebRouter } from './routes/eb.ts';
import { qrRouter } from './routes/qr.ts';
import { emailsRouter } from './routes/emails.ts';
import { cmsRouter } from './routes/cms.ts';
import { LEGAL_CONSENT_VERSION } from '../shared/intake.ts';
import type { SystemStatusResponse } from '../shared/types.ts';

export function createApiApp() {
  const app = express();
  app.set('trust proxy', 1);

  // Security headers (never wildcard CORS on authenticated routes)
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const host = req.headers.host;
    if (origin && host) {
      try {
        const parsed = new URL(origin);
        if (parsed.host === host) {
          res.setHeader('Access-Control-Allow-Origin', origin);
          res.setHeader('Vary', 'Origin');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Test-Session');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        }
      } catch {
        // Ignore malformed Origin header
      }
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(self)');
    if (req.path.startsWith('/api')) {
      res.setHeader('Cache-Control', 'no-store');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use('/api/public/files/upload', (_req, _res, next) => next()); // Raw stream upload
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', async (_req, res) => {
    const dbConfigured = isDatabaseConfigured();
    let dbConnected = false;
    if (dbConfigured) {
      try {
        await runMigrationsAndSeed();
        await getPool().query('SELECT 1');
        dbConnected = true;
      } catch {
        dbConnected = false;
      }
    }
    res.json({ ok: true, dbConfigured, dbConnected });
  });

  app.get('/api/system/status', async (_req, res) => {
    const dbConfigured = isDatabaseConfigured();
    let dbConnected = false;
    let firstRunSetupNeeded = false;
    let gmailConnected = false;
    let gmailConnectedAt: string | null = null;

    if (dbConfigured) {
      try {
        await runMigrationsAndSeed();
        const pool = getPool();
        const [cntRes, gmailRes] = await Promise.all([
          pool.query<{ cnt: string }>(
            `SELECT COUNT(*)::text AS cnt FROM profiles WHERE role = 'super_admin' AND is_active = true`
          ),
          pool.query<{ connected_at: string }>(
            `SELECT connected_at FROM gmail_oauth_credentials WHERE singleton = true LIMIT 1`
          ),
        ]);
        dbConnected = true;
        firstRunSetupNeeded = Number(cntRes.rows[0]?.cnt ?? '0') === 0;
        gmailConnected = Boolean(gmailRes.rows[0]);
        gmailConnectedAt = gmailRes.rows[0]?.connected_at ?? null;
      } catch {
        dbConnected = false;
      }
    }

    const payload: SystemStatusResponse = {
      ok: true,
      dbConfigured,
      dbConnected,
      primarySuperAdminEmailConfigured: Boolean(getPrimarySuperAdminEmail()),
      firstRunSetupNeeded,
      resendConfigured: Boolean(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim()),
      gmailOAuthConfigured: Boolean(
        process.env.GOOGLE_CLIENT_ID?.trim() &&
          process.env.GOOGLE_CLIENT_SECRET?.trim() &&
          process.env.GMAIL_TOKEN_ENCRYPTION_KEY?.trim()
      ),
      gmailConnected,
      gmailConnectedAt,
      legalConsentVersion: LEGAL_CONSENT_VERSION,
    };
    res.json(payload);
  });

  // Ensure schema migrated lazily on first API request when DB becomes configured
  app.use('/api', async (req, res, next) => {
    if (req.path === '/health' || req.path === '/system/status') {
      next();
      return;
    }
    if (isDatabaseConfigured()) {
      try {
        await runMigrationsAndSeed();
      } catch (err) {
        res.status(503).json({
          error: 'DATABASE_MIGRATION_FAILED',
          message: err instanceof Error ? err.message : 'Database initialization failed.',
        });
        return;
      }
    }
    next();
  });

  app.use('/api/auth', authRouter);
  app.use('/api/super-admin', superAdminRouter);
  app.use('/api/public', publicRouter);
  app.use('/api/applications', applicationsRouter);
  app.use('/api/invites', invitesRouter);
  app.use('/api/departments', departmentsRouter);
  app.use('/api/eb', ebRouter);
  app.use('/api/qr', qrRouter);
  app.use('/api/emails', emailsRouter);
  app.use('/api/cms', cmsRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API_NOT_FOUND', message: 'Endpoint not found.' });
  });

  // Centralized safe JSON error handler (never leaks raw stack traces)
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      const msg = err instanceof Error ? err.message : 'Internal server error';
      if (msg === 'DATABASE_NOT_CONFIGURED') {
        res.status(503).json({
          error: 'DATABASE_NOT_CONFIGURED',
          message: 'Neon PostgreSQL DATABASE_URL is not configured.',
        });
        return;
      }
      console.error('[api-error]', msg);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Unexpected server error.' });
    }
  );

  return app;
}
