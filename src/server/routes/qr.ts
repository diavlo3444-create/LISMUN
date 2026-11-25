import { Router, type Response } from 'express';
import { getPool, withTransaction } from '../db/pool.ts';
import { hashOpaqueToken } from '../services/crypto.ts';
import { ensureQrPassForUser } from '../services/qrService.ts';
import {
  attachAuthOptional,
  requireAuth,
  requireSuperAdmin,
  type AuthenticatedRequest,
} from '../middleware/auth.ts';
import {
  canonicalDepartmentForStorage,
  canViewDepartmentQr,
  hasPermission,
  isSecurityAccount,
} from '../../shared/permissions.ts';
import type { QrPassRecord } from '../../shared/types.ts';

export const qrRouter = Router();

qrRouter.use(attachAuthOptional);
qrRouter.use(requireAuth);

// Multi-scanner live SSE subscribers
const sseClients = new Set<Response>();

function broadcastQrSync(event: {
  type: 'checkin' | 'checkout' | 'manual_correct' | 'reset';
  passId?: string;
  at: string;
}): void {
  const line = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(line);
    } catch {
      sseClients.delete(client);
    }
  }
}

// GET /api/qr/stream (live cross-device attendance sync via SSE)
qrRouter.get('/stream', (req: AuthenticatedRequest, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write(`data: ${JSON.stringify({ type: 'connected', at: new Date().toISOString() })}\n\n`);
  sseClients.add(res);
  const keepAlive = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(keepAlive);
    }
  }, 20_000);
  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  });
});

// GET /api/qr/my-pass
qrRouter.get('/my-pass', async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    const pass = await ensureQrPassForUser(getPool(), {
      userId: actor.user_id,
      fullName: actor.full_name,
      email: actor.email,
      roleLabel: actor.eb_rank || actor.role,
      departmentSlug: actor.department_slug || 'general',
      section: actor.gender ?? actor.division ?? null,
      holderType: actor.role === 'executive_board' ? 'eb_member' : 'staff',
      phone: actor.phone,
      reportingHeadId: actor.reporting_head_id,
      active: actor.is_active,
    });
    const { token_hash: _hash, ...safePass } = pass as QrPassRecord & { token_hash?: string };
    res.json({
      pass: safePass,
      canScan: hasPermission(actor, 'qr.scan', req.departments),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/qr/department-passes (Volunteering / Media & Press / Security Head or Admin)
qrRouter.get('/department-passes', async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    if (!canViewDepartmentQr(actor, req.departments)) {
      res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Department QR view requires Admin or operational department leadership.',
      });
      return;
    }

    const isAdmin = actor.role === 'super_admin' || actor.role === 'admin';
    const targetDept = isAdmin && req.query.department
      ? canonicalDepartmentForStorage(String(req.query.department))
      : canonicalDepartmentForStorage(actor.department_slug);
    const targetSection = isAdmin ? (req.query.section ? String(req.query.section) : null) : actor.gender ?? actor.division ?? null;

    const rows = (
      await getPool().query(
        `SELECT id, holder_type, user_id, application_id, full_name, email, role_label,
                department_slug, section, pass_code, token_value, active, inside,
                checked_in_at, checked_in_gate, checked_out_at, scan_count, checkout_count, updated_at
         FROM qr_passes
         WHERE active = true
           AND ($1 = '' OR department_slug = $1)
           AND ($2::text IS NULL OR section IS NULL OR section = $2)
         ORDER BY full_name ASC`,
        [targetDept, targetSection]
      )
    ).rows;

    res.json({ passes: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/qr/registry (Checked In / Not Checked In split + recent scans + corrections + resets)
qrRouter.get('/registry', async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    const isScanner =
      hasPermission(actor, 'qr.scan', req.departments) ||
      hasPermission(actor, 'qr.registry_view', req.departments) ||
      isSecurityAccount(actor, req.departments);

    if (!isScanner) {
      res.status(403).json({
        error: 'SCANNER_FORBIDDEN',
        message: 'Live attendance registry is restricted to Admins and Security personnel.',
      });
      return;
    }

    const pool = getPool();
    const [passesRes, scansRes, corrRes, resetsRes] = await Promise.all([
      pool.query(
        `SELECT id, holder_type, user_id, application_id, full_name, email, role_label,
                department_slug, section, pass_code, active, inside, checked_in_at,
                checked_in_gate, checked_out_at, checked_out_gate, scan_count, checkout_count, updated_at
         FROM qr_passes
         WHERE active = true
         ORDER BY checked_in_at DESC NULLS LAST, full_name ASC`
      ),
      pool.query(`SELECT * FROM qr_scans ORDER BY scanned_at DESC LIMIT 200`),
      pool.query(`SELECT * FROM qr_correction_logs ORDER BY created_at DESC LIMIT 100`),
      pool.query(`SELECT * FROM qr_attendance_resets ORDER BY created_at DESC LIMIT 30`),
    ]);

    res.json({
      passes: passesRes.rows,
      scans: scansRes.rows,
      corrections: corrRes.rows,
      resets: resetsRes.rows,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/qr/scan (Transactional FOR UPDATE Check-In & Check-Out with Duplicate Lock)
qrRouter.post('/scan', async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    const canScan = hasPermission(actor, 'qr.scan', req.departments);
    const rawToken = String(req.body?.qr_token ?? '').trim();
    const direction = req.body?.direction === 'checkout' ? 'checkout' : 'checkin';
    const gate = String(req.body?.gate ?? 'Main Gate').trim();
    const confirmRepeat = Boolean(req.body?.confirm_repeat);

    if (!canScan) {
      await getPool().query(
        `INSERT INTO qr_scans (scanned_by, scanned_by_name, direction, scan_outcome, gate, reason)
         VALUES ($1,$2,$3,'denied',$4,'Unauthorized non-Security scanner attempt')`,
        [actor.user_id, actor.full_name, direction, gate]
      );
      res.status(403).json({
        error: 'SCANNER_FORBIDDEN',
        message: 'Only Admins and Security personnel can operate the QR scanner.',
      });
      return;
    }

    if (!rawToken) {
      res.status(400).json({ error: 'TOKEN_REQUIRED', message: 'QR token or pass code is required.' });
      return;
    }

    const tokenHash = hashOpaqueToken(rawToken);
    const outcome = await withTransaction(async (client) => {
      const pass = (
        await client.query<QrPassRecord>(
          `SELECT * FROM qr_passes
           WHERE token_hash = $1 OR upper(pass_code) = upper($2)
           FOR UPDATE`,
          [tokenHash, rawToken]
        )
      ).rows[0];

      if (!pass) {
        await client.query(
          `INSERT INTO qr_scans (scanned_by, scanned_by_name, direction, scan_outcome, gate, reason)
           VALUES ($1,$2,$3,'invalid_token',$4,$5)`,
          [actor.user_id, actor.full_name, direction, gate, 'Token not recognized']
        );
        return {
          status: 404,
          payload: {
            ok: false,
            scan_outcome: 'invalid_token',
            message: 'Unrecognized QR pass token.',
          },
        };
      }

      if (!pass.active) {
        await client.query(
          `INSERT INTO qr_scans (pass_id, pass_code, pass_holder_name, department_slug, section, scanned_by, scanned_by_name, direction, scan_outcome, gate, reason)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'revoked_pass',$9,'Pass inactive/revoked')`,
          [
            pass.id,
            pass.pass_code,
            pass.full_name,
            pass.department_slug,
            pass.section,
            actor.user_id,
            actor.full_name,
            direction,
            gate,
          ]
        );
        return {
          status: 403,
          payload: {
            ok: false,
            scan_outcome: 'revoked_pass',
            pass,
            message: `${pass.full_name}'s pass is inactive or revoked.`,
          },
        };
      }

      if (direction === 'checkin') {
        if (pass.checked_in_at !== null) {
          // Strict Duplicate Lock: preserve original checked_in_at & gate!
          await client.query(
            `INSERT INTO qr_scans (pass_id, pass_code, pass_holder_name, department_slug, section, scanned_by, scanned_by_name, direction, scan_outcome, gate, reason)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'checkin','already_checked_in',$8,'Duplicate check-in blocked')`,
            [
              pass.id,
              pass.pass_code,
              pass.full_name,
              pass.department_slug,
              pass.section,
              actor.user_id,
              actor.full_name,
              gate,
            ]
          );
          return {
            status: 409,
            payload: {
              ok: false,
              duplicate: true,
              scan_outcome: 'already_checked_in',
              pass,
              message: `ALREADY CHECKED IN at ${new Date(pass.checked_in_at).toLocaleTimeString()} (${pass.checked_in_gate || 'Gate'}). Original timestamp preserved.`,
            },
          };
        }

        const updated = (
          await client.query<QrPassRecord>(
            `UPDATE qr_passes
             SET inside = true,
                 checked_in_at = now(),
                 checked_in_by = $2,
                 checked_in_gate = $3,
                 checked_out_at = NULL,
                 checked_out_by = NULL,
                 checked_out_gate = NULL,
                 scan_count = scan_count + 1,
                 updated_at = now()
             WHERE id = $1
             RETURNING *`,
            [pass.id, actor.user_id, gate]
          )
        ).rows[0];

        await client.query(
          `INSERT INTO qr_scans (pass_id, pass_code, pass_holder_name, department_slug, section, scanned_by, scanned_by_name, direction, scan_outcome, gate, reason)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'checkin','valid_checkin',$8,'Valid entrance scan')`,
          [
            pass.id,
            pass.pass_code,
            pass.full_name,
            pass.department_slug,
            pass.section,
            actor.user_id,
            actor.full_name,
            gate,
          ]
        );

        return {
          status: 200,
          syncType: 'checkin' as const,
          payload: {
            ok: true,
            duplicate: false,
            scan_outcome: 'valid_checkin',
            pass: updated,
            message: `Checked in: ${updated.full_name} (${updated.department_slug}).`,
          },
        };
      }

      // Check-Out Path
      if (pass.checked_in_at === null) {
        await client.query(
          `INSERT INTO qr_scans (pass_id, pass_code, pass_holder_name, department_slug, section, scanned_by, scanned_by_name, direction, scan_outcome, gate, reason)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'checkout','not_checked_in',$8,'Cannot check out before check-in')`,
          [
            pass.id,
            pass.pass_code,
            pass.full_name,
            pass.department_slug,
            pass.section,
            actor.user_id,
            actor.full_name,
            gate,
          ]
        );
        return {
          status: 409,
          payload: {
            ok: false,
            scan_outcome: 'not_checked_in',
            pass,
            message: `${pass.full_name} has not checked in yet.`,
          },
        };
      }

      if (pass.checkout_count >= 1 && !confirmRepeat) {
        await client.query(
          `INSERT INTO qr_scans (pass_id, pass_code, pass_holder_name, department_slug, section, scanned_by, scanned_by_name, direction, scan_outcome, gate, reason)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'checkout','checkout_warning',$8,'Repeat checkout requires confirmation')`,
          [
            pass.id,
            pass.pass_code,
            pass.full_name,
            pass.department_slug,
            pass.section,
            actor.user_id,
            actor.full_name,
            gate,
          ]
        );
        return {
          status: 200,
          payload: {
            ok: false,
            requiresConfirmation: true,
            scan_outcome: 'checkout_warning',
            pass,
            message: `${pass.full_name} already checked out ${pass.checkout_count} time(s). Confirm repeat check-out?`,
          },
        };
      }

      const checkedOut = (
        await client.query<QrPassRecord>(
          `UPDATE qr_passes
           SET inside = false,
               checked_out_at = now(),
               checked_out_by = $2,
               checked_out_gate = $3,
               checkout_count = checkout_count + 1,
               updated_at = now()
           WHERE id = $1
           RETURNING *`,
          [pass.id, actor.user_id, gate]
        )
      ).rows[0];

      await client.query(
        `INSERT INTO qr_scans (pass_id, pass_code, pass_holder_name, department_slug, section, scanned_by, scanned_by_name, direction, scan_outcome, gate, reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'checkout','valid_checkout',$8,'Valid check-out scan')`,
        [
          pass.id,
          pass.pass_code,
          pass.full_name,
          pass.department_slug,
          pass.section,
          actor.user_id,
          actor.full_name,
          gate,
        ]
      );

      return {
        status: 200,
        syncType: 'checkout' as const,
        payload: {
          ok: true,
          scan_outcome: 'valid_checkout',
          pass: checkedOut,
          message: `Checked out: ${checkedOut.full_name}.`,
        },
      };
    });

    if ('syncType' in outcome && outcome.syncType) {
      broadcastQrSync({
        type: outcome.syncType,
        passId: (outcome.payload.pass as QrPassRecord | undefined)?.id,
        at: new Date().toISOString(),
      });
    }

    res.status(outcome.status).json(outcome.payload);
  } catch (err) {
    next(err);
  }
});

// POST /api/qr/manual-correct (Admin / Super Admin manual attendance correction with audit log)
qrRouter.post('/manual-correct', async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    if (!hasPermission(actor, 'qr.manual_correct', req.departments)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Admin authority required for corrections.' });
      return;
    }
    const passId = String(req.body?.pass_id ?? '').trim();
    const action = String(req.body?.action ?? '');
    const reason = String(req.body?.reason ?? '').trim();
    if (!passId || !['mark_checked_in', 'mark_checked_out', 'clear_checkin', 'toggle_active'].includes(action) || reason.length < 4) {
      res.status(400).json({ error: 'INVALID_CORRECTION', message: 'Valid pass_id, action, and reason required.' });
      return;
    }

    const updated = await withTransaction(async (client) => {
      const cur = (
        await client.query<QrPassRecord>(`SELECT * FROM qr_passes WHERE id = $1 FOR UPDATE`, [passId])
      ).rows[0];
      if (!cur) return null;

      let nextRes;
      if (action === 'mark_checked_in') {
        nextRes = await client.query<QrPassRecord>(
          `UPDATE qr_passes SET inside = true, checked_in_at = now(), checked_in_by = $2, checked_in_gate = 'Manual Correction', scan_count = scan_count + 1, updated_at = now() WHERE id = $1 RETURNING *`,
          [passId, actor.user_id]
        );
      } else if (action === 'mark_checked_out') {
        nextRes = await client.query<QrPassRecord>(
          `UPDATE qr_passes SET inside = false, checked_out_at = now(), checked_out_by = $2, checked_out_gate = 'Manual Correction', checkout_count = checkout_count + 1, updated_at = now() WHERE id = $1 RETURNING *`,
          [passId, actor.user_id]
        );
      } else if (action === 'clear_checkin') {
        nextRes = await client.query<QrPassRecord>(
          `UPDATE qr_passes SET inside = false, checked_in_at = NULL, checked_in_by = NULL, checked_in_gate = NULL, checked_out_at = NULL, checked_out_by = NULL, checked_out_gate = NULL, updated_at = now() WHERE id = $1 RETURNING *`,
          [passId]
        );
      } else {
        nextRes = await client.query<QrPassRecord>(
          `UPDATE qr_passes SET active = NOT active, updated_at = now() WHERE id = $1 RETURNING *`,
          [passId]
        );
      }

      const nextRow = nextRes.rows[0];
      await client.query(
        `INSERT INTO qr_correction_logs (pass_id, actor_user_id, actor_name, action, previous_state, new_state, reason)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)`,
        [
          passId,
          actor.user_id,
          actor.full_name,
          action,
          JSON.stringify({
            inside: cur.inside,
            active: cur.active,
            checked_in_at: cur.checked_in_at,
            checked_out_at: cur.checked_out_at,
          }),
          JSON.stringify({
            inside: nextRow.inside,
            active: nextRow.active,
            checked_in_at: nextRow.checked_in_at,
            checked_out_at: nextRow.checked_out_at,
          }),
          reason,
        ]
      );
      return nextRow;
    });

    if (!updated) {
      res.status(404).json({ error: 'NOT_FOUND' });
      return;
    }

    broadcastQrSync({ type: 'manual_correct', passId, at: new Date().toISOString() });
    res.json({ ok: true, pass: updated });
  } catch (err) {
    next(err);
  }
});

// POST /api/qr/reset-all (Super Admin ONLY, requires exact confirmation "RESET")
qrRouter.post('/reset-all', requireSuperAdmin, async (req: AuthenticatedRequest, res, next) => {
  try {
    const confirmation = String(req.body?.confirmation ?? '').trim();
    if (confirmation !== 'RESET') {
      res.status(400).json({
        error: 'CONFIRMATION_REQUIRED',
        message: 'Type exact confirmation string "RESET" to reset global attendance.',
      });
      return;
    }

    const summary = await withTransaction(async (client) => {
      const resetRes = await client.query(
        `UPDATE qr_passes
         SET inside = false,
             checked_in_at = NULL,
             checked_in_by = NULL,
             checked_in_gate = NULL,
             checked_out_at = NULL,
             checked_out_by = NULL,
             checked_out_gate = NULL,
             scan_count = 0,
             checkout_count = 0,
             updated_at = now()
         RETURNING id`
      );
      const delScans = await client.query(
        `DELETE FROM qr_scans
         WHERE scan_outcome IN ('valid_checkin', 'valid_checkout', 'already_checked_in', 'duplicate_recent')
         RETURNING id`
      );
      const audit = (
        await client.query(
          `INSERT INTO qr_attendance_resets (actor_user_id, actor_name, passes_reset, scans_cleared)
           VALUES ($1,$2,$3,$4) RETURNING *`,
          [
            req.authUser!.user_id,
            req.authUser!.full_name,
            resetRes.rowCount ?? 0,
            delScans.rowCount ?? 0,
          ]
        )
      ).rows[0];
      return audit;
    });

    broadcastQrSync({ type: 'reset', at: new Date().toISOString() });
    res.json({ ok: true, reset: summary });
  } catch (err) {
    next(err);
  }
});
