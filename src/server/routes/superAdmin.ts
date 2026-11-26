import { Router } from 'express';
import { getPool, withTransaction } from '../db/pool.ts';
import {
  generateOpaqueToken,
  getPrimarySuperAdminEmail,
  hashOpaqueToken,
  hashPassword,
  signHmacPayload,
  verifyHmacPayload,
} from '../services/crypto.ts';
import { ensureQrPassForUser } from '../services/qrService.ts';
import {
  attachAuthOptional,
  requireAuth,
  requirePermission,
  requireSuperAdmin,
  type AuthenticatedRequest,
} from '../middleware/auth.ts';
import {
  canonicalDepartmentForStorage,
  isSectionedDepartment,
  sanitizePermissionsMap,
} from '../../shared/permissions.ts';
import type { GenderSection, UserRole } from '../../shared/types.ts';

export const superAdminRouter = Router();

superAdminRouter.use(attachAuthOptional);
superAdminRouter.use(requireAuth);

// Single-use Test Mode launch ticket store (HMAC signed + 1-time consumed)
const consumedTickets = new Map<string, number>();

// GET /api/super-admin/accounts (Super Admin full CRUD list OR Admin read-only directory)
superAdminRouter.get(
  '/accounts',
  requirePermission('accounts.view', true),
  async (_req: AuthenticatedRequest, res, next) => {
    try {
      const pool = getPool();
      const [profilesRes, allowlistRes, violationsRes] = await Promise.all([
        pool.query(
          `SELECT p.*, COALESCE(d.slug, p.department_slug) AS department_slug, d.name AS department_name, u.banned_until
           FROM profiles p
           JOIN users u ON u.id = p.user_id
           LEFT JOIN departments d ON d.id = p.department_id
           ORDER BY p.created_at DESC`
        ),
        pool.query(
          `SELECT a.*, d.slug AS department_slug, d.name AS department_name
           FROM eb_signup_allowlist a
           LEFT JOIN departments d ON d.id = a.department_id
           ORDER BY a.created_at DESC`
        ),
        pool.query(
          `SELECT * FROM security_violation_logs ORDER BY created_at DESC LIMIT 100`
        ),
      ]);

      const primaryEmail = getPrimarySuperAdminEmail();
      const accounts = profilesRes.rows.map((r) => ({
        ...r,
        is_primary_super_admin: Boolean(primaryEmail) && r.email.toLowerCase() === primaryEmail,
      }));

      res.json({
        accounts,
        ebAllowlist: allowlistRes.rows,
        securityViolations: violationsRes.rows,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/super-admin/accounts/bulk — Super Admin only
// Uses the same password hashing, profile, QR pass, and one-time setup-link flow as single-account provisioning.
superAdminRouter.post(
  '/accounts/bulk',
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
      if (!rows.length || rows.length > 100) {
        res.status(400).json({ error: 'INVALID_BATCH', message: 'Provide between 1 and 100 roster rows.' });
        return;
      }

      const pool = getPool();
      const seen = new Set<string>();
      const results: Array<{ row: number; email: string; full_name: string; status: 'created' | 'skipped' | 'failed'; setupLink?: string; reason?: string }> = [];

      for (let index = 0; index < rows.length; index += 1) {
        const raw = rows[index] ?? {};
        const email = String(raw.email ?? '').trim().toLowerCase();
        const fullName = String(raw.full_name ?? raw.name ?? '').trim();
        const rawRole = String(raw.role ?? 'staff').trim() as UserRole;
        const rawDept = String(raw.department_slug ?? raw.department ?? '').trim();
        const departmentSlug = rawDept ? canonicalDepartmentForStorage(rawDept) : null;
        // Secretariat roster members must always receive Admin-level account permissions,
        // regardless of the role value supplied in the CSV.
        const role: UserRole = departmentSlug === 'secretariat' ? 'admin' : rawRole;
        const gender = (raw.gender || raw.division || null) as GenderSection | null;
        const title = String(raw.title ?? '').trim();
        const ebRank = raw.eb_rank ?? null;

        const fail = (reason: string) => results.push({
          row: index + 1, email, full_name: fullName, status: 'failed' as const, reason,
        });

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          fail('A valid email address is required.');
          continue;
        }
        if (fullName.length < 2) {
          fail('Full name must contain at least 2 characters.');
          continue;
        }
        if (!['admin', 'department_head', 'executive_board', 'staff'].includes(role)) {
          fail('Role must be admin, department_head, executive_board, or staff.');
          continue;
        }
        if (seen.has(email)) {
          results.push({ row: index + 1, email, full_name: fullName, status: 'skipped', reason: 'Duplicate email in this import.' });
          continue;
        }
        seen.add(email);

        if (role === 'department_head' && departmentSlug && isSectionedDepartment(departmentSlug) && !gender) {
          fail(`Select male or female division for ${departmentSlug}.`);
          continue;
        }

        try {
          const deptRow = departmentSlug
            ? (await pool.query<{ id: string; slug: string }>(
                'SELECT id, slug FROM departments WHERE slug = $1 LIMIT 1',
                [departmentSlug]
              )).rows[0]
            : null;
          if (departmentSlug && !deptRow) {
            fail(`Unknown department: ${departmentSlug}.`);
            continue;
          }

          const created = await withTransaction(async (client) => {
            const existing = await client.query<{ id: string }>(
              'SELECT id FROM users WHERE lower(email) = $1 LIMIT 1',
              [email]
            );
            if (existing.rows[0]) return { conflict: true as const };

            const userId = (await client.query<{ id: string }>(
              'INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id',
              [email, hashPassword(generateOpaqueToken(24)), fullName]
            )).rows[0].id;

            const permissions = sanitizePermissionsMap(role, {});
            await client.query(
              `INSERT INTO profiles (
                user_id, email, full_name, role, department_id, department_slug,
                title, division, gender, is_active, eb_rank, eb_permissions, permissions
              ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,true,$9,'{}'::jsonb,$10::jsonb)`,
              [userId, email, fullName, role, deptRow?.id ?? null, deptRow?.slug ?? null,
                title || role.replace(/_/g, ' '), gender, ebRank, JSON.stringify(permissions)]
            );

            await ensureQrPassForUser(client, {
              userId, fullName, email, roleLabel: ebRank || role,
              departmentSlug: deptRow?.slug ?? 'general', section: gender,
              holderType: role === 'executive_board' ? 'eb_member' : 'staff',
              phone: null, active: true,
            });

            const rawToken = generateOpaqueToken(32);
            await client.query(
              `INSERT INTO password_setup_tokens (user_id, token_hash, purpose, expires_at, created_by)
               VALUES ($1, $2, 'head_setup', now() + interval '7 days', $3)`,
              [userId, hashOpaqueToken(rawToken), req.authUser!.user_id]
            );
            return { conflict: false as const, setupLink: `/head-setup?token=${rawToken}` };
          });

          if (created.conflict) {
            results.push({ row: index + 1, email, full_name: fullName, status: 'skipped', reason: 'An account with this email already exists.' });
          } else {
            results.push({ row: index + 1, email, full_name: fullName, status: 'created', setupLink: created.setupLink });
          }
        } catch {
          fail('Account could not be created. Check the row and try again.');
        }
      }

      res.status(200).json({
        ok: true,
        summary: {
          created: results.filter((item) => item.status === 'created').length,
          skipped: results.filter((item) => item.status === 'skipped').length,
          failed: results.filter((item) => item.status === 'failed').length,
        },
        results,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/super-admin/accounts (create admin / department_head / executive_board / staff)
superAdminRouter.post(
  '/accounts',
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const email = String(req.body?.email ?? '').trim().toLowerCase();
      const fullName = String(req.body?.full_name ?? '').trim();
      const role = String(req.body?.role ?? 'staff') as UserRole;
      const rawDept = String(req.body?.department_slug ?? '').trim();
      const departmentSlug = rawDept ? canonicalDepartmentForStorage(rawDept) : null;
      const gender = (req.body?.gender || req.body?.division || null) as GenderSection | null;
      const title = String(req.body?.title ?? '').trim();
      const phone = req.body?.phone ? String(req.body.phone).trim() : null;
      const ebRank = req.body?.eb_rank ?? null;
      const ebPermissions = req.body?.eb_permissions ?? {};
      const password = req.body?.password ? String(req.body.password) : '';
      const permissions = sanitizePermissionsMap(role, req.body?.permissions);

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ error: 'INVALID_EMAIL', message: 'Valid email is required.' });
        return;
      }
      if (fullName.length < 2) {
        res.status(400).json({ error: 'INVALID_NAME', message: 'Full name is required.' });
        return;
      }
      if (!['admin', 'department_head', 'executive_board', 'staff'].includes(role)) {
        res.status(400).json({ error: 'INVALID_ROLE', message: 'Invalid target account role.' });
        return;
      }
      if (password && (password.length < 10 || password.length > 128)) {
        res.status(400).json({
          error: 'WEAK_PASSWORD',
          message: 'Password must be 10–128 characters if provided.',
        });
        return;
      }
      if (role === 'department_head' && departmentSlug && isSectionedDepartment(departmentSlug) && !gender) {
        res.status(400).json({
          error: 'SECTION_REQUIRED',
          message: `Section ('male' or 'female') is required for ${departmentSlug} heads.`,
        });
        return;
      }

      const pool = getPool();
      const deptRow = departmentSlug
        ? (
            await pool.query<{ id: string; slug: string }>(
              `SELECT id, slug FROM departments WHERE slug = $1 LIMIT 1`,
              [departmentSlug]
            )
          ).rows[0]
        : null;

      if (departmentSlug && !deptRow) {
        res.status(400).json({ error: 'UNKNOWN_DEPARTMENT', message: 'Department not found.' });
        return;
      }

      const created = await withTransaction(async (client) => {
        const existing = await client.query<{ id: string }>(
          `SELECT id FROM users WHERE lower(email) = $1 LIMIT 1`,
          [email]
        );
        if (existing.rows[0]) {
          return { conflict: true as const };
        }

        const initialSecret = password || generateOpaqueToken(24);
        const userIns = await client.query<{ id: string }>(
          `INSERT INTO users (email, password_hash, full_name)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [email, hashPassword(initialSecret), fullName]
        );
        const userId = userIns.rows[0].id;

        await client.query(
          `INSERT INTO profiles (
            user_id, email, full_name, role, department_id, department_slug,
            title, division, gender, phone, is_active, eb_rank, eb_permissions, permissions
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11,$12::jsonb,$13::jsonb)`,
          [
            userId,
            email,
            fullName,
            role,
            deptRow?.id ?? null,
            deptRow?.slug ?? null,
            title || role.replace(/_/g, ' '),
            gender,
            gender,
            phone,
            ebRank,
            JSON.stringify(ebPermissions ?? {}),
            JSON.stringify(permissions),
          ]
        );

        await ensureQrPassForUser(client, {
          userId,
          fullName,
          email,
          roleLabel: ebRank || role,
          departmentSlug: deptRow?.slug ?? 'general',
          section: gender,
          holderType: role === 'executive_board' ? 'eb_member' : 'staff',
          phone,
          active: true,
        });

        let setupLink: string | null = null;
        if (!password) {
          const rawTok = generateOpaqueToken(32);
          await client.query(
            `INSERT INTO password_setup_tokens (user_id, token_hash, purpose, expires_at, created_by)
             VALUES ($1, $2, 'head_setup', now() + interval '7 days', $3)`,
            [userId, hashOpaqueToken(rawTok), req.authUser!.user_id]
          );
          setupLink = `/head-setup?token=${rawTok}`;
        }

        return { conflict: false as const, userId, setupLink };
      });

      if ('conflict' in created && created.conflict) {
        res.status(409).json({
          error: 'EMAIL_EXISTS',
          message: 'An account with that email already exists.',
        });
        return;
      }

      res.status(201).json({
        ok: true,
        userId: created.userId,
        setupLink: created.setupLink,
      });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/super-admin/accounts/:userId
superAdminRouter.patch(
  '/accounts/:userId',
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { userId } = req.params;
      const pool = getPool();
      const targetRes = await pool.query<{ email: string; role: UserRole }>(
        `SELECT email, role FROM profiles WHERE user_id = $1 LIMIT 1`,
        [userId]
      );
      const target = targetRes.rows[0];
      if (!target) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Account not found.' });
        return;
      }

      const primaryEmail = getPrimarySuperAdminEmail();
      if (primaryEmail && target.email.toLowerCase() === primaryEmail) {
        if (req.body?.is_active === false || (req.body?.role && req.body.role !== 'super_admin')) {
          res.status(403).json({
            error: 'PRIMARY_PROTECTED',
            message: 'Primary Super Admin cannot be deactivated or demoted.',
          });
          return;
        }
      }

      const nextRole = (req.body?.role ?? target.role) as UserRole;
      const rawDept = req.body?.department_slug;
      const deptSlug =
        rawDept === null
          ? null
          : typeof rawDept === 'string' && rawDept.trim()
          ? canonicalDepartmentForStorage(rawDept)
          : undefined;

      let deptId: string | null | undefined = undefined;
      if (deptSlug !== undefined) {
        if (deptSlug === null) {
          deptId = null;
        } else {
          const d = (
            await pool.query<{ id: string }>(`SELECT id FROM departments WHERE slug = $1 LIMIT 1`, [
              deptSlug,
            ])
          ).rows[0];
          if (!d) {
            res.status(400).json({ error: 'UNKNOWN_DEPARTMENT', message: 'Invalid department.' });
            return;
          }
          deptId = d.id;
        }
      }

      const sanitizedPerms =
        req.body?.permissions !== undefined
          ? sanitizePermissionsMap(nextRole, req.body.permissions)
          : undefined;

      await withTransaction(async (client) => {
        await client.query(
          `UPDATE profiles
           SET full_name = COALESCE($2, full_name),
               role = COALESCE($3, role),
               department_id = CASE WHEN $4::boolean THEN $5::uuid ELSE department_id END,
               department_slug = CASE WHEN $4::boolean THEN $6 ELSE department_slug END,
               title = COALESCE($7, title),
               gender = COALESCE($8, gender),
               division = COALESCE($8, division),
               is_active = COALESCE($9, is_active),
               eb_rank = COALESCE($10, eb_rank),
               eb_permissions = COALESCE($11::jsonb, eb_permissions),
               permissions = COALESCE($12::jsonb, permissions),
               updated_at = now()
           WHERE user_id = $1`,
          [
            userId,
            req.body?.full_name ?? null,
            req.body?.role ?? null,
            deptSlug !== undefined,
            deptId ?? null,
            deptSlug ?? null,
            req.body?.title ?? null,
            req.body?.gender ?? req.body?.division ?? null,
            typeof req.body?.is_active === 'boolean' ? req.body.is_active : null,
            req.body?.eb_rank ?? null,
            req.body?.eb_permissions ? JSON.stringify(req.body.eb_permissions) : null,
            sanitizedPerms ? JSON.stringify(sanitizedPerms) : null,
          ]
        );

        if (typeof req.body?.is_active === 'boolean') {
          await client.query(
            `UPDATE users SET banned_until = $2, updated_at = now() WHERE id = $1`,
            [userId, req.body.is_active ? null : '2126-01-01T00:00:00Z']
          );
          await client.query(
            `UPDATE qr_passes SET active = $2, updated_at = now() WHERE user_id = $1`,
            [userId, req.body.is_active]
          );
          if (!req.body.is_active) {
            await client.query(`UPDATE sessions SET revoked_at = now() WHERE user_id = $1`, [
              userId,
            ]);
          }
        }
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/super-admin/accounts/:userId/reset-password
superAdminRouter.post(
  '/accounts/:userId/reset-password',
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { userId } = req.params;
      const newPassword = String(req.body?.password ?? '');
      const issueSetupLink = Boolean(req.body?.send_setup_link);

      if (!issueSetupLink && (newPassword.length < 10 || newPassword.length > 128)) {
        res.status(400).json({
          error: 'WEAK_PASSWORD',
          message: 'Password must be 10–128 characters.',
        });
        return;
      }

      const pool = getPool();
      if (issueSetupLink) {
        const rawTok = generateOpaqueToken(32);
        await pool.query(
          `INSERT INTO password_setup_tokens (user_id, token_hash, purpose, expires_at, created_by)
           VALUES ($1, $2, 'head_setup', now() + interval '7 days', $3)`,
          [userId, hashOpaqueToken(rawTok), req.authUser!.user_id]
        );
        res.json({ ok: true, setupLink: `/head-setup?token=${rawTok}` });
        return;
      }

      await pool.query(
        `UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`,
        [userId, hashPassword(newPassword)]
      );
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/super-admin/accounts/:userId (safe delete with FK cleanup)
superAdminRouter.delete(
  '/accounts/:userId',
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { userId } = req.params;
      const pool = getPool();
      const target = (
        await pool.query<{ email: string; role: UserRole }>(
          `SELECT email, role FROM profiles WHERE user_id = $1 LIMIT 1`,
          [userId]
        )
      ).rows[0];

      if (!target) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Account not found.' });
        return;
      }
      const primaryEmail = getPrimarySuperAdminEmail();
      if (
        (primaryEmail && target.email.toLowerCase() === primaryEmail) ||
        userId === req.authUser!.user_id
      ) {
        res.status(403).json({
          error: 'CANNOT_DELETE_PRIMARY',
          message: 'Cannot delete the active or Primary Super Admin account.',
        });
        return;
      }

      await withTransaction(async (client) => {
        await client.query(
          `UPDATE eb_signup_allowlist
           SET claimed_at = NULL, claimed_user_id = NULL, claim_started_at = NULL
           WHERE claimed_user_id = $1`,
          [userId]
        );
        await client.query(`DELETE FROM qr_passes WHERE user_id = $1`, [userId]);
        await client.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
        await client.query(`DELETE FROM users WHERE id = $1`, [userId]);
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// EB Allowlist Roster Management (Super Admin only)
superAdminRouter.post(
  '/eb-allowlist',
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const email = String(req.body?.email ?? '').trim().toLowerCase();
      const fullName = String(req.body?.full_name ?? '').trim();
      const deptSlug = canonicalDepartmentForStorage(String(req.body?.department_slug ?? ''));
      const ebRank = String(req.body?.eb_rank ?? 'co_head');
      const gender = (req.body?.gender || null) as GenderSection | null;
      const ebPermissions = req.body?.eb_permissions ?? {};
      const aliases = Array.isArray(req.body?.email_aliases)
        ? req.body.email_aliases.map((a: unknown) => String(a).trim().toLowerCase()).filter(Boolean)
        : [];

      if (!email || !fullName) {
        res.status(400).json({ error: 'INVALID_INPUT', message: 'Email and full name are required.' });
        return;
      }

      const pool = getPool();
      const dept = (
        await pool.query<{ id: string }>(`SELECT id FROM departments WHERE slug = $1 LIMIT 1`, [
          deptSlug,
        ])
      ).rows[0];
      const memberKey = `eb_${generateOpaqueToken(8)}`;

      const row = (
        await pool.query(
          `INSERT INTO eb_signup_allowlist (
            member_key, email, email_aliases, full_name, department_id, eb_rank, eb_permissions, gender
          ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
          ON CONFLICT (email) DO UPDATE SET
            email_aliases = EXCLUDED.email_aliases,
            full_name = EXCLUDED.full_name,
            department_id = EXCLUDED.department_id,
            eb_rank = EXCLUDED.eb_rank,
            eb_permissions = EXCLUDED.eb_permissions,
            gender = EXCLUDED.gender
          RETURNING *`,
          [
            memberKey,
            email,
            aliases,
            fullName,
            dept?.id ?? null,
            ebRank,
            JSON.stringify(ebPermissions),
            gender,
          ]
        )
      ).rows[0];

      res.status(201).json({ entry: row, signupPath: '/eb-signup' });
    } catch (err) {
      next(err);
    }
  }
);

superAdminRouter.delete(
  '/eb-allowlist/:memberKey',
  requireSuperAdmin,
  async (req, res, next) => {
    try {
      await getPool().query(`DELETE FROM eb_signup_allowlist WHERE member_key = $1`, [
        req.params.memberKey,
      ]);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// Super IT Test Mode (1-time launch ticket -> 2h signed HMAC session token)
superAdminRouter.post(
  '/test-mode/launch',
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const departmentSlug = canonicalDepartmentForStorage(String(req.body?.department_slug ?? ''));
      const section = (req.body?.section || null) as GenderSection | null;
      if (!departmentSlug) {
        res.status(400).json({ error: 'DEPARTMENT_REQUIRED', message: 'Select a target department.' });
        return;
      }
      if (isSectionedDepartment(departmentSlug) && !section) {
        res.status(400).json({
          error: 'SECTION_REQUIRED',
          message: `Select 'male' or 'female' section for ${departmentSlug}.`,
        });
        return;
      }

      const ticketId = generateOpaqueToken(12);
      const launchTicket = signHmacPayload(
        {
          kind: 'super_it_launch_ticket',
          ticketId,
          actorUserId: req.authUser!.user_id,
          actorEmail: req.authUser!.email,
          departmentSlug,
          section,
        },
        180
      );

      await getPool().query(
        `INSERT INTO test_mode_audit_logs (actor_user_id, actor_email, department_slug, section, action, details)
         VALUES ($1, $2, $3, $4, 'launch_ticket', $5::jsonb)`,
        [
          req.authUser!.user_id,
          req.authUser!.email,
          departmentSlug,
          section,
          JSON.stringify({ ticketId }),
        ]
      );

      res.json({
        launchTicket,
        launchUrl: `/head?test_ticket=${encodeURIComponent(launchTicket)}`,
      });
    } catch (err) {
      next(err);
    }
  }
);

superAdminRouter.post(
  '/test-mode/consume',
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const launchTicket = String(req.body?.launchTicket ?? '').trim();
      const payload = verifyHmacPayload<{
        kind: string;
        ticketId: string;
        actorUserId: string;
        actorEmail: string;
        departmentSlug: string;
        section: GenderSection | null;
      }>(launchTicket);

      if (
        !payload ||
        payload.kind !== 'super_it_launch_ticket' ||
        payload.actorUserId !== req.authUser!.user_id
      ) {
        res.status(401).json({ error: 'INVALID_TICKET', message: 'Invalid or expired test ticket.' });
        return;
      }
      if (consumedTickets.has(payload.ticketId)) {
        res.status(409).json({
          error: 'TICKET_ALREADY_USED',
          message: 'Launch ticket can only be exchanged once.',
        });
        return;
      }
      consumedTickets.set(payload.ticketId, Date.now());

      const sessionId = generateOpaqueToken(12);
      const sessionToken = signHmacPayload(
        {
          kind: 'super_it_test_session',
          sessionId,
          actorUserId: req.authUser!.user_id,
          actorEmail: req.authUser!.email,
          departmentSlug: payload.departmentSlug,
          section: payload.section,
        },
        7200 // 2h TTL
      );

      await getPool().query(
        `INSERT INTO test_mode_audit_logs (actor_user_id, actor_email, department_slug, section, action, details)
         VALUES ($1, $2, $3, $4, 'session_started', $5::jsonb)`,
        [
          req.authUser!.user_id,
          req.authUser!.email,
          payload.departmentSlug,
          payload.section,
          JSON.stringify({ sessionId }),
        ]
      );

      res.json({
        sessionToken,
        departmentSlug: payload.departmentSlug,
        section: payload.section,
        expiresInSeconds: 7200,
      });
    } catch (err) {
      next(err);
    }
  }
);

superAdminRouter.post(
  '/test-mode/terminate',
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const dept = String(req.body?.department_slug ?? 'unknown');
      await getPool().query(
        `INSERT INTO test_mode_audit_logs (actor_user_id, actor_email, department_slug, section, action)
         VALUES ($1, $2, $3, $4, 'session_terminated')`,
        [req.authUser!.user_id, req.authUser!.email, dept, req.body?.section ?? null]
      );
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

superAdminRouter.get(
  '/test-mode/audit',
  requireSuperAdmin,
  async (_req, res, next) => {
    try {
      const rows = (
        await getPool().query(
          `SELECT * FROM test_mode_audit_logs ORDER BY created_at DESC LIMIT 100`
        )
      ).rows;
      res.json({ logs: rows });
    } catch (err) {
      next(err);
    }
  }
);
