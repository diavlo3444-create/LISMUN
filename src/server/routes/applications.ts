import { Router } from 'express';
import { getPool, withTransaction } from '../db/pool.ts';
import { signHmacPayload } from '../services/crypto.ts';
import { syncQrPassForApplication } from '../services/qrService.ts';
import {
  attachAuthOptional,
  requireAuth,
  requirePermission,
  requireSuperAdmin,
  type AuthenticatedRequest,
} from '../middleware/auth.ts';
import {
  canHeadAccessApplication,
  cleanDecisionMakerName,
  hasPermission,
  isDccActor,
  isEbHeadActor,
  isHrActor,
  redactApplicationForHead,
  validateSpoofRequest,
} from '../../shared/permissions.ts';
import type {
  ApplicationStatus,
  ConferenceApplication,
  HeadRecommendation,
} from '../../shared/types.ts';

export const applicationsRouter = Router();

applicationsRouter.use(attachAuthOptional);
applicationsRouter.use(requireAuth);

// GET /api/applications
applicationsRouter.get('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    const pool = getPool();
    const scopeMode = String(req.query.scope ?? '').trim();

    const includeMedical =
      (actor.role === 'super_admin' || actor.role === 'admin') &&
      hasPermission(actor, 'applications.view_confidential', req.departments);

    const rowsRes = await pool.query<ConferenceApplication>(
      includeMedical
        ? `SELECT a.*, m.medical_has_conditions, m.medical_details
           FROM applications a
           LEFT JOIN application_medical m ON m.application_id = a.id
           ORDER BY a.created_at DESC`
        : `SELECT a.* FROM applications a ORDER BY a.created_at DESC`
    );

    const stripMediaMedical = (row: ConferenceApplication): ConferenceApplication => {
      if (includeMedical || !row.answers || typeof row.answers !== 'object' || !('media_medical_concerns' in row.answers)) {
        return row;
      }
      const { media_medical_concerns: _m, ...safeAnswers } = row.answers;
      return { ...row, answers: safeAnswers };
    };

    const allRows = rowsRes.rows;

    // 1. Admin / Super Admin (except when impersonating via Test Mode, because effectiveActor becomes department_head!)
    if (actor.role === 'super_admin' || actor.role === 'admin') {
      if (scopeMode === 'recommended') {
        res.json({
          applications: allRows.filter((a) => Boolean(a.head_recommendation)),
        });
        return;
      }
      res.json({ applications: allRows });
      return;
    }

    // 2. HR Head / HR EB -> Accepted roster (cross-dept & cross-gender), strictly zero medical data
    if (isHrActor(actor, req.departments)) {
      const hrRows = (
        scopeMode === 'hr_roster'
          ? allRows.filter((a) => ['media', 'press', 'security', 'volunteers'].includes(a.application_type))
          : scopeMode === 'hr_accepted'
            ? allRows.filter((a) => a.status === 'accepted')
            : allRows.filter((a) =>
                ['accepted', 'rejected', 'waitlisted'].includes(a.status)
              )
      ).map(stripMediaMedical);
      res.json({ applications: hrRows });
      return;
    }

    // 3. DCC Head -> Delegates & Chairs ONLY (zero team registrations)
    if (isDccActor(actor, req.departments)) {
      const dccRows = allRows
        .filter((a) => a.application_type === 'delegate' || a.application_type === 'chair')
        .map(stripMediaMedical);
      res.json({ applications: dccRows });
      return;
    }

    // 4. Operational Department Heads (media_press / security / volunteers) -> scoped status visibility.
    // Heads can view all statuses in their own department/section; recommendations remain pending-only.
    if (isEbHeadActor(actor)) {
      const visible = allRows
        .filter((a) => canHeadAccessApplication(actor, a).scopeMatch)
        .map((a) => redactApplicationForHead(a));
      res.json({ applications: visible });
      return;
    }

    res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Your role does not permit viewing conference applications.',
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/applications/:id/recommend (Head Stage 1 review, strict probe-safe lock)
applicationsRouter.post('/:id/recommend', async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    const recommendation = req.body?.head_recommendation as HeadRecommendation;
    const headNotes = String(req.body?.head_notes ?? '').trim();

    if (recommendation !== 'recommend_accept' && recommendation !== 'recommend_reject') {
      res.status(400).json({
        error: 'INVALID_RECOMMENDATION',
        message: 'Recommendation must be recommend_accept or recommend_reject.',
      });
      return;
    }

    const pool = getPool();
    const existing = (
      await pool.query<ConferenceApplication>(
        `SELECT * FROM applications WHERE id = $1 LIMIT 1`,
        [req.params.id]
      )
    ).rows[0];

    if (!existing) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Application not found.' });
      return;
    }

    // Evaluate scope BEFORE pending status check to prevent status probing!
    const access = canHeadAccessApplication(actor, existing);
    if (!access.scopeMatch) {
      res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Application is outside your department and section scope.',
      });
      return;
    }
    if (!access.editable) {
      res.status(409).json({
        error: 'DECISION_LOCKED',
        message: 'Application is no longer available for Head review.',
      });
      return;
    }

    const updated = await withTransaction(async (client) => {
      const appRes = await client.query<ConferenceApplication>(
        `UPDATE applications
         SET head_recommendation = $2,
             head_notes = $3,
             recommended_by = $4,
             recommended_by_name = $5,
             recommended_at = now(),
             updated_at = now()
         WHERE id = $1 AND status IN ('pending', 'received')
         RETURNING *`,
        [
          existing.id,
          recommendation,
          headNotes || null,
          actor.user_id,
          actor.full_name,
        ]
      );
      if (!appRes.rows[0]) return null;

      await client.query(
        `INSERT INTO staffing_decisions (
          registration_id, department, section, role_title, head_decision, head_notes, head_user_id, head_submitted_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,now())`,
        [
          existing.id,
          existing.department_slug,
          existing.gender,
          existing.position || existing.application_type,
          recommendation,
          headNotes || null,
          actor.user_id,
        ]
      );

      return redactApplicationForHead(appRes.rows[0]);
    });

    if (!updated) {
      res.status(409).json({
        error: 'DECISION_LOCKED',
        message: 'Application is no longer available for Head review.',
      });
      return;
    }

    res.json({ ok: true, application: updated });
  } catch (err) {
    next(err);
  }
});

// POST /api/applications/:id/sign-attachment (Probe-safe signed download URL)
applicationsRouter.post('/:id/sign-attachment', async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    const storageKey = String(req.body?.storage_key ?? '').trim();
    if (!storageKey) {
      res.status(400).json({ error: 'MISSING_KEY', message: 'storage_key is required.' });
      return;
    }

    const appRow = (
      await getPool().query<ConferenceApplication>(
        `SELECT * FROM applications WHERE id = $1 LIMIT 1`,
        [req.params.id]
      )
    ).rows[0];
    if (!appRow) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Application not found.' });
      return;
    }

    const attachments = Array.isArray(appRow.attachments) ? appRow.attachments : [];
    if (!attachments.some((a) => a.storage_key === storageKey)) {
      res.status(404).json({ error: 'ATTACHMENT_NOT_FOUND', message: 'Attachment not linked.' });
      return;
    }

    const isAdmin = actor.role === 'super_admin' || actor.role === 'admin';
    if (!isAdmin) {
      const check = canHeadAccessApplication(actor, appRow);
      if (!check.scopeMatch) {
        res.status(403).json({ error: 'FORBIDDEN', message: 'Access denied.' });
        return;
      }
      if (!check.editable) {
        res.status(409).json({
          error: 'DECISION_LOCKED',
          message: 'Application is no longer available for Head review.',
        });
        return;
      }
    }

    const downloadToken = signHmacPayload(
      {
        kind: 'signed_attachment_download',
        storageKey,
        userId: actor.user_id,
      },
      300
    );

    res.json({
      signedUrl: `/api/public/files/download?token=${encodeURIComponent(downloadToken)}`,
      expiresInSeconds: 300,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/applications/:id/decision (Admin Stage 2 decision lock + optimistic concurrency)
applicationsRouter.patch('/:id/decision', async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    const nextStatus = String(req.body?.status ?? '') as ApplicationStatus;
    const reviewNotes =
      req.body?.review_notes !== undefined ? String(req.body.review_notes) : null;
    const expectedStatus = req.body?.expected_status
      ? String(req.body.expected_status)
      : undefined;

    if (!['accepted', 'rejected', 'waitlisted', 'under_review', 'pending'].includes(nextStatus)) {
      res.status(400).json({ error: 'INVALID_STATUS', message: 'Unsupported target status.' });
      return;
    }

    const isAdminOrSuper = actor.role === 'super_admin' || actor.role === 'admin';
    const isDcc = isDccActor(actor, req.departments);

    const existing = (
      await getPool().query<ConferenceApplication>(
        `SELECT * FROM applications WHERE id = $1 LIMIT 1`,
        [req.params.id]
      )
    ).rows[0];
    if (!existing) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Application not found.' });
      return;
    }

    if (!isAdminOrSuper) {
      if (!(isDcc && existing.application_type === 'delegate')) {
        res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Only Admins can finalize staff or chair decisions.',
        });
        return;
      }
    }

    if (expectedStatus && existing.status !== expectedStatus) {
      res.status(409).json({
        error: 'CONCURRENT_UPDATE',
        message: 'Application was already updated by another reviewer. Refresh to view changes.',
      });
      return;
    }

    // Two-Stage Decision Lock: non-Super-Admin cannot overwrite another reviewer's finalized decision
    if (
      actor.role !== 'super_admin' &&
      (existing.status === 'accepted' || existing.status === 'rejected') &&
      existing.decision_by &&
      existing.decision_by !== actor.user_id
    ) {
      res.status(403).json({
        error: 'DECISION_OWNED_BY_ANOTHER_ADMIN',
        message: `Locked: already finalized by ${cleanDecisionMakerName(existing.decision_by_name) || 'another Admin'}. Super Admin override required.`,
      });
      return;
    }

    const updated = await withTransaction(async (client) => {
      const isClearToPending = nextStatus === 'pending';
      const decisionBy = isClearToPending ? null : actor.user_id;
      const decisionByName = isClearToPending ? null : cleanDecisionMakerName(actor.full_name);

      const appRes = await client.query<ConferenceApplication>(
        `UPDATE applications
         SET status = $2,
             decision_by = $3,
             decision_by_name = $4,
             decision_at = CASE WHEN $5::boolean THEN NULL ELSE now() END,
             admin_decision_notes = COALESCE($6, admin_decision_notes),
             review_notes = COALESCE($6, review_notes),
             updated_at = now()
         WHERE id = $1 AND status = $7
         RETURNING *`,
        [
          existing.id,
          nextStatus,
          decisionBy,
          decisionByName,
          isClearToPending,
          reviewNotes,
          existing.status,
        ]
      );
      if (!appRes.rows[0]) return null;

      await client.query(
        `UPDATE staffing_decisions
         SET admin_decision = $2, admin_notes = COALESCE($3, admin_notes), admin_reviewed_by = $4, admin_reviewed_at = now(), updated_at = now()
         WHERE registration_id = $1`,
        [existing.id, nextStatus, reviewNotes, actor.user_id]
      );

      await syncQrPassForApplication(client, {
        applicationId: existing.id,
        fullName: existing.applicant_name,
        email: existing.email,
        roleLabel: existing.position || existing.application_type,
        departmentSlug: existing.department_slug,
        section: existing.gender,
        active: nextStatus === 'accepted',
      });

      await client.query(
        `INSERT INTO notifications (user_id, category, title, body)
         VALUES (NULL, 'application', $1, $2)`,
        [
          `Application ${nextStatus}: ${existing.applicant_name}`,
          `${existing.application_code} (${existing.application_type}) marked ${nextStatus} by ${decisionByName ?? actor.full_name}.`,
        ]
      );

      return appRes.rows[0];
    });

    if (!updated) {
      res.status(409).json({
        error: 'CONCURRENT_UPDATE',
        message: 'Concurrent update detected. Please refresh.',
      });
      return;
    }

    res.json({ ok: true, application: updated });
  } catch (err) {
    next(err);
  }
});

// POST /api/applications/:id/override (Super Admin Override with mandatory reason >= 8 chars)
applicationsRouter.post(
  '/:id/override',
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const actor = req.authUser!;
      const nextStatus = String(req.body?.status ?? '') as ApplicationStatus;
      const reason = String(req.body?.reason ?? '').trim();

      if (!['accepted', 'rejected', 'waitlisted', 'pending'].includes(nextStatus)) {
        res.status(400).json({ error: 'INVALID_STATUS', message: 'Invalid target status.' });
        return;
      }
      if (reason.length < 8) {
        res.status(400).json({
          error: 'REASON_TOO_SHORT',
          message: 'Override rationale must be at least 8 characters.',
        });
        return;
      }

      const result = await withTransaction(async (client) => {
        const cur = (
          await client.query<ConferenceApplication>(
            `SELECT * FROM applications WHERE id = $1 FOR UPDATE`,
            [req.params.id]
          )
        ).rows[0];
        if (!cur) return null;

        const cleanName = cleanDecisionMakerName(actor.full_name);
        const appRes = await client.query<ConferenceApplication>(
          `UPDATE applications
           SET status = $2,
               decision_by = CASE WHEN $2 = 'pending' THEN NULL ELSE $3::uuid END,
               decision_by_name = CASE WHEN $2 = 'pending' THEN NULL ELSE $4 END,
               decision_at = CASE WHEN $2 = 'pending' THEN NULL ELSE now() END,
               admin_decision_notes = COALESCE($5, admin_decision_notes),
               updated_at = now()
           WHERE id = $1
           RETURNING *`,
          [cur.id, nextStatus, actor.user_id, cleanName, reason]
        );

        await client.query(
          `INSERT INTO application_decision_overrides (
            application_id, previous_status, new_status, reason, actor_user_id, actor_name,
            is_spoof, previous_decision_by, previous_decision_by_name
          ) VALUES ($1,$2,$3,$4,$5,$6,false,$7,$8)`,
          [
            cur.id,
            cur.status,
            nextStatus,
            reason,
            actor.user_id,
            cleanName,
            cur.decision_by,
            cur.decision_by_name,
          ]
        );

        await syncQrPassForApplication(client, {
          applicationId: cur.id,
          fullName: cur.applicant_name,
          email: cur.email,
          roleLabel: cur.position || cur.application_type,
          departmentSlug: cur.department_slug,
          section: cur.gender,
          active: nextStatus === 'accepted',
        });

        return appRes.rows[0];
      });

      if (!result) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Application not found.' });
        return;
      }

      res.json({ ok: true, application: result });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/applications/spoof/admins
applicationsRouter.get('/spoof/admins', requireSuperAdmin, async (_req, res, next) => {
  try {
    const rows = (
      await getPool().query(
        `SELECT user_id, email, full_name, role
         FROM profiles
         WHERE role IN ('admin', 'super_admin') AND is_active = true
         ORDER BY role DESC, full_name ASC`
      )
    ).rows;
    res.json({
      admins: rows.map((r) => ({
        ...r,
        full_name: cleanDecisionMakerName(r.full_name),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/applications/spoof/audit
applicationsRouter.get('/spoof/audit', requireSuperAdmin, async (_req, res, next) => {
  try {
    const rows = (
      await getPool().query(
        `SELECT o.*, a.application_code, a.applicant_name
         FROM application_decision_overrides o
         JOIN applications a ON a.id = o.application_id
         ORDER BY o.created_at DESC
         LIMIT 200`
      )
    ).rows;
    res.json({ logs: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/applications/:id/spoof (Super Admin Stealth Decision Attribution)
applicationsRouter.post(
  '/:id/spoof',
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const actor = req.authUser!;
      const nextStatus = String(req.body?.status ?? '') as ApplicationStatus;
      const attributedAdminId = req.body?.attributed_admin_id
        ? String(req.body.attributed_admin_id).trim()
        : null;
      const notes = req.body?.notes !== undefined ? String(req.body.notes) : null;
      const reason = String(req.body?.reason ?? 'Administrative attribution update').trim();

      const validCheck = validateSpoofRequest({
        targetStatus: nextStatus,
        attributedAdminId,
      });
      if (!validCheck.valid) {
        res.status(400).json({ error: 'INVALID_SPOOF', message: validCheck.error });
        return;
      }

      const pool = getPool();
      let attributedAdminName: string | null = null;
      if (nextStatus !== 'pending' && attributedAdminId) {
        const targetAdmin = (
          await pool.query<{ user_id: string; full_name: string }>(
            `SELECT user_id, full_name FROM profiles
             WHERE user_id = $1 AND role IN ('admin', 'super_admin') AND is_active = true
             LIMIT 1`,
            [attributedAdminId]
          )
        ).rows[0];
        if (!targetAdmin) {
          res.status(400).json({
            error: 'INVALID_ATTRIBUTED_ADMIN',
            message: 'Selected Admin account is inactive or missing.',
          });
          return;
        }
        attributedAdminName = cleanDecisionMakerName(targetAdmin.full_name);
      }

      const updated = await withTransaction(async (client) => {
        const cur = (
          await client.query<ConferenceApplication>(
            `SELECT * FROM applications WHERE id = $1 FOR UPDATE`,
            [req.params.id]
          )
        ).rows[0];
        if (!cur) return null;

        const isPending = nextStatus === 'pending';
        const appRes = await client.query<ConferenceApplication>(
          `UPDATE applications
           SET status = $2,
               decision_by = $3,
               decision_by_name = $4,
               decision_at = CASE WHEN $5::boolean THEN NULL ELSE now() END,
               admin_decision_notes = COALESCE($6, admin_decision_notes),
               review_notes = COALESCE($6, review_notes),
               updated_at = now()
           WHERE id = $1
           RETURNING *`,
          [
            cur.id,
            nextStatus,
            isPending ? null : attributedAdminId,
            isPending ? null : attributedAdminName,
            isPending,
            notes,
          ]
        );

        await client.query(
          `INSERT INTO application_decision_overrides (
            application_id, previous_status, new_status, reason,
            actor_user_id, actor_name, is_spoof,
            previous_decision_by, previous_decision_by_name,
            spoofed_decision_by, spoofed_decision_by_name
          ) VALUES ($1,$2,$3,$4,$5,$6,true,$7,$8,$9,$10)`,
          [
            cur.id,
            cur.status,
            nextStatus,
            reason,
            actor.user_id,
            cleanDecisionMakerName(actor.full_name),
            cur.decision_by,
            cur.decision_by_name,
            isPending ? null : attributedAdminId,
            isPending ? null : attributedAdminName,
          ]
        );

        await syncQrPassForApplication(client, {
          applicationId: cur.id,
          fullName: cur.applicant_name,
          email: cur.email,
          roleLabel: cur.position || cur.application_type,
          departmentSlug: cur.department_slug,
          section: cur.gender,
          active: nextStatus === 'accepted',
        });

        return appRes.rows[0];
      });

      if (!updated) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Application not found.' });
        return;
      }

      // Stealth: zero decision emails triggered
      res.json({ ok: true, application: updated });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/applications/:id (Super Admin Exclusive Hard Delete)
applicationsRouter.delete(
  '/:id',
  requirePermission('applications.delete', true),
  requireSuperAdmin,
  async (req, res, next) => {
    try {
      const deleted = await withTransaction(async (client) => {
        await client.query(`DELETE FROM qr_passes WHERE application_id = $1`, [req.params.id]);
        await client.query(`DELETE FROM staffing_decisions WHERE registration_id = $1`, [
          req.params.id,
        ]);
        const del = await client.query(
          `DELETE FROM applications WHERE id = $1 RETURNING id`,
          [req.params.id]
        );
        return del.rows[0] ?? null;
      });
      if (!deleted) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Application not found.' });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);
