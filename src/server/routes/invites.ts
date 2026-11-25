import { Router } from 'express';
import { getPool, withTransaction } from '../db/pool.ts';
import {
  generateOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  verifyPassword,
} from '../services/crypto.ts';
import { ensureQrPassForUser } from '../services/qrService.ts';
import {
  attachAuthOptional,
  requireAuth,
  requireDbMiddleware,
  type AuthenticatedRequest,
} from '../middleware/auth.ts';
import {
  canonicalDepartmentForStorage,
  canHeadAccessApplication,
  isHrActor,
} from '../../shared/permissions.ts';
import type { ConferenceApplication, GenderSection } from '../../shared/types.ts';

export const invitesRouter = Router();

invitesRouter.use(attachAuthOptional);

// Helper: create or fetch non-expiring HR invite for accepted applicant
export async function issueHrSignupInvite(
  applicationId: string,
  issuerUserId: string
): Promise<{
  error?: { status: number; code: string; message: string };
  inviteUrl?: string;
  legacyHashUrl?: string;
  token?: string;
}> {
  const pool = getPool();
  const appRow = (
    await pool.query<ConferenceApplication>(
      `SELECT * FROM applications WHERE id = $1 LIMIT 1`,
      [applicationId]
    )
  ).rows[0];
  if (!appRow) {
    return { error: { status: 404, code: 'NOT_FOUND', message: 'Application not found.' } };
  }
  if (appRow.status !== 'accepted') {
    return {
      error: {
        status: 409,
        code: 'APPLICANT_NOT_ACCEPTED',
        message: 'Signup invites can only be created for accepted applicants.',
      },
    };
  }

  return withTransaction(async (client) => {
    const existing = (
      await client.query<{
        id: string;
        token_value: string | null;
        token_hash: string;
        claimed_at: string | null;
        revoked_at: string | null;
      }>(
        `SELECT id, token_value, token_hash, claimed_at, revoked_at
         FROM hr_signup_invites
         WHERE application_id = $1
         FOR UPDATE`,
        [applicationId]
      )
    ).rows[0];

    if (existing && existing.claimed_at) {
      return {
        error: {
          status: 409,
          code: 'ALREADY_CLAIMED',
          message: 'This applicant has already completed their account signup.',
        },
      };
    }

    if (existing && !existing.revoked_at && existing.token_value) {
      return {
        token: existing.token_value,
        inviteUrl: `/team-signup?token=${existing.token_value}`,
        legacyHashUrl: `/signup#token=${existing.token_value}`,
      };
    }

    const rawToken = generateOpaqueToken(32);
    const tokenHash = hashOpaqueToken(rawToken);

    if (existing) {
      // Preserve legacy token hash before rotating
      await client.query(
        `INSERT INTO hr_signup_invite_tokens (invite_id, token_hash, token_value)
         VALUES ($1, $2, $3)
         ON CONFLICT (token_hash) DO NOTHING`,
        [existing.id, existing.token_hash, existing.token_value]
      );
      await client.query(
        `UPDATE hr_signup_invites
         SET token_hash = $2, token_value = $3, revoked_at = NULL, issued_by = $4
         WHERE id = $1`,
        [existing.id, tokenHash, rawToken, issuerUserId]
      );
    } else {
      const ins = (
        await client.query<{ id: string }>(
          `INSERT INTO hr_signup_invites (
            application_id, email, department_slug, section, token_hash, token_value, issued_by
          ) VALUES ($1,$2,$3,$4,$5,$6,$7)
          RETURNING id`,
          [
            appRow.id,
            appRow.email.toLowerCase(),
            appRow.department_slug,
            appRow.gender,
            tokenHash,
            rawToken,
            issuerUserId,
          ]
        )
      ).rows[0];

      await client.query(
        `INSERT INTO hr_signup_invite_tokens (invite_id, token_hash, token_value)
         VALUES ($1, $2, $3)`,
        [ins.id, tokenHash, rawToken]
      );
    }

    return {
      token: rawToken,
      inviteUrl: `/team-signup?token=${rawToken}`,
      legacyHashUrl: `/signup#token=${rawToken}`,
    };
  });
}

// POST /api/invites/hr/create
invitesRouter.post('/hr/create', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    const applicationId = String(req.body?.application_id ?? '').trim();
    if (!applicationId) {
      res.status(400).json({ error: 'MISSING_APPLICATION_ID', message: 'application_id required.' });
      return;
    }

    const pool = getPool();
    const appRow = (
      await pool.query<ConferenceApplication>(
        `SELECT * FROM applications WHERE id = $1 LIMIT 1`,
        [applicationId]
      )
    ).rows[0];
    if (!appRow) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Application not found.' });
      return;
    }

    const canIssue =
      actor.role === 'super_admin' ||
      actor.role === 'admin' ||
      isHrActor(actor, req.departments) ||
      canHeadAccessApplication(actor, appRow).scopeMatch;

    if (!canIssue) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Not authorized to issue invites here.' });
      return;
    }

    const result = await issueHrSignupInvite(applicationId, actor.user_id);
    if (result.error) {
      res.status(result.error.status).json({
        error: result.error.code,
        message: result.error.message,
      });
      return;
    }
    res.json({
      ok: true,
      inviteUrl: result.inviteUrl,
      legacyHashUrl: result.legacyHashUrl,
      token: result.token,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/invites/hr/create-batch (1-25 accepted IDs)
invitesRouter.post('/hr/create-batch', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    const ids = Array.isArray(req.body?.application_ids)
      ? req.body.application_ids.slice(0, 25).map((v: unknown) => String(v))
      : [];
    if (ids.length === 0) {
      res.status(400).json({ error: 'EMPTY_BATCH', message: 'Provide 1–25 application IDs.' });
      return;
    }
    const isGlobal =
      actor.role === 'super_admin' || actor.role === 'admin' || isHrActor(actor, req.departments);
    if (!isGlobal) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Batch invites require Admin or HR.' });
      return;
    }

    const results = [];
    for (const id of ids) {
      const r = await issueHrSignupInvite(id, actor.user_id);
      results.push({ applicationId: id, ...r });
    }
    res.json({ ok: true, results });
  } catch (err) {
    next(err);
  }
});

// POST /api/invites/hr/claim (/team-signup?token=... or /signup#token=...)
invitesRouter.post('/hr/claim', requireDbMiddleware, async (req, res, next) => {
  try {
    const rawToken = String(req.body?.token ?? '').trim();
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    if (!/^[a-f0-9]{64}$/i.test(rawToken)) {
      res.status(400).json({ error: 'INVALID_TOKEN_FORMAT', message: 'Invalid signup token.' });
      return;
    }
    if (!email || password.length < 10 || password.length > 128) {
      res.status(400).json({
        error: 'INVALID_INPUT',
        message: 'Application email and 10–128 character password required.',
      });
      return;
    }

    const tokenHash = hashOpaqueToken(rawToken);
    const claimed = await withTransaction(async (client) => {
      // Match primary OR legacy preserved token hash
      const invRes = await client.query<{
        id: string;
        application_id: string;
        email: string;
        claimed_at: string | null;
        revoked_at: string | null;
      }>(
        `SELECT DISTINCT i.id, i.application_id, i.email, i.claimed_at, i.revoked_at
         FROM hr_signup_invites i
         LEFT JOIN hr_signup_invite_tokens t ON t.invite_id = i.id
         WHERE i.token_hash = $1 OR t.token_hash = $1
         LIMIT 1`,
        [tokenHash]
      );
      const invite = invRes.rows[0];
      if (!invite || invite.revoked_at) {
        return { error: { status: 404, code: 'INVALID_INVITE', message: 'Invite not found or revoked.' } };
      }

      // Row-lock invite
      const lockedInv = (
        await client.query<{ id: string; claimed_at: string | null }>(
          `SELECT id, claimed_at FROM hr_signup_invites WHERE id = $1 FOR UPDATE`,
          [invite.id]
        )
      ).rows[0];
      if (lockedInv?.claimed_at) {
        return {
          error: { status: 409, code: 'ALREADY_CLAIMED', message: 'Invite already claimed.' },
        };
      }

      const appRow = (
        await client.query<ConferenceApplication>(
          `SELECT * FROM applications WHERE id = $1 LIMIT 1`,
          [invite.application_id]
        )
      ).rows[0];
      if (!appRow || appRow.status !== 'accepted') {
        return {
          error: {
            status: 409,
            code: 'NOT_ACCEPTED',
            message: 'Application status is no longer accepted.',
          },
        };
      }
      if (appRow.email.toLowerCase() !== email) {
        return {
          error: {
            status: 403,
            code: 'EMAIL_MISMATCH',
            message: 'Email does not match the accepted application.',
          },
        };
      }

      // Determine role from position (Willow MUN auto-promotion pattern)
      const isHeadPos = /\b(co[- ]?head|department head|head of|head)\b/i.test(
        String(appRow.position ?? '')
      );
      const targetRole = isHeadPos ? 'department_head' : 'staff';
      const deptSlug = canonicalDepartmentForStorage(appRow.department_slug);
      const deptRow = (
        await client.query<{ id: string }>(`SELECT id FROM departments WHERE slug = $1 LIMIT 1`, [
          deptSlug,
        ])
      ).rows[0];

      // Anti-hijack check if user email already exists
      const existingUser = (
        await client.query<{ id: string; password_hash: string }>(
          `SELECT id, password_hash FROM users WHERE lower(email) = $1 LIMIT 1`,
          [email]
        )
      ).rows[0];

      let userId: string;
      if (existingUser) {
        if (!verifyPassword(password, existingUser.password_hash)) {
          return {
            error: {
              status: 401,
              code: 'EXISTING_PASSWORD_MISMATCH',
              message: 'Email already exists. Enter your existing account password to link access.',
            },
          };
        }
        const existingProfile = (
          await client.query<{ role: string; is_active: boolean }>(
            `SELECT role, is_active FROM profiles WHERE user_id = $1 LIMIT 1`,
            [existingUser.id]
          )
        ).rows[0];
        if (
          existingProfile &&
          existingProfile.is_active &&
          ['super_admin', 'admin', 'department_head'].includes(existingProfile.role)
        ) {
          return {
            error: {
              status: 409,
              code: 'PRIVILEGED_ACCOUNT_CONFLICT',
              message: 'Existing Admin/Head account cannot be overwritten via staff signup.',
            },
          };
        }
        userId = existingUser.id;
      } else {
        const uIns = await client.query<{ id: string }>(
          `INSERT INTO users (email, password_hash, full_name)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [email, hashPassword(password), appRow.applicant_name]
        );
        userId = uIns.rows[0].id;
      }

      await client.query(
        `INSERT INTO profiles (
          user_id, email, full_name, role, department_id, department_slug,
          title, division, gender, phone, is_active
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)
        ON CONFLICT (user_id) DO UPDATE SET
          full_name = EXCLUDED.full_name,
          role = EXCLUDED.role,
          department_id = EXCLUDED.department_id,
          department_slug = EXCLUDED.department_slug,
          title = EXCLUDED.title,
          division = EXCLUDED.division,
          gender = EXCLUDED.gender,
          phone = EXCLUDED.phone,
          is_active = true,
          updated_at = now()`,
        [
          userId,
          email,
          appRow.applicant_name,
          targetRole,
          deptRow?.id ?? null,
          deptSlug,
          appRow.position || `${deptSlug} ${targetRole === 'department_head' ? 'Head' : 'Staff'}`,
          appRow.gender,
          appRow.gender,
          appRow.phone,
        ]
      );

      await ensureQrPassForUser(client, {
        userId,
        fullName: appRow.applicant_name,
        email,
        roleLabel: targetRole,
        departmentSlug: deptSlug,
        section: appRow.gender,
        holderType: 'staff',
        phone: appRow.phone,
        active: true,
      });

      await client.query(
        `UPDATE hr_signup_invites
         SET claimed_at = now(), claimed_user_id = $2, token_value = NULL
         WHERE id = $1`,
        [invite.id, userId]
      );

      return { ok: true as const, role: targetRole, departmentSlug: deptSlug };
    });

    if ('error' in claimed && claimed.error) {
      res.status(claimed.error.status).json({
        error: claimed.error.code,
        message: claimed.error.message,
      });
      return;
    }

    res.status(201).json({
      ok: true,
      role: claimed.role,
      departmentSlug: claimed.departmentSlug,
      message: 'Account activated. Sign in with your email and password.',
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/invites/eb/active-heads (for public reusable EB Co-Head selector)
invitesRouter.get('/eb/active-heads', requireDbMiddleware, async (_req, res, next) => {
  try {
    const rows = (
      await getPool().query(
        `SELECT user_id, full_name, department_slug, gender, division, title
         FROM profiles
         WHERE role = 'department_head' AND is_active = true
         ORDER BY department_slug ASC, full_name ASC`
      )
    ).rows;
    res.json({ heads: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/invites/eb/admin-create (Admin creates 7-day email-locked invite OR reusable link)
invitesRouter.post('/eb/admin-create', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    if (actor.role !== 'super_admin' && actor.role !== 'admin') {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Admin privileges required.' });
      return;
    }

    const mode = String(req.body?.mode ?? 'personal');
    const pool = getPool();

    if (mode === 'reusable_link') {
      const rawToken = generateOpaqueToken(32);
      await withTransaction(async (client) => {
        await client.query(`UPDATE eb_signup_links SET active = false WHERE active = true`);
        await client.query(
          `INSERT INTO eb_signup_links (token_hash, active, created_by)
           VALUES ($1, true, $2)`,
          [hashOpaqueToken(rawToken), actor.user_id]
        );
      });
      res.status(201).json({ ok: true, signupUrl: `/eb-signup#token=${rawToken}`, token: rawToken });
      return;
    }

    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const deptSlug = canonicalDepartmentForStorage(String(req.body?.department_slug ?? ''));
    const section = (req.body?.section || null) as GenderSection | null;
    const ebRole = String(req.body?.eb_role ?? 'co_head');

    if (!email || !deptSlug) {
      res.status(400).json({ error: 'INVALID_INPUT', message: 'Email and department required.' });
      return;
    }

    const rawToken = generateOpaqueToken(32);
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE eb_invites SET revoked_at = now()
         WHERE lower(email) = $1 AND redeemed_at IS NULL AND revoked_at IS NULL`,
        [email]
      );
      await client.query(
        `INSERT INTO eb_invites (email, department, section, eb_role, token_hash, expires_at, created_by)
         VALUES ($1,$2,$3,$4,$5, now() + interval '7 days', $6)`,
        [email, deptSlug, section, ebRole, hashOpaqueToken(rawToken), actor.user_id]
      );
    });

    res.status(201).json({ ok: true, inviteUrl: `/eb-signup?invite=${rawToken}`, token: rawToken });
  } catch (err) {
    next(err);
  }
});

// POST /api/invites/eb/signup (handles all 3 EB modes cleanly)
invitesRouter.post('/eb/signup', requireDbMiddleware, async (req, res, next) => {
  try {
    const mode = String(req.body?.mode ?? 'allowlist');
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const fullName = String(req.body?.full_name ?? '').trim();
    const phone = String(req.body?.phone ?? '').trim();

    if (!email || password.length < 10 || password.length > 128) {
      res.status(400).json({
        error: 'INVALID_INPUT',
        message: 'Valid email and 10–128 character password required.',
      });
      return;
    }

    const result = await withTransaction(async (client) => {
      // Mode A: 7-day email-locked invite (?invite=)
      if (mode === 'personal_invite') {
        const rawToken = String(req.body?.token ?? '').trim();
        const inv = (
          await client.query<{
            id: string;
            email: string;
            department: string;
            section: GenderSection | null;
            eb_role: string;
            expires_at: string;
            redeemed_at: string | null;
            revoked_at: string | null;
          }>(
            `SELECT * FROM eb_invites WHERE token_hash = $1 FOR UPDATE`,
            [hashOpaqueToken(rawToken)]
          )
        ).rows[0];
        if (!inv || inv.revoked_at || inv.redeemed_at || new Date(inv.expires_at).getTime() <= Date.now()) {
          return { error: { status: 400, code: 'INVALID_INVITE', message: 'Invite invalid or expired.' } };
        }
        if (inv.email.toLowerCase() !== email) {
          return { error: { status: 403, code: 'EMAIL_MISMATCH', message: 'Email does not match invite.' } };
        }
        if (fullName.length < 4) {
          return { error: { status: 400, code: 'NAME_REQUIRED', message: 'Full name required.' } };
        }

        const existingUser = (
          await client.query<{ id: string }>(`SELECT id FROM users WHERE lower(email) = $1`, [email])
        ).rows[0];
        if (existingUser) {
          return { error: { status: 409, code: 'EMAIL_EXISTS', message: 'Email already registered.' } };
        }

        const dept = (
          await client.query<{ id: string }>(`SELECT id FROM departments WHERE slug = $1`, [inv.department])
        ).rows[0];
        const uIns = await client.query<{ id: string }>(
          `INSERT INTO users (email, password_hash, full_name) VALUES ($1,$2,$3) RETURNING id`,
          [email, hashPassword(password), fullName]
        );
        const userId = uIns.rows[0].id;
        await client.query(
          `INSERT INTO profiles (user_id, email, full_name, role, department_id, department_slug, title, division, gender, phone, is_active, eb_rank, eb_permissions)
           VALUES ($1,$2,$3,'executive_board',$4,$5,$6,$7,$7,$8,true,$9,$10::jsonb)`,
          [
            userId,
            email,
            fullName,
            dept?.id ?? null,
            inv.department,
            inv.eb_role,
            inv.section,
            phone || null,
            inv.eb_role === 'co_head' ? 'co_head' : inv.eb_role === 'designer' ? 'designer' : inv.eb_role === 'marketing' ? 'marketing' : 'member',
            JSON.stringify({
              manage_department: inv.eb_role === 'co_head',
              manage_committees: inv.department === 'dcc',
              scan_qr: inv.department === 'security',
            }),
          ]
        );
        await ensureQrPassForUser(client, {
          userId,
          fullName,
          email,
          roleLabel: inv.eb_role,
          departmentSlug: inv.department,
          section: inv.section,
          holderType: 'eb_member',
          phone: phone || null,
        });
        await client.query(`UPDATE eb_invites SET redeemed_at = now() WHERE id = $1`, [inv.id]);
        return { ok: true as const };
      }

      // Mode B: Reusable EB Signup Link (#token=)
      if (mode === 'reusable_link') {
        const rawToken = String(req.body?.token ?? '').trim();
        const link = (
          await client.query<{ id: string }>(
            `SELECT id FROM eb_signup_links WHERE token_hash = $1 AND active = true LIMIT 1`,
            [hashOpaqueToken(rawToken)]
          )
        ).rows[0];
        if (!link) {
          return { error: { status: 400, code: 'INVALID_LINK', message: 'EB signup link inactive.' } };
        }
        const ebRole = String(req.body?.eb_role ?? 'co_head');
        if (!['co_head', 'designer', 'marketing'].includes(ebRole)) {
          return { error: { status: 400, code: 'INVALID_EB_ROLE', message: 'Invalid EB role.' } };
        }
        const digits = phone.replace(/\D/g, '');
        if (digits.length < 7 || digits.length > 15) {
          return { error: { status: 400, code: 'INVALID_PHONE', message: 'Phone must be 7–15 digits.' } };
        }
        const dupPhone = (
          await client.query(
            `SELECT id FROM qr_passes WHERE regexp_replace(phone, '\\D', '', 'g') = $1 LIMIT 1`,
            [digits]
          )
        ).rows[0];
        if (dupPhone) {
          return { error: { status: 409, code: 'DUPLICATE_PHONE', message: 'Phone number already in use.' } };
        }

        let deptSlug = ebRole === 'designer' ? 'design' : ebRole === 'marketing' ? 'marketing' : '';
        let section = (req.body?.gender || null) as GenderSection | null;
        let reportingHeadId: string | null = null;

        if (ebRole === 'co_head') {
          reportingHeadId = String(req.body?.reporting_head_id ?? '').trim();
          const head = (
            await client.query<{
              user_id: string;
              department_slug: string;
              gender: GenderSection | null;
              division: GenderSection | null;
            }>(
              `SELECT user_id, department_slug, gender, division
               FROM profiles
               WHERE user_id = $1 AND role = 'department_head' AND is_active = true
               LIMIT 1`,
              [reportingHeadId]
            )
          ).rows[0];
          if (!head) {
            return {
              error: { status: 400, code: 'HEAD_REQUIRED', message: 'Select an active Reporting Head.' },
            };
          }
          deptSlug = head.department_slug;
          section = head.gender ?? head.division ?? section;
        }

        const existingUser = (
          await client.query<{ id: string }>(`SELECT id FROM users WHERE lower(email) = $1`, [email])
        ).rows[0];
        if (existingUser) {
          return { error: { status: 409, code: 'EMAIL_EXISTS', message: 'Email already registered.' } };
        }

        const dept = (
          await client.query<{ id: string }>(`SELECT id FROM departments WHERE slug = $1`, [deptSlug])
        ).rows[0];
        const uIns = await client.query<{ id: string }>(
          `INSERT INTO users (email, password_hash, full_name) VALUES ($1,$2,$3) RETURNING id`,
          [email, hashPassword(password), fullName]
        );
        const userId = uIns.rows[0].id;
        await client.query(
          `INSERT INTO profiles (user_id, email, full_name, role, department_id, department_slug, title, division, gender, phone, is_active, eb_rank, eb_permissions, reporting_head_id)
           VALUES ($1,$2,$3,'executive_board',$4,$5,$6,$7,$7,$8,true,$9,$10::jsonb,$11)`,
          [
            userId,
            email,
            fullName,
            dept?.id ?? null,
            deptSlug,
            ebRole,
            section,
            phone,
            ebRole,
            JSON.stringify({
              manage_department: ebRole === 'co_head',
              manage_committees: deptSlug === 'dcc',
              scan_qr: deptSlug === 'security',
            }),
            reportingHeadId,
          ]
        );
        await ensureQrPassForUser(client, {
          userId,
          fullName,
          email,
          roleLabel: ebRole,
          departmentSlug: deptSlug,
          section,
          holderType: 'eb_member',
          phone,
          reportingHeadId,
        });
        return { ok: true as const };
      }

      // Mode C: Willow MUN Pre-Approved Allowlist (/eb-signup email + password)
      const allowRows = (
        await client.query<{
          member_key: string;
          email: string;
          full_name: string;
          department_id: string | null;
          eb_rank: string;
          eb_permissions: Record<string, boolean>;
          permissions: Record<string, boolean>;
          gender: GenderSection | null;
          claim_started_at: string | null;
          claimed_at: string | null;
        }>(
          `SELECT * FROM eb_signup_allowlist
           WHERE lower(email) = $1 OR $1 = ANY(email_aliases)
           FOR UPDATE`,
          [email]
        )
      ).rows;

      if (allowRows.length !== 1) {
        return {
          error: {
            status: 403,
            code: 'NOT_ALLOWLISTED',
            message: 'Email is not on the approved Executive Board allowlist.',
          },
        };
      }
      const entry = allowRows[0];
      if (entry.claimed_at) {
        return { error: { status: 409, code: 'ALREADY_CLAIMED', message: 'EB account already claimed.' } };
      }
      if (
        entry.claim_started_at &&
        Date.now() - new Date(entry.claim_started_at).getTime() < 15 * 60 * 1000
      ) {
        return {
          error: { status: 409, code: 'CLAIM_IN_PROGRESS', message: 'Signup currently in progress.' },
        };
      }

      await client.query(
        `UPDATE eb_signup_allowlist SET claim_started_at = now() WHERE member_key = $1`,
        [entry.member_key]
      );

      const dept = entry.department_id
        ? (
            await client.query<{ slug: string }>(
              `SELECT slug FROM departments WHERE id = $1 LIMIT 1`,
              [entry.department_id]
            )
          ).rows[0]
        : null;

      const uIns = await client.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, full_name) VALUES ($1,$2,$3) RETURNING id`,
        [email, hashPassword(password), entry.full_name]
      );
      const userId = uIns.rows[0].id;
      await client.query(
        `INSERT INTO profiles (user_id, email, full_name, role, department_id, department_slug, title, division, gender, is_active, eb_rank, eb_permissions, permissions)
         VALUES ($1,$2,$3,'executive_board',$4,$5,$6,$7,$7,true,$8,$9::jsonb,$10::jsonb)`,
        [
          userId,
          email,
          entry.full_name,
          entry.department_id,
          dept?.slug ?? null,
          entry.eb_rank,
          entry.gender,
          entry.eb_rank,
          JSON.stringify(entry.eb_permissions ?? {}),
          JSON.stringify(entry.permissions ?? {}),
        ]
      );
      await ensureQrPassForUser(client, {
        userId,
        fullName: entry.full_name,
        email,
        roleLabel: entry.eb_rank,
        departmentSlug: dept?.slug ?? 'general',
        section: entry.gender,
        holderType: 'eb_member',
      });
      await client.query(
        `UPDATE eb_signup_allowlist
         SET claimed_at = now(), claimed_user_id = $2, claim_started_at = NULL
         WHERE member_key = $1`,
        [entry.member_key, userId]
      );
      return { ok: true as const };
    });

    if ('error' in result && result.error) {
      res.status(result.error.status).json({
        error: result.error.code,
        message: result.error.message,
      });
      return;
    }

    res.status(201).json({ ok: true, message: 'Executive Board account created. You can now log in.' });
  } catch (err) {
    next(err);
  }
});
