import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {
  decryptGmailSecret,
  encryptGmailSecret,
  generateApplicationCode,
  generatePassCode,
  hashOpaqueToken,
  hashPassword,
  signHmacPayload,
  verifyHmacPayload,
  verifyPassword,
} from './services/crypto.ts';
import { createApiApp } from './app.ts';

test('Crypto service: scrypt password hashing, HMAC tokens, and AES-256-GCM Gmail token encryption', () => {
  const hash = hashPassword('DiplomaticSecret123!');
  assert.ok(hash.startsWith('scrypt$'));
  assert.equal(verifyPassword('DiplomaticSecret123!', hash), true);
  assert.equal(verifyPassword('WrongPassword!', hash), false);

  const signed = signHmacPayload({ purpose: 'gmail_oauth', uid: 'u-42' }, 60);
  const verified = verifyHmacPayload<{ purpose: string; uid: string }>(signed);
  assert.equal(verified?.purpose, 'gmail_oauth');
  assert.equal(verified?.uid, 'u-42');

  const tampered = `${signed.slice(0, -1)}X`;
  assert.equal(verifyHmacPayload(tampered), null);

  const expired = signHmacPayload({ uid: 'u-42' }, -10);
  assert.equal(verifyHmacPayload(expired), null);

  const prevKey = process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
  process.env.GMAIL_TOKEN_ENCRYPTION_KEY = 'unit-test-gmail-encryption-key-2026';
  try {
    const encrypted = encryptGmailSecret('1//0gRefreshTokenSecretValue');
    assert.ok(encrypted.startsWith('v1:'));
    assert.equal(encrypted.includes('RefreshTokenSecretValue'), false);
    assert.equal(decryptGmailSecret(encrypted), '1//0gRefreshTokenSecretValue');
  } finally {
    if (prevKey === undefined) delete process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
    else process.env.GMAIL_TOKEN_ENCRYPTION_KEY = prevKey;
  }

  assert.match(generateApplicationCode('LM'), /^LM-\d{6}-[A-F0-9]{4}$/);
  assert.match(generatePassCode(), /^LMP-[A-F0-9]{8}$/);
  assert.equal(hashOpaqueToken('token-1').length, 64);
});

test('PostgreSQL DDL migration contains all synthesized WEST + WILLOW tables and unique constraints', () => {
  const sqlPath = path.resolve(process.cwd(), 'src/server/db/migrations/001_lismun_core_schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const requiredTables = [
    'departments',
    'users',
    'profiles',
    'sessions',
    'password_setup_tokens',
    'applications',
    'application_medical',
    'staffing_decisions',
    'application_decision_overrides',
    'application_files',
    'inquiries',
    'hr_signup_invites',
    'hr_signup_invite_tokens',
    'eb_invites',
    'eb_signup_links',
    'eb_signup_allowlist',
    'department_records',
    'department_positions',
    'department_tasks',
    'department_task_logs',
    'team_groups',
    'team_group_members',
    'shifts',
    'shift_assignments',
    'eb_stations',
    'eb_shifts',
    'eb_shift_assignments',
    'eb_shift_swaps',
    'eb_tasks',
    'eb_task_comments',
    'eb_announcements',
    'eb_announcement_acks',
    'eb_incidents',
    'qr_passes',
    'qr_scans',
    'qr_correction_logs',
    'qr_attendance_resets',
    'qr_checkins',
    'email_templates',
    'email_deliveries',
    'email_manual_confirmations',
    'gmail_oauth_states',
    'gmail_oauth_credentials',
    'settings',
    'committees',
    'schedule_days',
    'schedule_sessions',
    'secretariat_members',
    'announcements',
    'documents',
    'faqs',
    'sponsors',
    'custom_forms',
    'custom_form_submissions',
    'notifications',
    'security_violation_logs',
    'test_mode_audit_logs',
    'rate_limit_events',
  ];

  for (const tbl of requiredTables) {
    assert.ok(
      sql.includes(`CREATE TABLE IF NOT EXISTS ${tbl}`),
      `Missing table in migration: ${tbl}`
    );
  }

  assert.ok(sql.includes('idx_profiles_unique_active_section_head'));
  assert.ok(sql.includes('idx_applications_unique_pending_track_email'));
  assert.ok(sql.includes('idx_qr_passes_phone_digits_unique'));
  assert.ok(sql.includes('idx_email_deliveries_dedupe_bulk'));
});

test('Express API server boots cleanly and serves truthful health, status, fallback, and 401/503 gates', async () => {
  const prevDbUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;

  const app = createApiApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const addr = server.address();
    assert.ok(addr && typeof addr === 'object');
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    const healthJson = (await healthRes.json()) as { ok: boolean; dbConfigured: boolean; dbConnected: boolean };
    assert.equal(healthJson.ok, true);
    assert.equal(healthJson.dbConfigured, false);
    assert.equal(healthJson.dbConnected, false);

    const statusRes = await fetch(`${baseUrl}/api/system/status`);
    assert.equal(statusRes.status, 200);
    const statusJson = (await statusRes.json()) as {
      ok: boolean;
      dbConfigured: boolean;
      resendConfigured: boolean;
      gmailOAuthConfigured: boolean;
    };
    assert.equal(statusJson.ok, true);
    assert.equal(statusJson.dbConfigured, false);

    const overviewRes = await fetch(`${baseUrl}/api/public/overview`);
    assert.equal(overviewRes.status, 200);
    const overviewJson = (await overviewRes.json()) as { committees: unknown[]; dbConfigured: boolean };
    assert.equal(overviewJson.dbConfigured, false);
    assert.ok(Array.isArray(overviewJson.committees));

    const protectedRes = await fetch(`${baseUrl}/api/applications`);
    assert.ok(protectedRes.status === 401 || protectedRes.status === 503);

    const notFoundRes = await fetch(`${baseUrl}/api/nonexistent-endpoint`);
    assert.equal(notFoundRes.status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    if (prevDbUrl !== undefined) process.env.DATABASE_URL = prevDbUrl;
  }
});

test('Live Neon DB schema + query check (skipped if DATABASE_URL unset)', async (t) => {
  if (!process.env.DATABASE_URL?.trim()) {
    t.skip('DATABASE_URL is not configured in environment');
    return;
  }
  const { runMigrationsAndSeed } = await import('./db/migrate.ts');
  const { getPool } = await import('./db/pool.ts');
  await runMigrationsAndSeed();
  const res = await getPool().query<{ cnt: string }>('SELECT COUNT(*)::text AS cnt FROM departments');
  assert.ok(Number(res.rows[0]?.cnt ?? '0') >= 11);
});

test('Vercel entrypoint normalizes rewritten multi-segment /api/* paths and vercel.json routes API + SPA cleanly', async () => {
  const { normalizeVercelApiRequestUrl } = await import('../../api/index.ts');

  assert.equal(
    normalizeVercelApiRequestUrl('/api/index?__lismun_path=super-admin/test-mode/launch'),
    '/api/super-admin/test-mode/launch'
  );
  assert.equal(
    normalizeVercelApiRequestUrl('/api/index?__lismun_path=public/files/upload&token=abc.123&size=42'),
    '/api/public/files/upload?token=abc.123&size=42'
  );
  assert.equal(
    normalizeVercelApiRequestUrl('/api/index'),
    '/api'
  );
  assert.equal(
    normalizeVercelApiRequestUrl('/api/index', { 'x-vercel-original-path': '/api/health' }),
    '/api/health'
  );
  assert.equal(
    normalizeVercelApiRequestUrl('/api/applications/spoof/audit?limit=10'),
    '/api/applications/spoof/audit?limit=10'
  );

  const vercelConfig = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'vercel.json'), 'utf8')
  ) as {
    functions: Record<string, { includeFiles?: string }>;
    rewrites: Array<{ source: string; destination: string }>;
  };

  assert.ok(vercelConfig.functions['api/index.ts']?.includeFiles?.includes('migrations'));
  assert.equal(vercelConfig.rewrites[0].source, '/api');
  assert.equal(vercelConfig.rewrites[1].source, '/api/(.*)');
  assert.equal(vercelConfig.rewrites[1].destination, '/api/index?__lismun_path=$1');

  const spaRewrite = vercelConfig.rewrites[2];
  assert.ok(spaRewrite.source.includes('(?!api$|api/|assets/|src/)'));
  assert.equal(spaRewrite.destination, '/index.html');

  const spaRegex = new RegExp(`^${spaRewrite.source}$`);
  for (const spaPath of ['/', '/admin', '/admin/overview', '/super-admin', '/head', '/eb', '/apply', '/eb-signup']) {
    assert.equal(spaRegex.test(spaPath), true, `Expected SPA rewrite to match ${spaPath}`);
  }
  for (const apiOrAsset of ['/api', '/api/health', '/api/super-admin/test-mode/launch', '/assets/index.js', '/src/assets/logo.png']) {
    assert.equal(spaRegex.test(apiOrAsset), false, `Expected SPA rewrite NOT to match ${apiOrAsset}`);
  }
});

test('Database migration runner discovers and orders 001 through 005 migrations', async () => {
  const { getOrderedMigrationFiles } = await import('./db/migrate.ts');
  const files = getOrderedMigrationFiles().map((f) => path.basename(f));
  assert.deepEqual(files, [
    '001_lismun_core_schema.sql',
    '002_test_mode_launch_tickets.sql',
    '003_test_mode_sessions.sql',
    '004_account_setup_codes.sql',
    '005_account_setup_tracking.sql',
  ]);
  const sql003 = fs.readFileSync(
    path.resolve(process.cwd(), 'src/server/db/migrations/003_test_mode_sessions.sql'),
    'utf8'
  );
  assert.ok(sql003.includes('CREATE TABLE IF NOT EXISTS test_mode_sessions'));
  assert.ok(sql003.includes('ADD COLUMN IF NOT EXISTS ticket_hash TEXT'));
});

test('Sign In As full lifecycle via Vercel handler: launch, single-use consume, scoped preview, cross-actor block, and Exit Preview revocation', async () => {
  const { setPoolForTests } = await import('./db/pool.ts');
  const { resetMigrationCacheForTests } = await import('./db/migrate.ts');
  const { default: vercelHandler } = await import('../../api/index.ts');
  resetMigrationCacheForTests();

  const superAdminId = '11111111-1111-4111-8111-111111111111';
  const superAdmin2Id = '22222222-2222-4222-8222-222222222222';
  const secHeadId = '33333333-3333-4333-8333-333333333333';
  const ebUserId = '44444444-4444-4444-8444-444444444444';
  const inactiveHeadId = '55555555-5555-4555-8555-555555555555';
  const staffId = '66666666-6666-4666-8666-666666666666';

  const departments = [
    { id: 'd-sec', slug: 'security', name: 'Security & Protocol', description: '', is_sectioned: true, has_public_intake: true, registration_open: true, updated_at: new Date().toISOString() },
    { id: 'd-des', slug: 'design', name: 'Design Studio', description: '', is_sectioned: false, has_public_intake: false, registration_open: true, updated_at: new Date().toISOString() },
  ];

  const users = new Map<string, { id: string; email: string; password_hash: string; banned_until: string | null }>([
    [superAdminId, { id: superAdminId, email: 'root@lismun.org', password_hash: 'unchanged-root', banned_until: null }],
    [superAdmin2Id, { id: superAdmin2Id, email: 'root2@lismun.org', password_hash: 'unchanged-root2', banned_until: null }],
    [secHeadId, { id: secHeadId, email: 'sechead@lismun.org', password_hash: 'unchanged-sec-head-pw', banned_until: null }],
    [ebUserId, { id: ebUserId, email: 'ebsec@lismun.org', password_hash: 'unchanged-eb-pw', banned_until: null }],
    [inactiveHeadId, { id: inactiveHeadId, email: 'inactive@lismun.org', password_hash: 'unchanged-inactive', banned_until: null }],
    [staffId, { id: staffId, email: 'staff@lismun.org', password_hash: 'unchanged-staff', banned_until: null }],
  ]);

  const profiles = new Map<string, Record<string, unknown>>([
    [superAdminId, {
      user_id: superAdminId, email: 'root@lismun.org', full_name: 'Root Admin', role: 'super_admin',
      department_id: null, department_slug: null, department_name: null, title: 'Super Admin',
      division: null, gender: null, phone: null, is_active: true, eb_rank: null,
      eb_permissions: {}, permissions: {}, reporting_head_id: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }],
    [superAdmin2Id, {
      user_id: superAdmin2Id, email: 'root2@lismun.org', full_name: 'Second Root', role: 'super_admin',
      department_id: null, department_slug: null, department_name: null, title: 'Super Admin 2',
      division: null, gender: null, phone: null, is_active: true, eb_rank: null,
      eb_permissions: {}, permissions: {}, reporting_head_id: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }],
    [secHeadId, {
      user_id: secHeadId, email: 'sechead@lismun.org', full_name: 'Tariq Head', role: 'department_head',
      department_id: 'd-sec', department_slug: 'security', department_name: 'Security & Protocol', title: 'Head of Security (Boys)',
      division: 'male', gender: 'male', phone: null, is_active: true, eb_rank: null,
      eb_permissions: {}, permissions: {}, reporting_head_id: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }],
    [ebUserId, {
      user_id: ebUserId, email: 'ebsec@lismun.org', full_name: 'Maya EB', role: 'executive_board',
      department_id: 'd-sec', department_slug: 'security', department_name: 'Security & Protocol', title: 'Security Co-Head',
      division: null, gender: null, phone: null, is_active: true, eb_rank: 'co_head',
      eb_permissions: { manage_department: true, scan_qr: true }, permissions: {}, reporting_head_id: secHeadId,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }],
    [inactiveHeadId, {
      user_id: inactiveHeadId, email: 'inactive@lismun.org', full_name: 'Inactive Head', role: 'department_head',
      department_id: 'd-des', department_slug: 'design', department_name: 'Design Studio', title: 'Design Head',
      division: null, gender: null, phone: null, is_active: false, eb_rank: null,
      eb_permissions: {}, permissions: {}, reporting_head_id: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }],
    [staffId, {
      user_id: staffId, email: 'staff@lismun.org', full_name: 'Regular Staff', role: 'staff',
      department_id: 'd-sec', department_slug: 'security', department_name: 'Security & Protocol', title: 'Guard',
      division: 'male', gender: 'male', phone: null, is_active: true, eb_rank: null,
      eb_permissions: {}, permissions: {}, reporting_head_id: secHeadId,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }],
  ]);

  const superToken1 = 'super-token-1';
  const superToken2 = 'super-token-2';
  const authSessions = new Map<string, string>([
    [hashOpaqueToken(superToken1), superAdminId],
    [hashOpaqueToken(superToken2), superAdmin2Id],
  ]);

  const launchTickets: Array<{
    ticket_id: string;
    ticket_hash: string;
    actor_user_id: string;
    target_user_id: string | null;
    department_slug: string;
    section: string | null;
    expires_at: Date;
    consumed_at: Date | null;
  }> = [];

  const testModeSessions: Array<{
    session_id: string;
    token_hash: string;
    actor_user_id: string;
    actor_email: string;
    target_user_id: string | null;
    department_slug: string;
    section: string | null;
    expires_at: Date;
    revoked_at: Date | null;
  }> = [];

  const auditLogs: Array<Record<string, unknown>> = [];

  const mockPool = {
    async query(sql: string, params: unknown[] = []) {
      const q = sql.replace(/\s+/g, ' ').trim();

      if (q.startsWith('SELECT user_id FROM sessions')) {
        const uid = authSessions.get(String(params[0]));
        return { rows: uid ? [{ user_id: uid }] : [] };
      }
      if (q.startsWith('SELECT id, slug, name, description, is_sectioned')) {
        return { rows: departments };
      }
      if (q.startsWith('SELECT id, slug FROM departments WHERE slug = $1')) {
        const d = departments.find((x) => x.slug === params[0]);
        return { rows: d ? [{ id: d.id, slug: d.slug }] : [] };
      }
      if (q.includes('FROM profiles p JOIN users u ON u.id = p.user_id')) {
        const p = profiles.get(String(params[0]));
        const u = users.get(String(params[0]));
        if (!p || !u) return { rows: [] };
        return { rows: [{ ...p, banned_until: u.banned_until }] };
      }
      if (q.includes('FROM test_mode_sessions WHERE token_hash = $1')) {
        const row = testModeSessions.find((s) => s.token_hash === params[0]);
        return { rows: row ? [row] : [] };
      }
      if (q.startsWith('INSERT INTO test_mode_launch_tickets')) {
        launchTickets.push({
          ticket_id: String(params[0]),
          ticket_hash: String(params[1]),
          actor_user_id: String(params[2]),
          target_user_id: (params[3] as string | null) ?? null,
          department_slug: String(params[4]),
          section: (params[5] as string | null) ?? null,
          expires_at: new Date(Date.now() + 180_000),
          consumed_at: null,
        });
        return { rows: [] };
      }
      if (q.startsWith('UPDATE test_mode_launch_tickets SET consumed_at = now() WHERE ticket_hash = $1')) {
        const row = launchTickets.find(
          (t) =>
            t.ticket_hash === params[0] &&
            t.actor_user_id === params[1] &&
            t.consumed_at === null &&
            t.expires_at.getTime() > Date.now()
        );
        if (!row) return { rows: [] };
        row.consumed_at = new Date();
        return { rows: [row] };
      }
      if (q.startsWith('SELECT actor_user_id, consumed_at, expires_at FROM test_mode_launch_tickets')) {
        const row = launchTickets.find(
          (t) => t.ticket_hash === params[0] || (params[1] && t.ticket_id === params[1])
        );
        return { rows: row ? [row] : [] };
      }
      if (q.startsWith('INSERT INTO test_mode_sessions')) {
        testModeSessions.push({
          session_id: String(params[0]),
          token_hash: String(params[1]),
          actor_user_id: String(params[2]),
          actor_email: String(params[3]),
          target_user_id: (params[4] as string | null) ?? null,
          department_slug: String(params[5]),
          section: (params[6] as string | null) ?? null,
          expires_at: new Date(Date.now() + 7_200_000),
          revoked_at: null,
        });
        return { rows: [] };
      }
      if (q.startsWith('UPDATE test_mode_sessions SET revoked_at = now()')) {
        for (const s of testModeSessions) {
          if (
            s.actor_user_id === params[0] &&
            s.revoked_at === null &&
            ((params[1] && s.token_hash === params[1]) || (params[2] && s.session_id === params[2]))
          ) {
            s.revoked_at = new Date();
          }
        }
        return { rows: [] };
      }
      if (q.startsWith('INSERT INTO test_mode_audit_logs')) {
        auditLogs.push({
          actor_user_id: params[0],
          actor_email: params[1],
          department_slug: params[2],
          section: params[3],
          details: params[4],
        });
        return { rows: [] };
      }
      if (q.startsWith('SELECT * FROM test_mode_audit_logs')) {
        return { rows: auditLogs };
      }
      return { rows: [] };
    },
    async connect() {
      return {
        query: (sql: string, params?: unknown[]) => mockPool.query(sql, params),
        release: () => {},
      };
    },
  };

  const prevDbUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'postgres://mock-for-unit-test';
  setPoolForTests(mockPool as unknown as import('pg').Pool);

  // Route through the actual Vercel entrypoint to verify rewrite normalization end-to-end
  const server = http.createServer((req, res) => {
    void vercelHandler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const addr = server.address();
    assert.ok(addr && typeof addr === 'object');
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    // 1. Ineligible target accounts are rejected cleanly
    const staffLaunch = await fetch(`${baseUrl}/api/index?__lismun_path=super-admin/test-mode/launch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superToken1}` },
      body: JSON.stringify({ user_id: staffId }),
    });
    assert.equal(staffLaunch.status, 404);

    const inactiveLaunch = await fetch(`${baseUrl}/api/index?__lismun_path=super-admin/test-mode/launch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superToken1}` },
      body: JSON.stringify({ user_id: inactiveHeadId }),
    });
    assert.equal(inactiveLaunch.status, 404);

    // 2. Launch for sectioned Executive Board user without gender succeeds & targets /eb
    const ebLaunchRes = await fetch(`${baseUrl}/api/index?__lismun_path=super-admin/test-mode/launch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superToken1}` },
      body: JSON.stringify({ user_id: ebUserId }),
    });
    assert.equal(ebLaunchRes.status, 200);
    const ebLaunch = (await ebLaunchRes.json()) as { launchTicket: string; launchUrl: string; targetRole: string };
    assert.equal(ebLaunch.targetRole, 'executive_board');
    assert.ok(ebLaunch.launchUrl.startsWith('/eb?test_ticket='));

    // 3. Launch for Department Head -> /head?test_ticket=...
    const launchRes = await fetch(`${baseUrl}/api/index?__lismun_path=super-admin/test-mode/launch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superToken1}` },
      body: JSON.stringify({ user_id: secHeadId }),
    });
    assert.equal(launchRes.status, 200);
    const launchJson = (await launchRes.json()) as { launchTicket: string; launchUrl: string; targetRole: string };
    assert.equal(launchJson.targetRole, 'department_head');
    assert.ok(launchJson.launchUrl.startsWith('/head?test_ticket='));

    // 4. Cross-actor consume attempt by another Super Admin is denied
    const crossConsume = await fetch(`${baseUrl}/api/index?__lismun_path=super-admin/test-mode/consume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superToken2}` },
      body: JSON.stringify({ launchTicket: launchJson.launchTicket }),
    });
    assert.equal(crossConsume.status, 401);

    // 5. Consume succeeds once and fails on replay
    const consumeRes = await fetch(`${baseUrl}/api/index?__lismun_path=super-admin/test-mode/consume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superToken1}` },
      body: JSON.stringify({ launchTicket: launchJson.launchTicket }),
    });
    assert.equal(consumeRes.status, 200);
    const consumeJson = (await consumeRes.json()) as {
      sessionToken: string;
      sessionId: string;
      departmentSlug: string;
      section: string;
      targetUserId: string;
      targetRole: string;
    };
    assert.equal(consumeJson.targetUserId, secHeadId);
    assert.equal(consumeJson.departmentSlug, 'security');
    assert.equal(consumeJson.section, 'male');

    const replayRes = await fetch(`${baseUrl}/api/index?__lismun_path=super-admin/test-mode/consume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superToken1}` },
      body: JSON.stringify({ launchTicket: launchJson.launchTicket }),
    });
    assert.equal(replayRes.status, 409);

    // 6. Expired launch ticket fails consume
    const ebTicketRecord = launchTickets.find((t) => t.target_user_id === ebUserId);
    assert.ok(ebTicketRecord);
    ebTicketRecord.expires_at = new Date(Date.now() - 10_000);
    const expiredConsume = await fetch(`${baseUrl}/api/index?__lismun_path=super-admin/test-mode/consume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superToken1}` },
      body: JSON.stringify({ launchTicket: ebLaunch.launchTicket }),
    });
    assert.equal(expiredConsume.status, 409);

    // 7. Preview session enforces scoped actor, preserves real Super Admin identity, and blocks Super Admin endpoints
    const sessRes = await fetch(`${baseUrl}/api/index?__lismun_path=auth/session`, {
      headers: {
        Authorization: `Bearer ${superToken1}`,
        'X-Test-Session': consumeJson.sessionToken,
      },
    });
    assert.equal(sessRes.status, 200);
    const sessJson = (await sessRes.json()) as {
      authenticated: boolean;
      user: { user_id: string; role: string };
      effectiveActor: { user_id: string; role: string; department_slug: string; gender: string };
      resolvedPermissions: Record<string, boolean>;
      testSession: { active: boolean; impersonatedName: string; targetUserId: string };
    };
    assert.equal(sessJson.authenticated, true);
    assert.equal(sessJson.user.user_id, superAdminId);
    assert.equal(sessJson.user.role, 'super_admin');
    assert.equal(sessJson.effectiveActor.user_id, secHeadId);
    assert.equal(sessJson.effectiveActor.role, 'department_head');
    assert.equal(sessJson.effectiveActor.department_slug, 'security');
    assert.equal(sessJson.resolvedPermissions['accounts.manage_admins'], false);
    assert.equal(sessJson.resolvedPermissions['applications.review'], false);
    assert.equal(sessJson.resolvedPermissions['qr.scan'], true);
    assert.equal(sessJson.testSession.active, true);
    assert.equal(sessJson.testSession.impersonatedName, 'Tariq Head');

    // Blocked Super Admin routes while previewing
    const blockedAccounts = await fetch(`${baseUrl}/api/index?__lismun_path=super-admin/accounts`, {
      headers: {
        Authorization: `Bearer ${superToken1}`,
        'X-Test-Session': consumeJson.sessionToken,
      },
    });
    assert.equal(blockedAccounts.status, 403);

    const blockedNestedLaunch = await fetch(`${baseUrl}/api/index?__lismun_path=super-admin/test-mode/launch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superToken1}`,
        'X-Test-Session': consumeJson.sessionToken,
      },
      body: JSON.stringify({ user_id: ebUserId }),
    });
    assert.equal(blockedNestedLaunch.status, 403);

    // Cross-account preview token use rejected
    const crossUseRes = await fetch(`${baseUrl}/api/index?__lismun_path=auth/session`, {
      headers: {
        Authorization: `Bearer ${superToken2}`,
        'X-Test-Session': consumeJson.sessionToken,
      },
    });
    assert.equal(crossUseRes.status, 401);

    // 8. Exit Preview terminates & revokes session cleanly without altering target password
    const termRes = await fetch(`${baseUrl}/api/index?__lismun_path=super-admin/test-mode/terminate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superToken1}`,
        'X-Test-Session': consumeJson.sessionToken,
      },
      body: JSON.stringify({
        session_id: consumeJson.sessionId,
        department_slug: 'security',
        section: 'male',
        target_user_id: secHeadId,
      }),
    });
    assert.equal(termRes.status, 200);

    // Revoked token rejected fail-closed
    const revokedRes = await fetch(`${baseUrl}/api/index?__lismun_path=auth/session`, {
      headers: {
        Authorization: `Bearer ${superToken1}`,
        'X-Test-Session': consumeJson.sessionToken,
      },
    });
    assert.equal(revokedRes.status, 401);

    // Original Super Admin session works normally once preview token cleared
    const restoredRes = await fetch(`${baseUrl}/api/index?__lismun_path=auth/session`, {
      headers: { Authorization: `Bearer ${superToken1}` },
    });
    assert.equal(restoredRes.status, 200);
    const restoredJson = (await restoredRes.json()) as {
      user: { role: string };
      effectiveActor: { role: string };
      testSession: null;
    };
    assert.equal(restoredJson.user.role, 'super_admin');
    assert.equal(restoredJson.effectiveActor.role, 'super_admin');
    assert.equal(restoredJson.testSession, null);

    // Password hashes untouched
    assert.equal(users.get(secHeadId)?.password_hash, 'unchanged-sec-head-pw');
    assert.equal(users.get(ebUserId)?.password_hash, 'unchanged-eb-pw');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    setPoolForTests(null);
    resetMigrationCacheForTests();
    if (prevDbUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevDbUrl;
  }
});

test('Security application end-to-end API flow: upload proof, submit conditional answers, Admin review, and signed file download', async () => {
  const { setPoolForTests } = await import('./db/pool.ts');
  const { resetMigrationCacheForTests } = await import('./db/migrate.ts');
  const { default: vercelHandler } = await import('../../api/index.ts');
  resetMigrationCacheForTests();

  const adminId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const adminToken = 'sec-test-admin-token';
  const storedFiles = new Map<
    string,
    { file_name: string; mime_type: string; content: Buffer }
  >();
  const storedApps: Array<Record<string, unknown>> = [];
  const storedMedical: Array<Record<string, unknown>> = [];
  const authSessions = new Map<string, string>([
    [hashOpaqueToken(adminToken), adminId],
  ]);

  const mockPool = {
    async query(sql: string, params: unknown[] = []) {
      const q = sql.replace(/\s+/g, ' ').trim();
      if (q.startsWith('SELECT user_id FROM sessions')) {
        const uid = authSessions.get(String(params[0]));
        return { rows: uid ? [{ user_id: uid }] : [] };
      }
      if (q.includes('FROM profiles p JOIN users u ON u.id = p.user_id')) {
        if (String(params[0]) !== adminId) return { rows: [] };
        return {
          rows: [
            {
              user_id: adminId,
              email: 'admin@lismun.org',
              full_name: 'Secretariat Admin',
              role: 'admin',
              department_id: null,
              department_slug: null,
              department_name: null,
              title: 'Admin',
              division: null,
              gender: null,
              phone: null,
              is_active: true,
              eb_rank: null,
              eb_permissions: {},
              permissions: {},
              reporting_head_id: null,
              banned_until: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
        };
      }
      if (q.startsWith('SELECT id, slug, name, description, is_sectioned')) {
        return {
          rows: [
            {
              id: 'd-sec',
              slug: 'security',
              name: 'Security & Protocol',
              description: '',
              is_sectioned: true,
              has_public_intake: true,
              registration_open: true,
              updated_at: new Date().toISOString(),
            },
          ],
        };
      }
      if (q.startsWith('SELECT registration_open FROM departments WHERE slug = $1')) {
        return { rows: [{ registration_open: true }] };
      }
      if (q.startsWith('SELECT id, registration_open FROM departments WHERE slug = $1')) {
        return { rows: [{ id: 'd-sec', registration_open: true }] };
      }
      if (q.startsWith('SELECT value FROM settings WHERE key = $1')) {
        return { rows: [{ value: true }] };
      }
      if (q.startsWith('SELECT COUNT(*)::text AS cnt FROM rate_limit_events')) {
        return { rows: [{ cnt: '0' }] };
      }
      if (q.startsWith('INSERT INTO application_files')) {
        storedFiles.set(String(params[0]), {
          file_name: String(params[2]),
          mime_type: String(params[3]),
          content: params[5] as Buffer,
        });
        return { rows: [] };
      }
      if (q.startsWith('SELECT file_name, mime_type, content FROM application_files')) {
        const f = storedFiles.get(String(params[0]));
        return { rows: f ? [f] : [] };
      }
      if (q.startsWith('SELECT id FROM applications WHERE lower(application_type) = $1')) {
        return { rows: [] };
      }
      if (q.startsWith('INSERT INTO applications (')) {
        const record: Record<string, unknown> = {
          id: 'app-sec-1',
          application_code: params[0],
          application_type: params[1],
          department_id: params[2],
          department_slug: params[3],
          applicant_name: params[4],
          email: params[5],
          phone: params[6],
          emergency_phone: params[7],
          gender: params[8],
          institution: params[9],
          grade_or_year: params[10],
          birth_date: params[11],
          age: params[12],
          position: params[13],
          experience: params[14],
          statement: params[15],
          answers: JSON.parse(String(params[16])),
          attachments: JSON.parse(String(params[17])),
          status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        storedApps.push(record);
        return { rows: [record] };
      }
      if (q.startsWith('INSERT INTO application_medical')) {
        storedMedical.push({
          application_id: params[0],
          medical_has_conditions: params[1],
          medical_details: params[2],
        });
        return { rows: [] };
      }
      if (q.includes('FROM applications a')) {
        return {
          rows: storedApps.map((a) => {
            const med = storedMedical.find((m) => m.application_id === a.id);
            return {
              ...a,
              medical_has_conditions: med?.medical_has_conditions ?? false,
              medical_details: med?.medical_details ?? '',
            };
          }),
        };
      }
      if (q.startsWith('SELECT * FROM applications WHERE id = $1')) {
        const found = storedApps.find((a) => a.id === params[0]);
        return { rows: found ? [found] : [] };
      }
      return { rows: [] };
    },
    async connect() {
      return {
        query: (sql: string, params?: unknown[]) => mockPool.query(sql, params),
        release: () => {},
      };
    },
  };

  const prevDbUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'postgres://mock-for-unit-test';
  setPoolForTests(mockPool as unknown as import('pg').Pool);

  const server = http.createServer((req, res) => {
    void vercelHandler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const addr = server.address();
    assert.ok(addr && typeof addr === 'object');
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    // 1. Initialize & upload proof of experience (PNG bytes)
    const sampleBytes = Buffer.from('PNG-PROOF-OF-EXPERIENCE');
    const initRes = await fetch(`${baseUrl}/api/public/files/init-upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        application_type: 'security',
        file_name: 'marshal-cert.png',
        mime_type: 'image/png',
        size_bytes: sampleBytes.length,
      }),
    });
    assert.equal(initRes.status, 200);
    const { uploadUrl } = (await initRes.json()) as { uploadUrl: string };

    const putRes = await fetch(`${baseUrl}${uploadUrl}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: sampleBytes,
    });
    assert.equal(putRes.status, 200);
    const { attachment } = (await putRes.json()) as {
      attachment: { id: string; file_name: string; mime_type: string; size_bytes: number; storage_key: string };
    };
    assert.equal(attachment.file_name, 'marshal-cert.png');

    // 2. Reject missing conditional allergy explanation
    const badSubmit = await fetch(`${baseUrl}/api/public/applications/team`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        track: 'security',
        gender: 'female',
        applicant_name: 'Noura Al-Harbi',
        email: 'noura@example.com',
        grade_or_year: '12th Grade',
        institution: 'Leadership International School',
        phone: '+966501112233',
        emergency_phone: '+966509998877',
        experience: 'Event coordination marshal',
        answers: {
          security_why_join: 'Ready to maintain protocol excellence.',
          security_difference: 'Attentive and calm.',
          security_negligent_teammate: 'Discuss privately and ensure coverage.',
          security_allergies_has: 'Yes',
          security_allergies_details: '',
          security_additional_info_has: 'No',
        },
        attachments: [attachment],
        privacy_policy_accepted: true,
        terms_accepted: true,
      }),
    });
    assert.equal(badSubmit.status, 400);

    // 3. Submit full valid Security application with Yes allergies & No inquiries
    const goodSubmit = await fetch(`${baseUrl}/api/public/applications/team`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        track: 'security',
        gender: 'female',
        applicant_name: 'Noura Al-Harbi',
        email: 'noura@example.com',
        grade_or_year: '12th Grade',
        institution: 'Leadership International School',
        phone: '+966501112233',
        emergency_phone: '+966509998877',
        experience: 'Event coordination marshal',
        answers: {
          security_why_join: 'Ready to maintain protocol excellence.',
          security_difference: 'Attentive and calm.',
          security_negligent_teammate: 'Discuss privately and ensure coverage.',
          security_allergies_has: 'Yes',
          security_allergies_details: 'Mild dust sensitivity',
          security_additional_info_has: 'No',
        },
        attachments: [attachment],
        privacy_policy_accepted: true,
        terms_accepted: true,
      }),
    });
    assert.equal(goodSubmit.status, 201);
    const submitJson = (await goodSubmit.json()) as { ok: boolean; application_code: string };
    assert.equal(submitJson.ok, true);
    assert.ok(submitJson.application_code.startsWith('LM-'));

    // 4. Verify Admin list returns Security answers, synced allergy medical disclosure, and attachment
    const adminList = await fetch(`${baseUrl}/api/applications`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(adminList.status, 200);
    const listJson = (await adminList.json()) as {
      applications: Array<{
        id: string;
        emergency_phone: string;
        medical_has_conditions: boolean;
        medical_details: string;
        answers: Record<string, string>;
        attachments: Array<{ storage_key: string; file_name: string }>;
      }>;
    };
    assert.equal(listJson.applications.length, 1);
    const saved = listJson.applications[0];
    assert.equal(saved.emergency_phone, '+966509998877');
    assert.equal(saved.medical_has_conditions, true);
    assert.equal(saved.medical_details, 'Mild dust sensitivity');
    assert.equal(saved.answers.security_allergies_has, 'Yes');
    assert.equal(saved.attachments[0].file_name, 'marshal-cert.png');

    // 5. Verify Admin can sign & download proof of experience
    const signRes = await fetch(`${baseUrl}/api/applications/${saved.id}/sign-attachment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ storage_key: saved.attachments[0].storage_key }),
    });
    assert.equal(signRes.status, 200);
    const { signedUrl } = (await signRes.json()) as { signedUrl: string };
    const dlRes = await fetch(`${baseUrl}${signedUrl}`);
    assert.equal(dlRes.status, 200);
    const dlBuf = Buffer.from(await dlRes.arrayBuffer());
    assert.equal(dlBuf.toString('utf8'), 'PNG-PROOF-OF-EXPERIENCE');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    setPoolForTests(null);
    resetMigrationCacheForTests();
    if (prevDbUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevDbUrl;
  }
});
