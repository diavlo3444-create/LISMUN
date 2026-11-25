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
  isDccActor,
  isHrActor,
  isSectionedDepartment,
} from '../../shared/permissions.ts';
import type { GenderSection } from '../../shared/types.ts';

export const departmentsRouter = Router();

departmentsRouter.use(attachAuthOptional);
departmentsRouter.use(requireAuth);

const OPERATIONAL_DEPTS = new Set(['media_press', 'security', 'volunteers']);

function resolveDeptScope(req: AuthenticatedRequest): {
  isAdmin: boolean;
  dept: string;
  section: GenderSection | null;
} {
  const actor = req.effectiveActor!;
  const isAdmin = actor.role === 'super_admin' || actor.role === 'admin';
  const requestedDept = req.query.department
    ? canonicalDepartmentForStorage(String(req.query.department))
    : '';
  const requestedSection = (req.query.section || null) as GenderSection | null;
  if (isAdmin) {
    return {
      isAdmin: true,
      dept: requestedDept || canonicalDepartmentForStorage(actor.department_slug) || 'volunteers',
      section: requestedSection,
    };
  }
  return {
    isAdmin: false,
    dept: canonicalDepartmentForStorage(actor.department_slug),
    section: actor.gender ?? actor.division ?? null,
  };
}

// PATCH /api/departments/:slug/registration (toggle registration_open for dept)
departmentsRouter.patch('/:slug/registration', async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    const isAdmin = actor.role === 'super_admin' || actor.role === 'admin';
    if (!isAdmin && !isDccActor(actor, req.departments)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Admin or DCC authority required.' });
      return;
    }
    const slug = canonicalDepartmentForStorage(req.params.slug);
    const open = Boolean(req.body?.registration_open);
    const pool = getPool();
    const updated = (
      await pool.query(
        `UPDATE departments SET registration_open = $2, updated_at = now() WHERE slug = $1 RETURNING *`,
        [slug, open]
      )
    ).rows[0];

    // Also mirror settings switch for team_<track>_open
    if (slug === 'media_press') {
      await pool.query(
        `INSERT INTO settings (key, value, updated_by) VALUES ('team_media_open', $1::jsonb, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [JSON.stringify(open), actor.user_id]
      );
      await pool.query(
        `INSERT INTO settings (key, value, updated_by) VALUES ('team_press_open', $1::jsonb, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [JSON.stringify(open), actor.user_id]
      );
    } else if (slug === 'security' || slug === 'volunteers') {
      await pool.query(
        `INSERT INTO settings (key, value, updated_by) VALUES ($1, $2::jsonb, $3)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [`team_${slug}_open`, JSON.stringify(open), actor.user_id]
      );
    }

    res.json({ ok: true, department: updated });
  } catch (err) {
    next(err);
  }
});

// === Generic Department Workspace Records ===
departmentsRouter.get('/records', async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    const scope = resolveDeptScope(req);
    const pool = getPool();
    const sharedReadable = ['venue', 'equipment', 'run_of_show', 'speaker'];

    let rows;
    if (scope.isAdmin) {
      rows = (
        await pool.query(
          `SELECT * FROM department_records
           WHERE ($1 = '' OR department = $1)
           ORDER BY updated_at DESC`,
          [req.query.department ? scope.dept : '']
        )
      ).rows;
    } else {
      rows = (
        await pool.query(
          `SELECT * FROM department_records
           WHERE (
             (department = $1 AND ($2::text IS NULL OR section IS NULL OR section = $2))
             OR category = ANY($3::text[])
           )
           ORDER BY updated_at DESC`,
          [scope.dept, scope.section, sharedReadable]
        )
      ).rows;
      // Strict Security-only guard on 'incident' category
      if (scope.dept !== 'security') {
        rows = rows.filter((r) => r.category !== 'incident');
      }
    }

    // Staff members see only non-sensitive workspace records in their department
    if (actor.role === 'staff') {
      rows = rows.filter((r) => r.department === scope.dept && r.category !== 'incident');
    }

    res.json({ records: rows });
  } catch (err) {
    next(err);
  }
});

departmentsRouter.post('/records', async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    if (actor.role === 'staff' && !['it', 'design', 'marketing', 'hr', 'dcc', 'logistics', 'ceremonies', 'pr'].includes(canonicalDepartmentForStorage(actor.department_slug))) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }
    const scope = resolveDeptScope(req);
    const targetDept = scope.isAdmin && req.body?.department
      ? canonicalDepartmentForStorage(String(req.body.department))
      : scope.dept;
    const targetSection = scope.isAdmin ? (req.body?.section ?? null) : scope.section;
    const category = String(req.body?.category ?? 'task').trim();
    if (category === 'incident' && !scope.isAdmin && targetDept !== 'security') {
      res.status(403).json({
        error: 'SECURITY_ONLY',
        message: 'Incident records are restricted to Security and Admins.',
      });
      return;
    }

    const title = String(req.body?.title ?? '').trim();
    if (!title) {
      res.status(400).json({ error: 'TITLE_REQUIRED', message: 'Title is required.' });
      return;
    }

    const row = (
      await getPool().query(
        `INSERT INTO department_records (department, section, category, title, status, priority, data, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
         RETURNING *`,
        [
          targetDept,
          targetSection,
          category,
          title,
          String(req.body?.status ?? 'open'),
          String(req.body?.priority ?? 'medium'),
          JSON.stringify(req.body?.data ?? {}),
          actor.user_id,
        ]
      )
    ).rows[0];
    res.status(201).json({ record: row });
  } catch (err) {
    next(err);
  }
});

departmentsRouter.patch('/records/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const scope = resolveDeptScope(req);
    const pool = getPool();
    const existing = (
      await pool.query(`SELECT * FROM department_records WHERE id = $1 LIMIT 1`, [req.params.id])
    ).rows[0];
    if (!existing) {
      res.status(404).json({ error: 'NOT_FOUND' });
      return;
    }
    if (!scope.isAdmin && existing.department !== scope.dept) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Cannot modify another department record.' });
      return;
    }

    const updated = (
      await pool.query(
        `UPDATE department_records
         SET title = COALESCE($2, title),
             status = COALESCE($3, status),
             priority = COALESCE($4, priority),
             data = COALESCE($5::jsonb, data),
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [
          req.params.id,
          req.body?.title ?? null,
          req.body?.status ?? null,
          req.body?.priority ?? null,
          req.body?.data ? JSON.stringify(req.body.data) : null,
        ]
      )
    ).rows[0];
    res.json({ record: updated });
  } catch (err) {
    next(err);
  }
});

departmentsRouter.delete('/records/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const scope = resolveDeptScope(req);
    const pool = getPool();
    const existing = (
      await pool.query(`SELECT * FROM department_records WHERE id = $1 LIMIT 1`, [req.params.id])
    ).rows[0];
    if (!existing) {
      res.status(404).json({ error: 'NOT_FOUND' });
      return;
    }
    if (!scope.isAdmin && existing.department !== scope.dept) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }
    await pool.query(`DELETE FROM department_records WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// === Operational Roster: Accepted Team Members + Co-Heads in Department ===
departmentsRouter.get('/roster', async (req: AuthenticatedRequest, res, next) => {
  try {
    const scope = resolveDeptScope(req);
    if (!scope.isAdmin && !OPERATIONAL_DEPTS.has(scope.dept)) {
      res.status(403).json({
        error: 'OPERATIONAL_DEPT_ONLY',
        message: 'Rosters & shifts are scoped to Media & Press, Security, and Volunteers.',
      });
      return;
    }
    const pool = getPool();
    const deptFilter =
      scope.dept === 'media_press' ? ['media', 'press', 'media_press'] : [scope.dept];

    const [appsRes, staffRes] = await Promise.all([
      pool.query(
        `SELECT id, applicant_name AS name, email, application_type, department_slug, gender AS section, phone, position
         FROM applications
         WHERE status = 'accepted'
           AND (application_type = ANY($1::text[]) OR department_slug = ANY($1::text[]))
           AND ($2::text IS NULL OR gender = $2)
         ORDER BY applicant_name ASC`,
        [deptFilter, scope.section]
      ),
      pool.query(
        `SELECT user_id AS id, full_name AS name, email, role, eb_rank, department_slug, COALESCE(gender, division) AS section, phone, title
         FROM profiles
         WHERE is_active = true
           AND department_slug = $1
           AND ($2::text IS NULL OR COALESCE(gender, division) = $2)
           AND role IN ('executive_board', 'staff', 'department_head')
         ORDER BY full_name ASC`,
        [scope.dept, scope.section]
      ),
    ]);

    res.json({
      acceptedApplicants: appsRes.rows,
      activeMembers: staffRes.rows,
    });
  } catch (err) {
    next(err);
  }
});

// === Roles & Visual Org Chart (department_positions + department_tasks) ===
departmentsRouter.get('/roles', async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    const scope = resolveDeptScope(req);
    if (!scope.isAdmin && actor.role !== 'staff' && !OPERATIONAL_DEPTS.has(scope.dept)) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }

    const pool = getPool();
    if (actor.role === 'staff') {
      const [positions, tasks] = await Promise.all([
        pool.query(
          `SELECT * FROM department_positions
           WHERE department = $1 AND (member_user_id = $2 OR lower(member_email) = $3)
           ORDER BY created_at ASC`,
          [scope.dept, actor.user_id, actor.email.toLowerCase()]
        ),
        pool.query(
          `SELECT * FROM department_tasks
           WHERE department = $1 AND (assignee_user_id = $2 OR lower(assignee_email) = $3)
           ORDER BY created_at DESC`,
          [scope.dept, actor.user_id, actor.email.toLowerCase()]
        ),
      ]);
      res.json({ positions: positions.rows, tasks: tasks.rows, logs: [] });
      return;
    }

    const [positions, tasks, logs] = await Promise.all([
      pool.query(
        `SELECT * FROM department_positions
         WHERE department = $1 AND ($2::text IS NULL OR section IS NULL OR section = $2)
         ORDER BY created_at ASC`,
        [scope.dept, scope.section]
      ),
      pool.query(
        `SELECT * FROM department_tasks
         WHERE department = $1 AND ($2::text IS NULL OR section IS NULL OR section = $2)
         ORDER BY created_at DESC`,
        [scope.dept, scope.section]
      ),
      pool.query(
        `SELECT l.* FROM department_task_logs l
         JOIN department_tasks t ON t.id = l.task_id
         WHERE t.department = $1 AND ($2::text IS NULL OR t.section IS NULL OR t.section = $2)
         ORDER BY l.created_at DESC LIMIT 100`,
        [scope.dept, scope.section]
      ),
    ]);

    res.json({
      positions: positions.rows,
      tasks: tasks.rows,
      logs: logs.rows,
    });
  } catch (err) {
    next(err);
  }
});

departmentsRouter.post('/roles/positions', async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    const scope = resolveDeptScope(req);
    if (!scope.isAdmin && !OPERATIONAL_DEPTS.has(scope.dept)) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }
    const targetDept = scope.isAdmin && req.body?.department ? canonicalDepartmentForStorage(req.body.department) : scope.dept;
    const targetSection = scope.isAdmin ? (req.body?.section ?? null) : scope.section;
    const parentId = req.body?.parent_position_id ? String(req.body.parent_position_id) : null;
    const title = String(req.body?.title ?? '').trim();
    if (!title) {
      res.status(400).json({ error: 'TITLE_REQUIRED', message: 'Position title required.' });
      return;
    }

    const pool = getPool();
    // Cycle & depth check on parent chain (max depth 100)
    if (parentId) {
      let cur: string | null = parentId;
      let depth = 0;
      const visited = new Set<string>();
      while (cur && depth < 105) {
        if (visited.has(cur)) {
          res.status(400).json({ error: 'circular_hierarchy_detected', message: 'Circular hierarchy detected.' });
          return;
        }
        visited.add(cur);
        const pRes: { rows: Array<{ parent_position_id: string | null }> } = await pool.query<{
          parent_position_id: string | null;
        }>(`SELECT parent_position_id FROM department_positions WHERE id = $1 LIMIT 1`, [cur]);
        cur = pRes.rows[0]?.parent_position_id ?? null;
        depth++;
      }
      if (depth >= 100) {
        res.status(400).json({ error: 'circular_hierarchy_detected', message: 'Maximum hierarchy depth (100) exceeded.' });
        return;
      }
    }

    const row = (
      await pool.query(
        `INSERT INTO department_positions (
          department, section, title, parent_position_id,
          member_user_id, member_application_id, member_name, member_email, notes, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING *`,
        [
          targetDept,
          targetSection,
          title,
          parentId,
          req.body?.member_user_id || null,
          req.body?.member_application_id || null,
          req.body?.member_name || null,
          req.body?.member_email ? String(req.body.member_email).toLowerCase() : null,
          req.body?.notes || null,
          actor.user_id,
        ]
      )
    ).rows[0];

    res.status(201).json({ position: row });
  } catch (err) {
    next(err);
  }
});

departmentsRouter.patch('/roles/positions/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const scope = resolveDeptScope(req);
    const pool = getPool();
    const existing = (
      await pool.query<{ id: string; department: string }>(`SELECT id, department FROM department_positions WHERE id = $1`, [req.params.id])
    ).rows[0];
    if (!existing) {
      res.status(404).json({ error: 'NOT_FOUND' });
      return;
    }
    if (!scope.isAdmin && existing.department !== scope.dept) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }

    const nextParentId =
      req.body?.parent_position_id !== undefined ? req.body.parent_position_id || null : undefined;
    if (nextParentId) {
      if (nextParentId === req.params.id) {
        res.status(400).json({ error: 'circular_hierarchy_detected', message: 'A position cannot report to itself.' });
        return;
      }
      let cur: string | null = nextParentId;
      let depth = 0;
      while (cur && depth < 105) {
        if (cur === req.params.id) {
          res.status(400).json({ error: 'circular_hierarchy_detected', message: 'Circular hierarchy detected.' });
          return;
        }
        const p = (
          await pool.query<{ parent_position_id: string | null }>(
            `SELECT parent_position_id FROM department_positions WHERE id = $1`,
            [cur]
          )
        ).rows[0];
        cur = p?.parent_position_id ?? null;
        depth++;
      }
    }

    const updated = (
      await pool.query(
        `UPDATE department_positions
         SET title = COALESCE($2, title),
             parent_position_id = CASE WHEN $3::boolean THEN $4::uuid ELSE parent_position_id END,
             member_user_id = COALESCE($5, member_user_id),
             member_application_id = COALESCE($6, member_application_id),
             member_name = COALESCE($7, member_name),
             member_email = COALESCE($8, member_email),
             notes = COALESCE($9, notes),
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [
          req.params.id,
          req.body?.title ?? null,
          nextParentId !== undefined,
          nextParentId ?? null,
          req.body?.member_user_id ?? null,
          req.body?.member_application_id ?? null,
          req.body?.member_name ?? null,
          req.body?.member_email ? String(req.body.member_email).toLowerCase() : null,
          req.body?.notes ?? null,
        ]
      )
    ).rows[0];

    res.json({ position: updated });
  } catch (err) {
    next(err);
  }
});

departmentsRouter.delete('/roles/positions/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const scope = resolveDeptScope(req);
    const pool = getPool();
    const existing = (
      await pool.query<{ department: string }>(`SELECT department FROM department_positions WHERE id = $1`, [req.params.id])
    ).rows[0];
    if (!existing) {
      res.status(404).json({ error: 'NOT_FOUND' });
      return;
    }
    if (!scope.isAdmin && existing.department !== scope.dept) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }
    await pool.query(`DELETE FROM department_positions WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

departmentsRouter.post('/roles/tasks', async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    const scope = resolveDeptScope(req);
    if (!scope.isAdmin && !OPERATIONAL_DEPTS.has(scope.dept)) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }
    const title = String(req.body?.title ?? '').trim();
    if (!title) {
      res.status(400).json({ error: 'TITLE_REQUIRED', message: 'Task title is required.' });
      return;
    }

    const row = await withTransaction(async (client) => {
      const ins = (
        await client.query(
          `INSERT INTO department_tasks (
            department, section, position_id, assignee_user_id, assignee_application_id,
            assignee_name, assignee_email, supervisor_name, title, description, priority,
            status, location, deadline, created_by
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'not_started',$12,$13,$14)
          RETURNING *`,
          [
            scope.isAdmin && req.body?.department ? canonicalDepartmentForStorage(req.body.department) : scope.dept,
            scope.isAdmin ? (req.body?.section ?? null) : scope.section,
            req.body?.position_id || null,
            req.body?.assignee_user_id || null,
            req.body?.assignee_application_id || null,
            req.body?.assignee_name || null,
            req.body?.assignee_email ? String(req.body.assignee_email).toLowerCase() : null,
            req.body?.supervisor_name || null,
            title,
            String(req.body?.description ?? ''),
            String(req.body?.priority ?? 'medium'),
            req.body?.location || null,
            req.body?.deadline || null,
            actor.user_id,
          ]
        )
      ).rows[0];

      await client.query(
        `INSERT INTO department_task_logs (task_id, actor_user_id, actor_name, action, details)
         VALUES ($1,$2,$3,'created',$4::jsonb)`,
        [ins.id, actor.user_id, actor.full_name, JSON.stringify({ title: ins.title })]
      );
      return ins;
    });

    res.status(201).json({ task: row });
  } catch (err) {
    next(err);
  }
});

departmentsRouter.patch('/roles/tasks/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    const scope = resolveDeptScope(req);
    const pool = getPool();
    const existing = (
      await pool.query(`SELECT * FROM department_tasks WHERE id = $1`, [req.params.id])
    ).rows[0];
    if (!existing) {
      res.status(404).json({ error: 'NOT_FOUND' });
      return;
    }
    const isAssignee =
      existing.assignee_user_id === actor.user_id ||
      (existing.assignee_email && existing.assignee_email.toLowerCase() === actor.email.toLowerCase());
    if (!scope.isAdmin && existing.department !== scope.dept && !isAssignee) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }

    const updated = await withTransaction(async (client) => {
      const up = (
        await client.query(
          `UPDATE department_tasks
           SET status = COALESCE($2, status),
               priority = COALESCE($3, priority),
               title = COALESCE($4, title),
               description = COALESCE($5, description),
               location = COALESCE($6, location),
               updated_at = now()
           WHERE id = $1
           RETURNING *`,
          [
            req.params.id,
            req.body?.status ?? null,
            req.body?.priority ?? null,
            req.body?.title ?? null,
            req.body?.description ?? null,
            req.body?.location ?? null,
          ]
        )
      ).rows[0];

      await client.query(
        `INSERT INTO department_task_logs (task_id, actor_user_id, actor_name, action, details)
         VALUES ($1,$2,$3,'updated',$4::jsonb)`,
        [up.id, actor.user_id, actor.full_name, JSON.stringify({ status: up.status })]
      );
      return up;
    });

    res.json({ task: updated });
  } catch (err) {
    next(err);
  }
});

// === Custom Team Groups (team_groups + team_group_members) ===
departmentsRouter.get('/groups', async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    const scope = resolveDeptScope(req);
    if (!scope.isAdmin && actor.role !== 'staff' && !OPERATIONAL_DEPTS.has(scope.dept)) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }

    const pool = getPool();
    const groupsRes = await pool.query(
      `SELECT g.*,
        COALESCE(
          (SELECT json_agg(m ORDER BY m.created_at ASC)
           FROM team_group_members m WHERE m.group_id = g.id),
          '[]'::json
        ) AS members
       FROM team_groups g
       WHERE ($1::boolean = true OR (g.department = $2 AND ($3::text IS NULL OR g.section IS NULL OR g.section = $3)))
       ORDER BY g.created_at DESC`,
      [scope.isAdmin && !req.query.department, scope.dept, scope.section]
    );

    let groups = groupsRes.rows;
    if (actor.role === 'staff') {
      groups = groups.filter((g) =>
        (g.members || []).some(
          (m: { member_user_id?: string; member_email?: string }) =>
            m.member_user_id === actor.user_id ||
            m.member_email?.toLowerCase() === actor.email.toLowerCase()
        )
      );
    }

    res.json({ groups });
  } catch (err) {
    next(err);
  }
});

departmentsRouter.post('/groups', async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    const scope = resolveDeptScope(req);
    if (!scope.isAdmin && !OPERATIONAL_DEPTS.has(scope.dept)) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }
    const name = String(req.body?.name ?? '').trim();
    if (!name) {
      res.status(400).json({ error: 'NAME_REQUIRED', message: 'Group name required.' });
      return;
    }

    const group = await withTransaction(async (client) => {
      const g = (
        await client.query(
          `INSERT INTO team_groups (department, section, name, description, created_by)
           VALUES ($1,$2,$3,$4,$5)
           RETURNING *`,
          [
            scope.isAdmin && req.body?.department ? canonicalDepartmentForStorage(req.body.department) : scope.dept,
            scope.isAdmin ? (req.body?.section ?? null) : scope.section,
            name,
            String(req.body?.description ?? ''),
            actor.user_id,
          ]
        )
      ).rows[0];

      const members = Array.isArray(req.body?.members) ? req.body.members : [];
      for (const m of members) {
        if (!m?.member_email) continue;
        await client.query(
          `INSERT INTO team_group_members (group_id, member_user_id, member_application_id, member_name, member_email, role_label)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (group_id, member_email) DO NOTHING`,
          [
            g.id,
            m.member_user_id || null,
            m.member_application_id || null,
            String(m.member_name || m.member_email),
            String(m.member_email).toLowerCase(),
            String(m.role_label || 'member'),
          ]
        );
      }

      const fullMembers = (
        await client.query(`SELECT * FROM team_group_members WHERE group_id = $1`, [g.id])
      ).rows;
      return { ...g, members: fullMembers };
    });

    res.status(201).json({ group });
  } catch (err) {
    next(err);
  }
});

departmentsRouter.delete('/groups/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const scope = resolveDeptScope(req);
    const pool = getPool();
    const existing = (
      await pool.query<{ department: string }>(`SELECT department FROM team_groups WHERE id = $1`, [req.params.id])
    ).rows[0];
    if (!existing) {
      res.status(404).json({ error: 'NOT_FOUND' });
      return;
    }
    if (!scope.isAdmin && existing.department !== scope.dept) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }
    await pool.query(`DELETE FROM team_groups WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// === Modern Shift & Roster Management (shifts + shift_assignments) ===
departmentsRouter.get('/shifts', async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    const scope = resolveDeptScope(req);
    if (!scope.isAdmin && actor.role !== 'staff' && !OPERATIONAL_DEPTS.has(scope.dept)) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }

    const pool = getPool();
    const rows = (
      await pool.query(
        `SELECT s.*,
          COALESCE(
            (SELECT json_agg(a ORDER BY a.is_supervisor DESC, a.assignee_name ASC)
             FROM shift_assignments a WHERE a.shift_id = s.id),
            '[]'::json
          ) AS assignments
         FROM shifts s
         WHERE ($1::boolean = true OR (s.department = $2 AND ($3::text IS NULL OR s.section IS NULL OR s.section = $3)))
         ORDER BY s.starts_at ASC`,
        [scope.isAdmin && !req.query.department, scope.dept, scope.section]
      )
    ).rows;

    if (actor.role === 'staff') {
      const mine = rows.filter((s) =>
        (s.assignments || []).some(
          (a: { user_id?: string; assignee_email?: string }) =>
            a.user_id === actor.user_id ||
            a.assignee_email?.toLowerCase() === actor.email.toLowerCase()
        )
      );
      res.json({ shifts: mine });
      return;
    }

    res.json({ shifts: rows });
  } catch (err) {
    next(err);
  }
});

departmentsRouter.post('/shifts', async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    const scope = resolveDeptScope(req);
    if (!scope.isAdmin && !OPERATIONAL_DEPTS.has(scope.dept)) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }

    const title = String(req.body?.title ?? '').trim();
    const startsAt = String(req.body?.starts_at ?? '');
    const endsAt = String(req.body?.ends_at ?? '');
    if (!title || !startsAt || !endsAt || Date.parse(endsAt) <= Date.parse(startsAt)) {
      res.status(400).json({
        error: 'INVALID_SHIFT',
        message: 'Title and valid start/end timestamps required.',
      });
      return;
    }

    const shift = await withTransaction(async (client) => {
      const s = (
        await client.query(
          `INSERT INTO shifts (department, section, title, description, location, starts_at, ends_at, capacity, status, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING *`,
          [
            scope.isAdmin && req.body?.department ? canonicalDepartmentForStorage(req.body.department) : scope.dept,
            scope.isAdmin ? (req.body?.section ?? null) : scope.section,
            title,
            String(req.body?.description ?? ''),
            String(req.body?.location ?? ''),
            startsAt,
            endsAt,
            Number(req.body?.capacity ?? 10),
            String(req.body?.status ?? 'published'),
            actor.user_id,
          ]
        )
      ).rows[0];

      const assignees = Array.isArray(req.body?.assignments) ? req.body.assignments : [];
      for (const a of assignees) {
        if (!a?.assignee_email) continue;
        await client.query(
          `INSERT INTO shift_assignments (
            shift_id, user_id, application_id, role_type, responsibility, station, notes,
            is_supervisor, assignee_name, assignee_email
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            s.id,
            a.user_id || null,
            a.application_id || null,
            String(a.role_type ?? 'member'),
            a.responsibility ?? null,
            a.station ?? null,
            a.notes ?? null,
            Boolean(a.is_supervisor),
            String(a.assignee_name ?? a.assignee_email),
            String(a.assignee_email).toLowerCase(),
          ]
        );
      }

      const fullAssignments = (
        await client.query(`SELECT * FROM shift_assignments WHERE shift_id = $1`, [s.id])
      ).rows;
      return { ...s, assignments: fullAssignments };
    });

    res.status(201).json({ shift });
  } catch (err) {
    next(err);
  }
});

departmentsRouter.post('/shifts/:id/assign-group', async (req: AuthenticatedRequest, res, next) => {
  try {
    const scope = resolveDeptScope(req);
    const groupId = String(req.body?.group_id ?? '').trim();
    const pool = getPool();

    const shift = (await pool.query(`SELECT * FROM shifts WHERE id = $1`, [req.params.id])).rows[0];
    if (!shift) {
      res.status(404).json({ error: 'SHIFT_NOT_FOUND' });
      return;
    }
    if (!scope.isAdmin && shift.department !== scope.dept) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }

    const members = (
      await pool.query(`SELECT * FROM team_group_members WHERE group_id = $1`, [groupId])
    ).rows;
    let added = 0;
    for (const m of members) {
      // Check overlap warning
      const existingShifts = (
        await pool.query(
          `SELECT s.id, s.title, s.starts_at, s.ends_at
           FROM shift_assignments a
           JOIN shifts s ON s.id = a.shift_id
           WHERE lower(a.assignee_email) = $1`,
          [m.member_email.toLowerCase()]
        )
      ).rows;
      const conflict = detectShiftOverlap(existingShifts, shift);
      if (conflict) continue;

      const exists = (
        await pool.query(
          `SELECT id FROM shift_assignments WHERE shift_id = $1 AND lower(assignee_email) = $2`,
          [shift.id, m.member_email.toLowerCase()]
        )
      ).rows[0];
      if (!exists) {
        await pool.query(
          `INSERT INTO shift_assignments (shift_id, user_id, application_id, role_type, assignee_name, assignee_email)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            shift.id,
            m.member_user_id,
            m.member_application_id,
            m.role_label,
            m.member_name,
            m.member_email.toLowerCase(),
          ]
        );
        added++;
      }
    }

    res.json({ ok: true, added });
  } catch (err) {
    next(err);
  }
});

departmentsRouter.post('/shifts/:id/duplicate', async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    const scope = resolveDeptScope(req);
    const pool = getPool();
    const src = (await pool.query(`SELECT * FROM shifts WHERE id = $1`, [req.params.id])).rows[0];
    if (!src) {
      res.status(404).json({ error: 'NOT_FOUND' });
      return;
    }
    if (!scope.isAdmin && src.department !== scope.dept) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }

    const newTitle = String(req.body?.title ?? `${src.title} (Copy)`).trim();
    const startsAt = String(req.body?.starts_at ?? src.starts_at);
    const endsAt = String(req.body?.ends_at ?? src.ends_at);
    const copyAssignees = Boolean(req.body?.copy_assignments);

    const dup = await withTransaction(async (client) => {
      const s = (
        await client.query(
          `INSERT INTO shifts (department, section, title, description, location, starts_at, ends_at, capacity, status, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft',$9)
           RETURNING *`,
          [
            src.department,
            src.section,
            newTitle,
            src.description,
            src.location,
            startsAt,
            endsAt,
            src.capacity,
            actor.user_id,
          ]
        )
      ).rows[0];

      if (copyAssignees) {
        await client.query(
          `INSERT INTO shift_assignments (shift_id, user_id, application_id, role_type, responsibility, station, notes, is_supervisor, assignee_name, assignee_email)
           SELECT $1, user_id, application_id, role_type, responsibility, station, notes, is_supervisor, assignee_name, assignee_email
           FROM shift_assignments WHERE shift_id = $2`,
          [s.id, src.id]
        );
      }
      return s;
    });

    res.status(201).json({ shift: dup });
  } catch (err) {
    next(err);
  }
});

departmentsRouter.patch('/shifts/assignments/:assignmentId', async (req: AuthenticatedRequest, res, next) => {
  try {
    const pool = getPool();
    const updated = (
      await pool.query(
        `UPDATE shift_assignments
         SET attendance_status = COALESCE($2, attendance_status),
             station = COALESCE($3, station),
             responsibility = COALESCE($4, responsibility),
             is_supervisor = COALESCE($5, is_supervisor),
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [
          req.params.assignmentId,
          req.body?.attendance_status ?? null,
          req.body?.station ?? null,
          req.body?.responsibility ?? null,
          typeof req.body?.is_supervisor === 'boolean' ? req.body.is_supervisor : null,
        ]
      )
    ).rows[0];
    if (!updated) {
      res.status(404).json({ error: 'NOT_FOUND' });
      return;
    }
    res.json({ assignment: updated });
  } catch (err) {
    next(err);
  }
});

departmentsRouter.delete('/shifts/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const scope = resolveDeptScope(req);
    const pool = getPool();
    const src = (await pool.query(`SELECT department FROM shifts WHERE id = $1`, [req.params.id])).rows[0];
    if (!src) {
      res.status(404).json({ error: 'NOT_FOUND' });
      return;
    }
    if (!scope.isAdmin && src.department !== scope.dept) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }
    await pool.query(`DELETE FROM shifts WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// === Inquiries Management (HR Head Read/Update; Admin Read/Update/Delete) ===
departmentsRouter.get('/inquiries', async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    if (!isHrActor(actor, req.departments)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'HR Head or Admin access required.' });
      return;
    }
    const rows = (
      await getPool().query(`SELECT * FROM inquiries ORDER BY created_at DESC`)
    ).rows;
    res.json({ inquiries: rows });
  } catch (err) {
    next(err);
  }
});

departmentsRouter.patch('/inquiries/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    if (!isHrActor(actor, req.departments)) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }
    const row = (
      await getPool().query(
        `UPDATE inquiries
         SET status = COALESCE($2, status),
             admin_notes = COALESCE($3, admin_notes),
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [req.params.id, req.body?.status ?? null, req.body?.admin_notes ?? null]
      )
    ).rows[0];
    if (!row) {
      res.status(404).json({ error: 'NOT_FOUND' });
      return;
    }
    res.json({ inquiry: row });
  } catch (err) {
    next(err);
  }
});

departmentsRouter.delete('/inquiries/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    if (actor.role !== 'super_admin' && actor.role !== 'admin') {
      res.status(403).json({ error: 'ADMIN_ONLY', message: 'Only Admins can delete inquiries.' });
      return;
    }
    await getPool().query(`DELETE FROM inquiries WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
