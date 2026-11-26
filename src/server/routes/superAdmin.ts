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
  '/bulk',
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
        const normalizedDepartment = rawDept ? canonicalDepartmentForStorage(rawDept) : null;
        // Secretariat is a special administrative group, not a row in the departments table.
        // Keep its title, grant Admin permissions, and store no department FK.
        const isSecretariat = normalizedDepartment === 'secretariat';
        const departmentSlug = isSecretariat ? null : normalizedDepartment;
        const role: UserRole = isSecretariat ? 'admin' : rawRole;
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
      const targetRes = await pool.query<{
        email: string;
        role: UserRole;
        department_slug: string | null;
        gender: GenderSection | null;
      }>(
        `SELECT p.email, p.role, COALESCE(d.slug, p.department_slug) AS department_slug,
                COALESCE(p.gender, p.division) AS gender
         FROM profiles p
         LEFT JOIN departments d ON d.id = p.department_id
         WHERE p.user_id = $1
         LIMIT 1`,
        [userId]
      );
      const target = targetRes.rows[0];
      if (!target) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Account not found.' });
        return;
      }

      const primaryEmail = getPrimarySuperAdminEmail();
      if (target.role === 'super_admin' || (primaryEmail && target.email.toLowerCase() === primaryEmail)) {
        res.status(403).json({
          error: 'PROTECTED_ACCOUNT',
          message: 'Super Admin accounts cannot be edited, demoted, suspended, or deleted through Account Management.',
        });
        return;
      }

      if (req.body?.role === 'super_admin') {
        res.status(403).json({
          error: 'SUPER_ADMIN_ESCALATION_BLOCKED',
          message: 'Super Admin privileges cannot be assigned through Account Management.',
        });
        return;
      }

      const allowedRoles = new Set<UserRole>(['admin', 'department_head', 'executive_board', 'staff']);
      if (req.body?.role !== undefined && !allowedRoles.has(String(req.body.role) as UserRole)) {
        res.status(400).json({ error: 'INVALID_ROLE', message: 'Select a valid account role.' });
        return;
      }
      const nextRole = (req.body?.role ?? target.role) as UserRole;

      const rawDept = req.body?.department_slug;
      const deptSlug =
        rawDept === undefined
          ? undefined
          : rawDept === null || String(rawDept).trim() === ''
            ? null
            : canonicalDepartmentForStorage(String(rawDept));
      const resultingDeptSlug = deptSlug === undefined ? target.department_slug : deptSlug;

      if (nextRole !== 'admin' && !resultingDeptSlug) {
        res.status(400).json({
          error: 'DEPARTMENT_REQUIRED',
          message: 'Assign a department before saving a Head, Executive Board, or Staff account.',
        });
        return;
      }

      let deptId: string | null | undefined;
      if (deptSlug !== undefined) {
        if (deptSlug === null) {
          deptId = null;
        } else {
          const d = (
            await pool.query<{ id: string }>(
              `SELECT id FROM departments WHERE slug = $1 LIMIT 1`,
              [deptSlug]
            )
          ).rows[0];
          if (!d) {
            res.status(400).json({ error: 'UNKNOWN_DEPARTMENT', message: 'Invalid department.' });
            return;
          }
          deptId = d.id;
        }
      }

      const genderWasProvided = req.body?.gender !== undefined || req.body?.division !== undefined;
      const nextGender = req.body?.gender !== undefined
        ? req.body.gender
        : req.body?.division !== undefined
          ? req.body.division
          : target.gender;

      if (
        (nextRole === 'department_head' || nextRole === 'executive_board') &&
        resultingDeptSlug &&
        isSectionedDepartment(resultingDeptSlug) &&
        nextGender !== 'male' &&
        nextGender !== 'female'
      ) {
        res.status(400).json({
          error: 'SECTION_REQUIRED',
          message: 'Select the male or female section for this department head.',
        });
        return;
      }

      const nextEmail = req.body?.email === undefined
        ? undefined
        : String(req.body.email || '').trim().toLowerCase();
      if (nextEmail !== undefined) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
          res.status(400).json({ error: 'INVALID_EMAIL', message: 'Enter a valid email address.' });
          return;
        }
        if (nextEmail !== target.email.toLowerCase()) {
          const duplicate = (
            await pool.query<{ id: string }>(
              `SELECT id FROM users WHERE lower(email) = $1 AND id <> $2 LIMIT 1`,
              [nextEmail, userId]
            )
          ).rows[0];
          if (duplicate) {
            res.status(409).json({ error: 'EMAIL_EXISTS', message: 'Another account already uses this email address.' });
            return;
          }
        }
      }

      const sanitizedPerms =
        req.body?.permissions !== undefined
          ? sanitizePermissionsMap(nextRole, req.body.permissions)
          : undefined;
      const rawEbPermissions = req.body?.eb_permissions;
      let sanitizedEbPermissions: Record<string, boolean> | undefined;
      if (rawEbPermissions && typeof rawEbPermissions === 'object' && !Array.isArray(rawEbPermissions)) {
        sanitizedEbPermissions = {};
        for (const key of ['manage_department', 'manage_committees', 'scan_qr']) {
          if (typeof rawEbPermissions[key] === 'boolean') {
            sanitizedEbPermissions[key] = rawEbPermissions[key];
          }
        }
      }

      const fullName = req.body?.full_name === undefined ? null : String(req.body.full_name || '').trim();
      if (fullName !== null && fullName.length < 2) {
        res.status(400).json({ error: 'INVALID_NAME', message: 'Enter a valid full name.' });
        return;
      }
      const hasTitle = req.body?.title !== undefined;
      const title = hasTitle ? String(req.body.title || '').trim() : null;
      const hasEbRank = req.body?.eb_rank !== undefined;
      const ebRank = hasEbRank
        ? (req.body.eb_rank ? String(req.body.eb_rank) : null)
        : null;
      const hasEbPermissions = sanitizedEbPermissions !== undefined;
      const hasPermissions = sanitizedPerms !== undefined;
      const isActive = typeof req.body?.is_active === 'boolean' ? req.body.is_active : null;

      await withTransaction(async (client) => {
        await client.query(
          `UPDATE users
           SET email = CASE WHEN $2::boolean THEN $3 ELSE email END,
               full_name = COALESCE($4, full_name),
               banned_until = CASE WHEN $5::boolean THEN $6::timestamptz ELSE banned_until END,
               updated_at = now()
           WHERE id = $1`,
          [
            userId,
            nextEmail !== undefined,
            nextEmail ?? null,
            fullName,
            isActive !== null,
            isActive === false ? '2126-01-01T00:00:00Z' : null,
          ]
        );

        await client.query(
          `UPDATE profiles
           SET full_name = COALESCE($2, full_name),
               email = CASE WHEN $3::boolean THEN $4 ELSE email END,
               role = COALESCE($5, role),
               department_id = CASE WHEN $6::boolean THEN $7::uuid ELSE department_id END,
               department_slug = CASE WHEN $6::boolean THEN $8 ELSE department_slug END,
               title = CASE WHEN $9::boolean THEN $10 ELSE title END,
               gender = CASE WHEN $11::boolean THEN $12 ELSE gender END,
               division = CASE WHEN $11::boolean THEN $12 ELSE division END,
               is_active = COALESCE($13, is_active),
               eb_rank = CASE WHEN $14::boolean THEN $15 ELSE eb_rank END,
               eb_permissions = CASE WHEN $16::boolean THEN $17::jsonb ELSE eb_permissions END,
               permissions = CASE WHEN $18::boolean THEN $19::jsonb ELSE permissions END,
               updated_at = now()
           WHERE user_id = $1`,
          [
            userId,
            fullName,
            nextEmail !== undefined,
            nextEmail ?? null,
            req.body?.role ?? null,
            deptSlug !== undefined,
            deptId ?? null,
            deptSlug ?? null,
            hasTitle,
            title,
            genderWasProvided,
            nextGender ?? null,
            isActive,
            hasEbRank,
            ebRank,
            hasEbPermissions,
            hasEbPermissions ? JSON.stringify(sanitizedEbPermissions) : null,
            hasPermissions,
            hasPermissions ? JSON.stringify(sanitizedPerms) : null,
          ]
        );

        if (isActive !== null) {
          await client.query(
            `UPDATE qr_passes SET active = $2, updated_at = now() WHERE user_id = $1`,
            [userId, isActive]
          );
          if (!isActive) {
            await client.query(
              `UPDATE sessions SET revoked_at = now() WHERE user_id = $1`,
              [userId]
            );
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
      const target = (
        await pool.query<{ role: UserRole }>(
          `SELECT role FROM profiles WHERE user_id = $1 LIMIT 1`,
          [userId]
        )
      ).rows[0];
      if (!target) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Account not found.' });
        return;
      }
      if (target.role === 'super_admin') {
        res.status(403).json({ error: 'PROTECTED_ACCOUNT', message: 'Super Admin accounts cannot be reset here.' });
        return;
      }
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
        target.role === 'super_admin' ||
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

// Super Admin Sign In As and department preview.
// Launch tickets are durably consumed in Postgres so serverless instances cannot replay them.
superAdminRouter.post(
  '/test-mode/launch',
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const pool = getPool();
      const requestedUserId = String(req.body?.user_id ?? '').trim();
      let targetUserId: string | null = null;
      let targetName: string | null = null;
      let targetEmail: string | null = null;
      let targetRole: UserRole | null = null;
      let departmentSlug = '';
      let section: GenderSection | null = null;

      if (requestedUserId) {
        const targetRes = await pool.query<{
          user_id: string;
          email: string;
          full_name: string;
          role: UserRole;
          department_slug: string | null;
          gender: GenderSection | null;
          is_active: boolean;
          banned_until: string | null;
        }>(
          `SELECT p.user_id, p.email, p.full_name, p.role,
                  COALESCE(d.slug, p.department_slug) AS department_slug,
                  COALESCE(p.gender, p.division) AS gender,
                  p.is_active, u.banned_until
           FROM profiles p
           JOIN users u ON u.id = p.user_id
           LEFT JOIN departments d ON d.id = p.department_id
           WHERE p.user_id = $1
           LIMIT 1`,
          [requestedUserId]
        );
        const target = targetRes.rows[0];
        const banned = target?.banned_until
          ? new Date(target.banned_until).getTime() > Date.now()
          : false;
        if (
          !target ||
          !target.is_active ||
          banned ||
          (target.role !== 'department_head' && target.role !== 'executive_board')
        ) {
          res.status(404).json({
            error: 'ACCOUNT_NOT_ELIGIBLE',
            message: 'Choose an active Department Head or Executive Board account to preview.',
          });
          return;
        }
        departmentSlug = canonicalDepartmentForStorage(String(target.department_slug || ''));
        section = target.gender ?? null;
        targetUserId = target.user_id;
        targetName = target.full_name;
        targetEmail = target.email;
        targetRole = target.role;
      } else {
        departmentSlug = canonicalDepartmentForStorage(String(req.body?.department_slug ?? ''));
        section = (req.body?.section || null) as GenderSection | null;
      }

      if (!departmentSlug) {
        res.status(400).json({
          error: 'DEPARTMENT_REQUIRED',
          message: requestedUserId
            ? 'The selected account must have a department assigned.'
            : 'Select a target department.',
        });
        return;
      }

      const departmentExists = (
        await pool.query<{ id: string; slug: string }>(
          `SELECT id, slug FROM departments WHERE slug = $1 LIMIT 1`,
          [departmentSlug]
        )
      ).rows[0];
      if (!departmentExists) {
        res.status(400).json({ error: 'UNKNOWN_DEPARTMENT', message: 'The selected department does not exist.' });
        return;
      }

      if (isSectionedDepartment(departmentSlug) && section !== 'male' && section !== 'female') {
        res.status(400).json({
          error: 'SECTION_REQUIRED',
          message: 'Select the male or female section for ' + departmentSlug + '.',
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
          targetUserId,
        },
        180
      );

      await pool.query(
        `INSERT INTO test_mode_launch_tickets
          (ticket_id, actor_user_id, target_user_id, department_slug, section, expires_at)
         VALUES ($1, $2, $3, $4, $5, now() + interval '3 minutes')`,
        [ticketId, req.authUser!.user_id, targetUserId, departmentSlug, section]
      );

      await pool.query(
        `INSERT INTO test_mode_audit_logs (actor_user_id, actor_email, department_slug, section, action, details)
         VALUES ($1, $2, $3, $4, 'launch_ticket', $5::jsonb)`,
        [
          req.authUser!.user_id,
          req.authUser!.email,
          departmentSlug,
          section,
          JSON.stringify({ ticketId, targetUserId, targetName, targetEmail }),
        ]
      );

      res.json({
        launchTicket,
        launchUrl: '/head?test_ticket=' + encodeURIComponent(launchTicket),
        targetUserId,
        targetName,
        targetRole,
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
        targetUserId?: string | null;
      }>(launchTicket);

      if (
        !payload ||
        payload.kind !== 'super_it_launch_ticket' ||
        payload.actorUserId !== req.authUser!.user_id
      ) {
        res.status(401).json({ error: 'INVALID_TICKET', message: 'Invalid or expired test ticket.' });
        return;
      }

      const pool = getPool();
      const consumed = (
        await pool.query<{
          actor_user_id: string;
          target_user_id: string | null;
          department_slug: string;
          section: GenderSection | null;
        }>(
          `UPDATE test_mode_launch_tickets
           SET consumed_at = now()
           WHERE ticket_id = $1
             AND actor_user_id = $2
             AND consumed_at IS NULL
             AND expires_at > now()
           RETURNING actor_user_id, target_user_id, department_slug, section`,
          [payload.ticketId, req.authUser!.user_id]
        )
      ).rows[0];

      if (
        !consumed ||
        consumed.target_user_id !== (payload.targetUserId ?? null) ||
        consumed.department_slug !== payload.departmentSlug ||
        consumed.section !== (payload.section ?? null)
      ) {
        res.status(409).json({
          error: 'TICKET_ALREADY_USED_OR_EXPIRED',
          message: 'This preview link has already been used or expired. Launch Sign In As again.',
        });
        return;
      }

      if (consumed.target_user_id) {
        const targetRes = await pool.query<{
          role: UserRole;
          is_active: boolean;
          department_slug: string | null;
          gender: GenderSection | null;
          banned_until: string | null;
        }>(
          `SELECT p.role, p.is_active, COALESCE(d.slug, p.department_slug) AS department_slug,
                  COALESCE(p.gender, p.division) AS gender, u.banned_until
           FROM profiles p
           JOIN users u ON u.id = p.user_id
           LEFT JOIN departments d ON d.id = p.department_id
           WHERE p.user_id = $1
           LIMIT 1`,
          [consumed.target_user_id]
        );
        const target = targetRes.rows[0];
        const banned = target?.banned_until
          ? new Date(target.banned_until).getTime() > Date.now()
          : false;
        if (
          !target ||
          !target.is_active ||
          banned ||
          (target.role !== 'department_head' && target.role !== 'executive_board') ||
          target.department_slug !== consumed.department_slug ||
          (target.gender ?? null) !== (consumed.section ?? null)
        ) {
          res.status(409).json({
            error: 'ACCOUNT_CHANGED',
            message: 'The account changed after the preview was launched. Refresh the account list and try again.',
          });
          return;
        }
      }

      const sessionId = generateOpaqueToken(12);
      const sessionToken = signHmacPayload(
        {
          kind: 'super_it_test_session',
          sessionId,
          actorUserId: req.authUser!.user_id,
          actorEmail: req.authUser!.email,
          departmentSlug: consumed.department_slug,
          section: consumed.section,
          targetUserId: consumed.target_user_id,
        },
        7200
      );

      await pool.query(
        `INSERT INTO test_mode_audit_logs (actor_user_id, actor_email, department_slug, section, action, details)
         VALUES ($1, $2, $3, $4, 'session_started', $5::jsonb)`,
        [
          req.authUser!.user_id,
          req.authUser!.email,
          consumed.department_slug,
          consumed.section,
          JSON.stringify({ sessionId, targetUserId: consumed.target_user_id }),
        ]
      );

      res.json({
        sessionToken,
        departmentSlug: consumed.department_slug,
        section: consumed.section,
        targetUserId: consumed.target_user_id,
        expiresInSeconds: 7200,
      });
    } catch (err) {
      next(err);
    }
  }
);

// The termination action is permitted only for the original Super Admin session,
// including while its own preview token is active.
superAdminRouter.post(
  '/test-mode/terminate',
  async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!req.authUser || req.authUser.role !== 'super_admin' || !req.authUser.is_active) {
        res.status(403).json({ error: 'FORBIDDEN', message: 'Super Admin authority required.' });
        return;
      }
      const dept = String(req.body?.department_slug ?? 'unknown');
      await getPool().query(
        `INSERT INTO test_mode_audit_logs (actor_user_id, actor_email, department_slug, section, action, details)
         VALUES ($1, $2, $3, $4, 'session_terminated', $5::jsonb)`,
        [
          req.authUser.user_id,
          req.authUser.email,
          dept,
          req.body?.section ?? null,
          JSON.stringify({ targetUserId: req.body?.target_user_id ?? null }),
        ]
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
