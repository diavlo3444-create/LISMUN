import type { NextFunction, Request, Response } from 'express';
import { getPool, isDatabaseConfigured } from '../db/pool.ts';
import {
  getPrimarySuperAdminEmail,
  hashOpaqueToken,
  verifyHmacPayload,
} from '../services/crypto.ts';
import {
  getActorGenderScope,
  hasPermission,
  isSectionedDepartment,
  sanitizePermissionsMap,
} from '../../shared/permissions.ts';
import type {
  DepartmentRecord,
  GenderSection,
  PermissionKey,
  TestSessionContext,
  UserProfile,
} from '../../shared/types.ts';

export interface AuthenticatedRequest extends Request {
  authUser?: UserProfile;
  effectiveActor?: UserProfile;
  testSession?: TestSessionContext | null;
  departments?: DepartmentRecord[];
  sessionTokenHash?: string;
}

export async function loadDepartments(): Promise<DepartmentRecord[]> {
  if (!isDatabaseConfigured()) return [];
  const pool = getPool();
  const res = await pool.query<DepartmentRecord>(
    `SELECT id, slug, name, description, is_sectioned, has_public_intake, registration_open, updated_at
     FROM departments
     ORDER BY name ASC`
  );
  return res.rows;
}

export async function resolveProfileByUserId(userId: string): Promise<UserProfile | null> {
  const pool = getPool();
  const res = await pool.query<UserProfile & { banned_until: string | null }>(
    `SELECT
      p.user_id,
      p.email,
      p.full_name,
      p.role,
      p.department_id,
      COALESCE(d.slug, p.department_slug) AS department_slug,
      d.name AS department_name,
      p.title,
      p.division,
      p.gender,
      p.phone,
      p.is_active,
      p.eb_rank,
      p.eb_permissions,
      p.permissions,
      p.reporting_head_id,
      p.created_at,
      p.updated_at,
      u.banned_until
    FROM profiles p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN departments d ON d.id = p.department_id
    WHERE p.user_id = $1
    LIMIT 1`,
    [userId]
  );

  const row = res.rows[0];
  if (!row) return null;
  if (row.banned_until && new Date(row.banned_until).getTime() > Date.now()) {
    return null;
  }

  const primaryEmail = getPrimarySuperAdminEmail();
  const isPrimarySuperAdmin =
    Boolean(primaryEmail) && row.email.toLowerCase() === primaryEmail;
  const effectiveRole = isPrimarySuperAdmin ? 'super_admin' : row.role;

  return {
    user_id: row.user_id,
    email: row.email,
    full_name: row.full_name,
    role: effectiveRole,
    department_id: row.department_id,
    department_slug: row.department_slug,
    department_name: row.department_name,
    title: row.title,
    division: row.division,
    gender: row.gender,
    phone: row.phone,
    is_active: row.is_active,
    eb_rank: row.eb_rank,
    eb_permissions: row.eb_permissions ?? {},
    permissions: sanitizePermissionsMap(effectiveRole, row.permissions),
    reporting_head_id: row.reporting_head_id,
    is_primary_super_admin: isPrimarySuperAdmin,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function requireDbMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!isDatabaseConfigured()) {
    res.status(503).json({
      error: 'DATABASE_NOT_CONFIGURED',
      message: 'Neon PostgreSQL DATABASE_URL is not configured in environment secrets.',
    });
    return;
  }
  next();
}

export async function attachAuthOptional(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!isDatabaseConfigured()) {
      next();
      return;
    }
    const authHeader = req.headers.authorization;
    let rawToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : '';

    // Prefer the HttpOnly session cookie so authentication survives page refreshes.
    // Keep bearer-header support for existing clients and integrations.
    if (!rawToken) {
      const cookieHeader = req.headers.cookie || '';
      const sessionCookie = cookieHeader
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith('lismun_session='));
      if (sessionCookie) {
        const value = sessionCookie.slice('lismun_session='.length);
        try {
          rawToken = decodeURIComponent(value).trim();
        } catch {
          rawToken = value.trim();
        }
      }
    }
    if (!rawToken) {
      next();
      return;
    }
    const tokenHash = hashOpaqueToken(rawToken);
    const pool = getPool();
    const sessionRes = await pool.query<{ user_id: string }>(
      `SELECT user_id FROM sessions
       WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
       LIMIT 1`,
      [tokenHash]
    );
    const session = sessionRes.rows[0];
    if (!session) {
      next();
      return;
    }

    const [profile, departments] = await Promise.all([
      resolveProfileByUserId(session.user_id),
      loadDepartments(),
    ]);
    if (!profile || !profile.is_active) {
      next();
      return;
    }

    req.authUser = profile;
    req.effectiveActor = profile;
    req.departments = departments;
    req.sessionTokenHash = tokenHash;

    // Test previews are only honored while the real authenticated actor is an active Super Admin.
    const testTokenHeader = req.headers['x-test-session'];
    const rawTestToken = typeof testTokenHeader === 'string' ? testTokenHeader.trim() : '';
    if (rawTestToken) {
      if (profile.role !== 'super_admin') {
        res.status(401).json({
          error: 'TEST_SESSION_FORBIDDEN',
          message: 'Preview session tokens require an active Super Admin session.',
        });
        return;
      }

      const testTokenHash = hashOpaqueToken(rawTestToken);
      const dbPreviewRes = await pool.query<{
        session_id: string;
        actor_user_id: string;
        actor_email: string;
        target_user_id: string | null;
        department_slug: string;
        section: GenderSection | null;
        expires_at: string;
        revoked_at: string | null;
      }>(
        `SELECT session_id, actor_user_id, actor_email, target_user_id,
                department_slug, section, expires_at, revoked_at
         FROM test_mode_sessions
         WHERE token_hash = $1
         LIMIT 1`,
        [testTokenHash]
      );

      let resolvedSession: {
        sessionId: string;
        actorUserId: string;
        actorEmail: string;
        departmentSlug: string;
        section: GenderSection | null;
        targetUserId: string | null;
        expiresAtIso: string;
      } | null = null;

      const dbRow = dbPreviewRes.rows[0];
      if (dbRow) {
        const expired = new Date(dbRow.expires_at).getTime() <= Date.now();
        if (
          dbRow.revoked_at !== null ||
          expired ||
          dbRow.actor_user_id !== profile.user_id
        ) {
          res.status(401).json({
            error: 'TEST_SESSION_INVALID',
            message: 'Sign In As preview session is invalid, revoked, or expired.',
          });
          return;
        }
        resolvedSession = {
          sessionId: dbRow.session_id,
          actorUserId: dbRow.actor_user_id,
          actorEmail: dbRow.actor_email,
          departmentSlug: dbRow.department_slug,
          section: dbRow.section ?? null,
          targetUserId: dbRow.target_user_id ?? null,
          expiresAtIso: new Date(dbRow.expires_at).toISOString(),
        };
      } else {
        const hmacPayload = verifyHmacPayload<{
          kind: string;
          sessionId: string;
          actorUserId: string;
          actorEmail: string;
          departmentSlug: string;
          section: GenderSection | null;
          targetUserId?: string | null;
        }>(rawTestToken);

        if (
          !hmacPayload ||
          hmacPayload.kind !== 'super_it_test_session' ||
          hmacPayload.actorUserId !== profile.user_id
        ) {
          res.status(401).json({
            error: 'TEST_SESSION_INVALID',
            message: 'Sign In As preview session is invalid or expired.',
          });
          return;
        }

        resolvedSession = {
          sessionId: hmacPayload.sessionId,
          actorUserId: hmacPayload.actorUserId,
          actorEmail: hmacPayload.actorEmail,
          departmentSlug: hmacPayload.departmentSlug,
          section: hmacPayload.section ?? null,
          targetUserId: hmacPayload.targetUserId ?? null,
          expiresAtIso: new Date(hmacPayload.exp * 1000).toISOString(),
        };
      }

      if (resolvedSession.targetUserId) {
        const target = await resolveProfileByUserId(resolvedSession.targetUserId);
        const targetSection =
          target && isSectionedDepartment(resolvedSession.departmentSlug)
            ? getActorGenderScope(target)
            : null;
        const validTarget =
          Boolean(target) &&
          target!.is_active === true &&
          (target!.role === 'department_head' || target!.role === 'executive_board') &&
          Boolean(target!.department_slug) &&
          target!.department_slug === resolvedSession.departmentSlug &&
          targetSection === (resolvedSession.section ?? null);

        // Never fall back to the Super Admin actor if a selected account becomes invalid.
        if (!validTarget || !target) {
          res.status(401).json({
            error: 'TEST_SESSION_TARGET_INVALID',
            message: 'The account being previewed is no longer active or no longer eligible for Sign In As.',
          });
          return;
        }

        req.testSession = {
          active: true,
          sessionId: resolvedSession.sessionId,
          targetUserId: target.user_id,
          departmentSlug: resolvedSession.departmentSlug,
          section: resolvedSession.section ?? null,
          impersonatedName: target.full_name,
          actorEmail: resolvedSession.actorEmail,
          expiresAt: resolvedSession.expiresAtIso,
        };
        req.effectiveActor = target;
      } else {
        const targetDept = departments.find((d) => d.slug === resolvedSession!.departmentSlug);
        if (!targetDept) {
          res.status(401).json({
            error: 'TEST_SESSION_DEPARTMENT_INVALID',
            message: 'The department selected for this preview no longer exists.',
          });
          return;
        }
        req.testSession = {
          active: true,
          sessionId: resolvedSession.sessionId,
          targetUserId: null,
          departmentSlug: resolvedSession.departmentSlug,
          section: resolvedSession.section ?? null,
          impersonatedName: targetDept.name + ' Head (Test Mode)',
          actorEmail: resolvedSession.actorEmail,
          expiresAt: resolvedSession.expiresAtIso,
        };
        req.effectiveActor = {
          ...profile,
          role: 'department_head',
          department_id: targetDept.id,
          department_slug: resolvedSession.departmentSlug,
          department_name: targetDept.name,
          division: resolvedSession.section ?? null,
          gender: resolvedSession.section ?? null,
          title: targetDept.name + ' Head (Test Mode)',
          eb_rank: 'head',
          eb_permissions: {
            manage_department: true,
            manage_committees: resolvedSession.departmentSlug === 'dcc',
            scan_qr: resolvedSession.departmentSlug === 'security',
          },
          permissions: {},
          is_primary_super_admin: false,
        };
      }
    }

    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!isDatabaseConfigured()) {
    res.status(503).json({
      error: 'DATABASE_NOT_CONFIGURED',
      message: 'Neon PostgreSQL DATABASE_URL is not configured.',
    });
    return;
  }
  if (!req.authUser || !req.effectiveActor) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Valid authentication session required.' });
    return;
  }
  next();
}

export function requireSuperAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (
    !req.authUser ||
    req.authUser.role !== 'super_admin' ||
    !req.authUser.is_active ||
    req.testSession?.active
  ) {
    res.status(403).json({
      error: 'FORBIDDEN',
      message: req.testSession?.active
        ? 'Exit Sign In As preview mode before using Super Admin controls.'
        : 'Super Admin authority required.',
    });
    return;
  }
  next();
}

export function requirePermission(key: PermissionKey, useRealAuthUser = false) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    // A test preview must never inherit the original Super Admin's permission bypass.
    const actor = req.testSession?.active
      ? req.effectiveActor
      : useRealAuthUser
        ? req.authUser
        : req.effectiveActor;
    if (!actor || !hasPermission(actor, key, req.departments)) {
      res.status(403).json({
        error: 'FORBIDDEN',
        message: `Missing required permission: ${key}`,
      });
      return;
    }
    next();
  };
}
