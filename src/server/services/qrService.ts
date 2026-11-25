import type pg from 'pg';
import {
  generatePassCode,
  generateQrTokenValue,
  hashOpaqueToken,
} from './crypto.ts';
import type { GenderSection, QrPassRecord } from '../../shared/types.ts';

type Queryable = pg.Pool | pg.PoolClient;

export async function ensureQrPassForUser(
  db: Queryable,
  params: {
    userId: string;
    fullName: string;
    email: string;
    roleLabel: string;
    departmentSlug: string;
    section?: GenderSection | null;
    holderType?: 'staff' | 'eb_member';
    phone?: string | null;
    reportingHeadId?: string | null;
    active?: boolean;
  }
): Promise<QrPassRecord> {
  const existing = await db.query<QrPassRecord>(
    `SELECT * FROM qr_passes WHERE user_id = $1 LIMIT 1`,
    [params.userId]
  );

  if (existing.rows[0]) {
    const updated = await db.query<QrPassRecord>(
      `UPDATE qr_passes
       SET full_name = $2,
           email = $3,
           role_label = $4,
           department_slug = $5,
           section = $6,
           phone = COALESCE($7, phone),
           reporting_head_id = COALESCE($8, reporting_head_id),
           active = COALESCE($9, active),
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        existing.rows[0].id,
        params.fullName,
        params.email.toLowerCase(),
        params.roleLabel,
        params.departmentSlug || 'general',
        params.section ?? null,
        params.phone ?? null,
        params.reportingHeadId ?? null,
        params.active ?? true,
      ]
    );
    return updated.rows[0];
  }

  const rawToken = generateQrTokenValue();
  const tokenHash = hashOpaqueToken(rawToken);
  const passCode = generatePassCode();

  const inserted = await db.query<QrPassRecord>(
    `INSERT INTO qr_passes (
      holder_type, user_id, full_name, email, role_label, department_slug,
      section, phone, reporting_head_id, pass_code, token_hash, token_value, active
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *`,
    [
      params.holderType ?? 'staff',
      params.userId,
      params.fullName,
      params.email.toLowerCase(),
      params.roleLabel,
      params.departmentSlug || 'general',
      params.section ?? null,
      params.phone ?? null,
      params.reportingHeadId ?? null,
      passCode,
      tokenHash,
      rawToken,
      params.active ?? true,
    ]
  );

  return inserted.rows[0];
}

export async function syncQrPassForApplication(
  db: Queryable,
  params: {
    applicationId: string;
    fullName: string;
    email: string;
    roleLabel: string;
    departmentSlug: string;
    section?: GenderSection | null;
    active: boolean;
  }
): Promise<QrPassRecord | null> {
  const existing = await db.query<QrPassRecord>(
    `SELECT * FROM qr_passes WHERE application_id = $1 LIMIT 1`,
    [params.applicationId]
  );

  if (!params.active) {
    if (!existing.rows[0]) return null;
    const deactivated = await db.query<QrPassRecord>(
      `UPDATE qr_passes SET active = false, updated_at = now() WHERE id = $1 RETURNING *`,
      [existing.rows[0].id]
    );
    return deactivated.rows[0];
  }

  if (existing.rows[0]) {
    const reactivated = await db.query<QrPassRecord>(
      `UPDATE qr_passes
       SET full_name = $2,
           email = $3,
           role_label = $4,
           department_slug = $5,
           section = $6,
           active = true,
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        existing.rows[0].id,
        params.fullName,
        params.email.toLowerCase(),
        params.roleLabel,
        params.departmentSlug,
        params.section ?? null,
      ]
    );
    return reactivated.rows[0];
  }

  const rawToken = generateQrTokenValue();
  const tokenHash = hashOpaqueToken(rawToken);
  const passCode = generatePassCode();

  const inserted = await db.query<QrPassRecord>(
    `INSERT INTO qr_passes (
      holder_type, application_id, full_name, email, role_label, department_slug,
      section, pass_code, token_hash, token_value, active
    )
    VALUES ('applicant', $1, $2, $3, $4, $5, $6, $7, $8, $9, true)
    RETURNING *`,
    [
      params.applicationId,
      params.fullName,
      params.email.toLowerCase(),
      params.roleLabel,
      params.departmentSlug,
      params.section ?? null,
      passCode,
      tokenHash,
      rawToken,
    ]
  );
  return inserted.rows[0];
}
