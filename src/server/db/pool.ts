import pg from 'pg';

const { Pool } = pg;

let poolInstance: pg.Pool | null = null;

export function getDatabaseUrl(): string {
  const candidates = [
    process.env.DATABASE_URL,
    process.env.NEON_DATABASE_URL,
    process.env.POSTGRES_URL,
  ];
  for (const raw of candidates) {
    if (raw && raw.trim()) return raw.trim();
  }
  return '';
}

export function isDatabaseConfigured(): boolean {
  return Boolean(getDatabaseUrl());
}

export function getPool(): pg.Pool {
  if (poolInstance) return poolInstance;
  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    throw new Error('DATABASE_NOT_CONFIGURED');
  }
  const requiresSsl =
    connectionString.includes('sslmode=require') ||
    connectionString.includes('neon.tech') ||
    process.env.NODE_ENV === 'production';

  poolInstance = new Pool({
    connectionString,
    max: 12,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: requiresSsl ? { rejectUnauthorized: false } : undefined,
  });

  poolInstance.on('error', (err) => {
    console.error('[neon-pool] unexpected idle client error:', err.message);
  });

  return poolInstance;
}

export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore rollback errors
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
  }
}
