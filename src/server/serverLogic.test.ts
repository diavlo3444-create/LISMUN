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
