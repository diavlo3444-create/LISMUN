import type { NextFunction, Request, Response } from 'express';
import { getPool, isDatabaseConfigured } from '../db/pool.ts';
import {
  getPrimarySuperAdminEmail,
  hashOpaqueToken,
  verifyHmacPayload,
} from '../services/crypto.ts';
import {
  hasPermission,
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
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!isDatabaseConfigured()) {
      next();
      return;
    }
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }
    const rawToken = authHeader.slice(7).trim();
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

    // Optional Super IT Test Mode header (ONLY honored if real authenticated user is super_admin)
    const testToken = req.headers['x-test-session'];
    if (profile.role === 'super_admin' && typeof testToken === 'string' && testToken.trim()) {
      const payload = verifyHmacPayload<{
        kind: string;
        sessionId: string;
        actorUserId: string;
        actorEmail: string;
        departmentSlug: string;
        section: GenderSection | null;
      }>(testToken.trim());

      if (
        payload &&
        payload.kind === 'super_it_test_session' &&
        payload.actorUserId === profile.user_id
      ) {
        const targetDept = departments.find((d) => d.slug === payload.departmentSlug);
        req.testSession = {
          active: true,
          sessionId: payload.sessionId,
          departmentSlug: payload.departmentSlug,
          section: payload.section ?? null,
          impersonatedName: `${targetDept?.name ?? payload.departmentSlug} Head (Test Mode)`,
          actorEmail: payload.actorEmail,
          expiresAt: new Date(payload.exp * 1000).toISOString(),
        };
        req.effectiveActor = {
          ...profile,
          role: 'department_head',
          department_id: targetDept?.id ?? null,
          department_slug: payload.departmentSlug,
          department_name: targetDept?.name ?? payload.departmentSlug,
          division: payload.section ?? null,
          gender: payload.section ?? null,
          title: `${targetDept?.name ?? payload.departmentSlug} Head (Test Mode)`,
          eb_rank: 'head',
          eb_permissions: {
            manage_department: true,
            manage_committees: payload.departmentSlug === 'dcc',
            scan_qr: payload.departmentSlug === 'security',
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
  if (!req.authUser || req.authUser.role !== 'super_admin' || !req.authUser.is_active) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Super Admin authority required.' });
    return;
  }
  next();
}

export function requirePermission(key: PermissionKey, useRealAuthUser = false) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const actor = useRealAuthUser ? req.authUser : req.effectiveActor;
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
