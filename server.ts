import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiApp } from './src/server/app.ts';
import { isDatabaseConfigured } from './src/server/db/pool.ts';
import { runMigrationsAndSeed } from './src/server/db/migrate.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = createApiApp();
  const isProd = process.env.NODE_ENV === 'production';

  if (isDatabaseConfigured()) {
    try {
      await runMigrationsAndSeed();
      console.log('[lismun-db] Neon PostgreSQL schema verified & seeded.');
    } catch (err) {
      console.error(
        '[lismun-db] Schema initialization deferred:',
        err instanceof Error ? err.message : err
      );
    }
  } else {
    console.warn(
      '[lismun-db] DATABASE_URL not set; public showcase active and API DB routes awaiting secret.'
    );
  }

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`[lismun-server] Running on http://0.0.0.0:${port}`);
  });
}

startServer();
