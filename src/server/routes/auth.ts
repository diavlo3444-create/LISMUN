import { Router } from 'express';
import { getPool, isDatabaseConfigured, withTransaction } from '../db/pool.ts';
import {
  generateOpaqueToken,
  getPrimarySuperAdminEmail,
  hashOpaqueToken,
  hashPassword,
  verifyPassword,
} from '../services/crypto.ts';
import { ensureQrPassForUser } from '../services/qrService.ts';
import {
  attachAuthOptional,
  requireAuth,
  requireDbMiddleware,
  resolveProfileByUserId,
  type AuthenticatedRequest,
} from '../middleware/auth.ts';
import { canAccessPortal, resolveUserPermissions } from '../../shared/permissions.ts';
import type { PortalKey } from '../../shared/types.ts';

export const authRouter = Router();

const SESSION_COOKIE = 'lismun_session';
const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

authRouter.use(attachAuthOptional);

// GET /api/auth/session
authRouter.get('/session', async (req: AuthenticatedRequest, res) => {
  if (!isDatabaseConfigured()) {
    res.json({ authenticated: false, dbConfigured: false, user: null, effectiveActor: null });
    return;
  }
  if (!req.authUser || !req.effectiveActor) {
    res.json({ authenticated: false, dbConfigured: true, user: null, effectiveActor: null });
    return;
  }
  res.json({
    authenticated: true,
    dbConfigured: true,
    user: req.authUser,
    effectiveActor: req.effectiveActor,
    resolvedPermissions: resolveUserPermissions(req.effectiveActor, req.departments),
    testSession: req.testSession ?? null,
    departments: req.departments ?? [],
  });
});

// POST /api/auth/claim-super-admin (first-run bootstrap when zero super_admin exists)
authRouter.post('/claim-super-admin', requireDbMiddleware, async (req, res, next) => {
  try {
    const emailRaw = String(req.body?.email ?? '').trim().toLowerCase();
    const fullName = String(req.body?.full_name ?? '').trim();
    const password = String(req.body?.password ?? '');

    if (!emailRaw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
      res.status(400).json({ error: 'INVALID_EMAIL', message: 'Provide a valid email address.' });
      return;
    }
    if (fullName.length < 2) {
      res.status(400).json({ error: 'INVALID_NAME', message: 'Full name is required.' });
      return;
    }
    if (password.length < 10 || password.length > 128) {
      res.status(400).json({
        error: 'WEAK_PASSWORD',
        message: 'Super Admin password must be 10–128 characters.',
      });
      return;
    }

    const configuredPrimary = getPrimarySuperAdminEmail();
    if (configuredPrimary && emailRaw !== configuredPrimary) {
      res.status(403).json({
        error: 'PRIMARY_EMAIL_MISMATCH',
        message: 'Initial Super Admin claim must match PRIMARY_SUPER_ADMIN_EMAIL.',
      });
      return;
    }

    const result = await withTransaction(async (client) => {
      await client.query('LOCK TABLE profiles IN SHARE ROW EXCLUSIVE MODE');
      const countRes = await client.query<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt FROM profiles WHERE role = 'super_admin' AND is_active = true`
      );
      if (Number(countRes.rows[0]?.cnt ?? '0') > 0) {
        return { conflict: true as const };
      }

      const existingUser = await client.query<{ id: string }>(
        `SELECT id FROM users WHERE lower(email) = $1 LIMIT 1`,
        [emailRaw]
      );
      if (existingUser.rows[0]) {
        return { emailTaken: true as const };
      }

      const pwHash = hashPassword(password);
      const userInsert = await client.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, full_name)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [emailRaw, pwHash, fullName]
      );
      const userId = userInsert.rows[0].id;

      await client.query(
        `INSERT INTO profiles (user_id, email, full_name, role, title, is_active)
         VALUES ($1, $2, $3, 'super_admin', 'Chief Information Officer & Super Admin', true)`,
        [userId, emailRaw, fullName]
      );

      await ensureQrPassForUser(client, {
        userId,
        fullName,
        email: emailRaw,
        roleLabel: 'super_admin',
        departmentSlug: 'it',
        holderType: 'staff',
      });

      const sessionToken = generateOpaqueToken(32);
      await client.query(
        `INSERT INTO sessions (user_id, token_hash, portal, expires_at)
         VALUES ($1, $2, 'super_admin', now() + interval '7 days')`,
        [userId, hashOpaqueToken(sessionToken)]
      );

      return { conflict: false as const, userId, sessionToken };
    });

    if ('conflict' in result && result.conflict) {
      res.status(409).json({
        error: 'ALREADY_CLAIMED',
        message: 'A Super Admin account already exists. Sign in instead.',
      });
      return;
    }
    if ('emailTaken' in result && result.emailTaken) {
      res.status(409).json({
        error: 'EMAIL_EXISTS',
        message: 'An account with this email already exists.',
      });
      return;
    }

    const profile = await resolveProfileByUserId(result.userId);
    res.cookie(SESSION_COOKIE, result.sessionToken, SESSION_COOKIE_OPTIONS);
    res.status(201).json({
      token: result.sessionToken,
      user: profile,
      resolvedPermissions: profile ? resolveUserPermissions(profile) : {},
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
authRouter.post('/login', requireDbMiddleware, async (req, res, next) => {
  try {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const expectedPortal = String(req.body?.expectedPortal ?? '').trim() as PortalKey | '';

    if (!email || !password) {
      res.status(400).json({ error: 'MISSING_CREDENTIALS', message: 'Email and password are required.' });
      return;
    }

    const pool = getPool();
    const userRes = await pool.query<{
      id: string;
      email: string;
      password_hash: string;
      banned_until: string | null;
    }>(
      `SELECT id, email, password_hash, banned_until
       FROM users
       WHERE lower(email) = $1
       LIMIT 1`,
      [email]
    );
    const userRow = userRes.rows[0];
    if (!userRow || !verifyPassword(password, userRow.password_hash)) {
      res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' });
      return;
    }

    if (userRow.banned_until && new Date(userRow.banned_until).getTime() > Date.now()) {
      res.status(403).json({
        error: 'ACCOUNT_SUSPENDED',
        message: 'This account has been suspended by the Secretariat.',
      });
      return;
    }

    const profile = await resolveProfileByUserId(userRow.id);
    if (!profile || !profile.is_active) {
      res.status(403).json({
        error: 'ACCOUNT_INACTIVE',
        message: 'Account profile is inactive or unassigned.',
      });
      return;
    }

    const deptRes = await pool.query(
      `SELECT id, slug, name, description, is_sectioned, has_public_intake, registration_open, updated_at
       FROM departments`
    );
    const departments = deptRes.rows;

    if (expectedPortal) {
      const allowed = canAccessPortal(profile, expectedPortal, departments);
      if (!allowed) {
        const denialReason =
          profile.role === 'admin' && expectedPortal === 'security'
            ? 'Admins must sign in via /admin-login and open Security from the Admin Portal.'
            : `Role ${profile.role} cannot access the ${expectedPortal} portal.`;

        await pool.query(
          `INSERT INTO security_violation_logs (user_id, email, expected_portal, actual_role, reason)
           VALUES ($1, $2, $3, $4, $5)`,
          [profile.user_id, profile.email, expectedPortal, profile.role, denialReason]
        );

        res.status(403).json({
          error: 'PORTAL_ACCESS_DENIED',
          message: denialReason,
        });
        return;
      }
    }

    // Ensure QR pass exists for active user
    await ensureQrPassForUser(pool, {
      userId: profile.user_id,
      fullName: profile.full_name,
      email: profile.email,
      roleLabel: profile.eb_rank || profile.role,
      departmentSlug: profile.department_slug || 'general',
      section: profile.gender ?? profile.division ?? null,
      holderType: profile.role === 'executive_board' ? 'eb_member' : 'staff',
      phone: profile.phone,
      reportingHeadId: profile.reporting_head_id,
      active: true,
    });

    const rawToken = generateOpaqueToken(32);
    await pool.query(
      `INSERT INTO sessions (user_id, token_hash, portal, expires_at)
       VALUES ($1, $2, $3, now() + interval '7 days')`,
      [profile.user_id, hashOpaqueToken(rawToken), expectedPortal || profile.role]
    );

    res.cookie(SESSION_COOKIE, rawToken, SESSION_COOKIE_OPTIONS);
    res.json({
      token: rawToken,
      user: profile,
      resolvedPermissions: resolveUserPermissions(profile, departments),
      departments,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
authRouter.post('/logout', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (req.sessionTokenHash) {
      await getPool().query(
        `UPDATE sessions SET revoked_at = now() WHERE token_hash = $1`,
        [req.sessionTokenHash]
      );
    }
    res.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/head-setup (consume /head-setup password token)
authRouter.post('/head-setup', requireDbMiddleware, async (req, res, next) => {
  try {
    const rawToken = String(req.body?.token ?? '').trim();
    const newPassword = String(req.body?.password ?? '');
    if (!rawToken || newPassword.length < 10 || newPassword.length > 128) {
      res.status(400).json({
        error: 'INVALID_INPUT',
        message: 'Valid setup token and 10–128 character password required.',
      });
      return;
    }
    const tokenHash = hashOpaqueToken(rawToken);
    const outcome = await withTransaction(async (client) => {
      const tokRes = await client.query<{
        id: string;
        user_id: string;
        used_at: string | null;
        expires_at: string;
      }>(
        `SELECT id, user_id, used_at, expires_at
         FROM password_setup_tokens
         WHERE token_hash = $1
         FOR UPDATE`,
        [tokenHash]
      );
      const tok = tokRes.rows[0];
      if (!tok || tok.used_at || new Date(tok.expires_at).getTime() <= Date.now()) {
        return null;
      }
      await client.query(
        `UPDATE users SET password_hash = $1, banned_until = NULL, updated_at = now() WHERE id = $2`,
        [hashPassword(newPassword), tok.user_id]
      );
      await client.query(`UPDATE profiles SET is_active = true, updated_at = now() WHERE user_id = $1`, [
        tok.user_id,
      ]);
      await client.query(`UPDATE password_setup_tokens SET used_at = now() WHERE id = $1`, [tok.id]);
      return tok.user_id;
    });

    if (!outcome) {
      res.status(400).json({
        error: 'INVALID_OR_EXPIRED_TOKEN',
        message: 'This setup link is invalid or has already expired.',
      });
      return;
    }

    res.json({ ok: true, message: 'Password saved. You may now sign in.' });
  } catch (err) {
    next(err);
  }
});
