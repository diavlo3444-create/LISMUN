import { Router } from 'express';
import { getPool, withTransaction } from '../db/pool.ts';
import {
  attachAuthOptional,
  requireAuth,
  type AuthenticatedRequest,
} from '../middleware/auth.ts';
import {
  canonicalDepartmentForStorage,
  detectShiftOverlap,
  isEbHeadActor,
} from '../../shared/permissions.ts';

export const ebRouter = Router();

ebRouter.use(attachAuthOptional);
ebRouter.use(requireAuth);

function canManageEbDept(req: AuthenticatedRequest, targetDept?: string): boolean {
  const actor = req.effectiveActor!;
  if (actor.role === 'super_admin' || actor.role === 'admin') return true;
  const actorDept = canonicalDepartmentForStorage(actor.department_slug);
  if (targetDept && canonicalDepartmentForStorage(targetDept) !== actorDept) return false;
  return (
    actor.role === 'department_head' ||
    actor.eb_rank === 'head' ||
    actor.eb_rank === 'co_head' ||
    Boolean(actor.eb_permissions?.manage_department)
  );
}

// GET /api/eb/workspace (hydrates stations, shifts, assignments, swaps, tasks, comments, announcements, incidents, hierarchy)
ebRouter.get('/workspace', async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    if (
      !['super_admin', 'admin', 'department_head', 'executive_board'].includes(actor.role)
    ) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Executive Board access required.' });
      return;
    }

    const pool = getPool();
    const actorDept = canonicalDepartmentForStorage(actor.department_slug);
    const isGlobal = actor.role === 'super_admin' || actor.role === 'admin';

    const [
      stationsRes,
      shiftsRes,
      assignmentsRes,
      swapsRes,
      tasksRes,
      commentsRes,
      annRes,
      acksRes,
      incidentsRes,
      profilesRes,
    ] = await Promise.all([
      pool.query(
        `SELECT * FROM eb_stations WHERE ($1::boolean = true OR department = $2) ORDER BY name ASC`,
        [isGlobal, actorDept]
      ),
      pool.query(
        `SELECT * FROM eb_shifts WHERE ($1::boolean = true OR department = $2) ORDER BY starts_at ASC`,
        [isGlobal, actorDept]
      ),
      pool.query(`SELECT * FROM eb_shift_assignments ORDER BY created_at ASC`),
      pool.query(
        `SELECT sw.*, sh.department, sh.title AS shift_title
         FROM eb_shift_swaps sw
         JOIN eb_shifts sh ON sh.id = sw.eb_shift_id
         WHERE ($1::boolean = true OR sh.department = $2)
         ORDER BY sw.created_at DESC`,
        [isGlobal, actorDept]
      ),
      pool.query(
        `SELECT * FROM eb_tasks WHERE ($1::boolean = true OR department = $2) ORDER BY created_at DESC`,
        [isGlobal, actorDept]
      ),
      pool.query(`SELECT * FROM eb_task_comments ORDER BY created_at ASC`),
      pool.query(
        `SELECT * FROM eb_announcements WHERE department = 'all' OR $1::boolean = true OR department = $2 ORDER BY created_at DESC`,
        [isGlobal, actorDept]
      ),
      pool.query(`SELECT * FROM eb_announcement_acks WHERE user_id = $1`, [actor.user_id]),
      pool.query(
        `SELECT * FROM eb_incidents WHERE ($1::boolean = true OR department = $2) ORDER BY created_at DESC`,
        [isGlobal, actorDept]
      ),
      pool.query(
        `SELECT user_id, full_name, email, role, department_slug, gender, division, title, phone, eb_rank, reporting_head_id
         FROM profiles WHERE is_active = true`
      ),
    ]);

    // 4-tier Hierarchy scoping: non-head EB members see ONLY their Reporting Head (per WEST MUN spec)
    const isAdminOrHead = isGlobal || isEbHeadActor(actor);
    const allProfiles = profilesRes.rows;
    const reportingHead = actor.reporting_head_id
      ? allProfiles.find((p) => p.user_id === actor.reporting_head_id) ?? null
      : allProfiles.find(
          (p) => p.role === 'department_head' && p.department_slug === actorDept
        ) ?? null;

    const hierarchy = isAdminOrHead
      ? {
          scoped: false,
          heads: allProfiles.filter((p) => p.role === 'department_head'),
          coHeads: allProfiles.filter((p) => p.role === 'executive_board'),
          admins: allProfiles.filter((p) => p.role === 'admin' || p.role === 'super_admin'),
        }
      : {
          scoped: true,
          reportingHead,
        };

    res.json({
      stations: stationsRes.rows,
      shifts: shiftsRes.rows,
      assignments: assignmentsRes.rows,
      swaps: swapsRes.rows,
      tasks: tasksRes.rows,
      comments: commentsRes.rows,
      announcements: annRes.rows,
      acknowledgedIds: acksRes.rows.map((r) => r.announcement_id),
      incidents: incidentsRes.rows,
      hierarchy,
    });
  } catch (err) {
    next(err);
  }
});

// === EB Tasks, Checklists & Comments ===
ebRouter.post('/tasks', async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    const dept = canonicalDepartmentForStorage(
      String(req.body?.department || actor.department_slug || '')
    );
    if (!canManageEbDept(req, dept)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'EB manager permissions required.' });
      return;
    }
    const title = String(req.body?.title ?? '').trim();
    if (!title) {
      res.status(400).json({ error: 'TITLE_REQUIRED' });
      return;
    }
    const pool = getPool();
    let assignedUserId = req.body?.assigned_to_user_id || null;
    const assignedName = req.body?.assigned_to_name ? String(req.body.assigned_to_name).trim() : null;
    if (!assignedUserId && assignedName) {
      const match = (
        await pool.query<{ user_id: string }>(
          `SELECT user_id FROM profiles WHERE lower(full_name) = lower($1) AND is_active = true LIMIT 1`,
          [assignedName]
        )
      ).rows[0];
      assignedUserId = match?.user_id ?? null;
    }

    const task = (
      await pool.query(
        `INSERT INTO eb_tasks (department, section, title, description, priority, assigned_to_user_id, assigned_to_name, due_at, checklist, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
         RETURNING *`,
        [
          dept,
          req.body?.section ?? actor.gender ?? null,
          title,
          String(req.body?.description ?? ''),
          String(req.body?.priority ?? 'medium'),
          assignedUserId,
          assignedName,
          req.body?.due_at || null,
          JSON.stringify(Array.isArray(req.body?.checklist) ? req.body.checklist : []),
          actor.user_id,
        ]
      )
    ).rows[0];
    res.status(201).json({ task });
  } catch (err) {
    next(err);
  }
});

ebRouter.patch('/tasks/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    const pool = getPool();
    const existing = (await pool.query(`SELECT * FROM eb_tasks WHERE id = $1`, [req.params.id])).rows[0];
    if (!existing) {
      res.status(404).json({ error: 'NOT_FOUND' });
      return;
    }
    const isAssignee = existing.assigned_to_user_id === actor.user_id;
    if (!isAssignee && !canManageEbDept(req, existing.department)) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }

    const updated = (
      await pool.query(
        `UPDATE eb_tasks
         SET status = COALESCE($2, status),
             checklist = COALESCE($3::jsonb, checklist),
             completion_note = COALESCE($4, completion_note),
             blocker_reason = COALESCE($5, blocker_reason),
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [
          req.params.id,
          req.body?.status ?? null,
          req.body?.checklist ? JSON.stringify(req.body.checklist) : null,
          req.body?.completion_note ?? null,
          req.body?.blocker_reason ?? null,
        ]
      )
    ).rows[0];
    res.json({ task: updated });
  } catch (err) {
    next(err);
  }
});

ebRouter.post('/tasks/:id/comments', async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    const body = String(req.body?.body ?? '').trim();
    if (!body) {
      res.status(400).json({ error: 'BODY_REQUIRED' });
      return;
    }
    const row = (
      await getPool().query(
        `INSERT INTO eb_task_comments (task_id, author_user_id, author_name, body)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [req.params.id, actor.user_id, actor.full_name, body]
      )
    ).rows[0];
    res.status(201).json({ comment: row });
  } catch (err) {
    next(err);
  }
});

// === EB Stations & Shifts + Swaps ===
ebRouter.post('/stations', async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    const dept = canonicalDepartmentForStorage(String(req.body?.department || actor.department_slug || ''));
    if (!canManageEbDept(req, dept)) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }
    const row = (
      await getPool().query(
        `INSERT INTO eb_stations (department, name, location, sop_manual, required_equipment, emergency_contact_name, emergency_contact_phone, opening_checklist, closing_checklist)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)
         RETURNING *`,
        [
          dept,
          String(req.body?.name ?? '').trim(),
          String(req.body?.location ?? ''),
          String(req.body?.sop_manual ?? ''),
          Array.isArray(req.body?.required_equipment) ? req.body.required_equipment : [],
          req.body?.emergency_contact_name ?? null,
          req.body?.emergency_contact_phone ?? null,
          JSON.stringify(req.body?.opening_checklist ?? []),
          JSON.stringify(req.body?.closing_checklist ?? []),
        ]
      )
    ).rows[0];
    res.status(201).json({ station: row });
  } catch (err) {
    next(err);
  }
});

ebRouter.patch('/stations/:id/checklists', async (req: AuthenticatedRequest, res, next) => {
  try {
    const row = (
      await getPool().query(
        `UPDATE eb_stations
         SET opening_checklist = COALESCE($2::jsonb, opening_checklist),
             closing_checklist = COALESCE($3::jsonb, closing_checklist),
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [
          req.params.id,
          req.body?.opening_checklist ? JSON.stringify(req.body.opening_checklist) : null,
          req.body?.closing_checklist ? JSON.stringify(req.body.closing_checklist) : null,
        ]
      )
    ).rows[0];
    res.json({ station: row });
  } catch (err) {
    next(err);
  }
});

ebRouter.post('/shifts', async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    const dept = canonicalDepartmentForStorage(String(req.body?.department || actor.department_slug || ''));
    if (!canManageEbDept(req, dept)) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }
    const startsAt = String(req.body?.starts_at ?? '');
    const endsAt = String(req.body?.ends_at ?? '');
    const assigneeIds: string[] = Array.isArray(req.body?.assignee_user_ids) ? req.body.assignee_user_ids : [];
    const pool = getPool();

    for (const uid of assigneeIds) {
      const existing = (
        await pool.query(
          `SELECT s.id, s.title, s.starts_at, s.ends_at
           FROM eb_shift_assignments a JOIN eb_shifts s ON s.id = a.eb_shift_id
           WHERE a.user_id = $1`,
          [uid]
        )
      ).rows;
      const conflict = detectShiftOverlap(existing, { starts_at: startsAt, ends_at: endsAt });
      if (conflict) {
        res.status(409).json({
          error: 'SHIFT_OVERLAP',
          message: `Assignee already scheduled on overlapping shift "${conflict.title}".`,
        });
        return;
      }
    }

    const shift = await withTransaction(async (client) => {
      const s = (
        await client.query(
          `INSERT INTO eb_shifts (department, section, station_id, title, location, starts_at, ends_at, is_published, break_schedule, checklist, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
           RETURNING *`,
          [
            dept,
            req.body?.section ?? actor.gender ?? null,
            req.body?.station_id || null,
            String(req.body?.title ?? '').trim(),
            String(req.body?.location ?? ''),
            startsAt,
            endsAt,
            req.body?.is_published !== false,
            req.body?.break_schedule ?? null,
            JSON.stringify(req.body?.checklist ?? []),
            actor.user_id,
          ]
        )
      ).rows[0];

      for (const uid of assigneeIds) {
        const prof = (
          await client.query<{ full_name: string; eb_rank: string | null }>(
            `SELECT full_name, eb_rank FROM profiles WHERE user_id = $1`,
            [uid]
          )
        ).rows[0];
        if (prof) {
          await client.query(
            `INSERT INTO eb_shift_assignments (eb_shift_id, user_id, assignee_name, role_label)
             VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
            [s.id, uid, prof.full_name, prof.eb_rank || 'co_head']
          );
        }
      }
      return s;
    });

    res.status(201).json({ shift });
  } catch (err) {
    next(err);
  }
});

ebRouter.post('/swaps', async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    const shiftId = String(req.body?.eb_shift_id ?? '').trim();
    const reason = String(req.body?.reason ?? '').trim();
    if (!shiftId || reason.length < 3) {
      res.status(400).json({ error: 'INVALID_SWAP', message: 'Shift and swap reason required.' });
      return;
    }
    const swap = (
      await getPool().query(
        `INSERT INTO eb_shift_swaps (eb_shift_id, requester_user_id, requester_name, target_user_id, target_name, reason)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [
          shiftId,
          actor.user_id,
          actor.full_name,
          req.body?.target_user_id || null,
          req.body?.target_name || null,
          reason,
        ]
      )
    ).rows[0];
    res.status(201).json({ swap });
  } catch (err) {
    next(err);
  }
});

ebRouter.patch('/swaps/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    const status = String(req.body?.status ?? '');
    if (!['approved', 'rejected'].includes(status)) {
      res.status(400).json({ error: 'INVALID_STATUS' });
      return;
    }
    const pool = getPool();
    const sw = (
      await pool.query(
        `SELECT sw.*, sh.department FROM eb_shift_swaps sw JOIN eb_shifts sh ON sh.id = sw.eb_shift_id WHERE sw.id = $1`,
        [req.params.id]
      )
    ).rows[0];
    if (!sw) {
      res.status(404).json({ error: 'NOT_FOUND' });
      return;
    }
    if (!canManageEbDept(req, sw.department)) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }
    const updated = (
      await pool.query(
        `UPDATE eb_shift_swaps SET status = $2, reviewed_by = $3, reviewed_at = now() WHERE id = $1 RETURNING *`,
        [req.params.id, status, actor.user_id]
      )
    ).rows[0];
    res.json({ swap: updated });
  } catch (err) {
    next(err);
  }
});

// === EB Announcements & Incidents ===
ebRouter.post('/announcements', async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    if (!canManageEbDept(req)) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }
    const row = (
      await getPool().query(
        `INSERT INTO eb_announcements (department, title, body, severity, created_by, created_by_name)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [
          String(req.body?.department || actor.department_slug || 'all'),
          String(req.body?.title ?? '').trim(),
          String(req.body?.body ?? '').trim(),
          String(req.body?.severity ?? 'normal'),
          actor.user_id,
          actor.full_name,
        ]
      )
    ).rows[0];
    res.status(201).json({ announcement: row });
  } catch (err) {
    next(err);
  }
});

ebRouter.post('/announcements/:id/ack', async (req: AuthenticatedRequest, res, next) => {
  try {
    await getPool().query(
      `INSERT INTO eb_announcement_acks (announcement_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [req.params.id, req.effectiveActor!.user_id]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

ebRouter.post('/incidents', async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    const dept = canonicalDepartmentForStorage(String(req.body?.department || actor.department_slug || 'security'));
    const row = (
      await getPool().query(
        `INSERT INTO eb_incidents (department, title, description, severity, location, reported_by, reported_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [
          dept,
          String(req.body?.title ?? '').trim(),
          String(req.body?.description ?? '').trim(),
          String(req.body?.severity ?? 'medium'),
          String(req.body?.location ?? ''),
          actor.user_id,
          actor.full_name,
        ]
      )
    ).rows[0];
    res.status(201).json({ incident: row });
  } catch (err) {
    next(err);
  }
});

ebRouter.patch('/incidents/:id/resolve', async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    const row = (
      await getPool().query(
        `UPDATE eb_incidents
         SET status = 'resolved', resolved_by = $2, resolved_at = now(), resolution_note = $3
         WHERE id = $1 RETURNING *`,
        [req.params.id, actor.user_id, String(req.body?.resolution_note ?? 'Resolved')]
      )
    ).rows[0];
    res.json({ incident: row });
  } catch (err) {
    next(err);
  }
});
