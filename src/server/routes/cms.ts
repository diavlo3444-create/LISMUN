import { Router } from 'express';
import { getPool } from '../db/pool.ts';
import {
  attachAuthOptional,
  requireAuth,
  type AuthenticatedRequest,
} from '../middleware/auth.ts';
import { isDccActor, isPrActor } from '../../shared/permissions.ts';

export const cmsRouter = Router();

cmsRouter.use(attachAuthOptional);
cmsRouter.use(requireAuth);

const DCC_SETTINGS_ALLOWLIST = new Set([
  'registration_open',
  'early_bird_opens',
  'early_bird_closes',
  'regular_opens',
  'regular_closes',
]);

// PUT /api/cms/settings (Admin all keys; DCC Head restricted to 5 delegate schedule keys)
cmsRouter.put('/settings', async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    const isAdmin = actor.role === 'super_admin' || actor.role === 'admin';
    const isDcc = isDccActor(actor, req.departments);
    const updates = req.body?.settings as Record<string, unknown> | undefined;

    if (!updates || typeof updates !== 'object') {
      res.status(400).json({ error: 'INVALID_SETTINGS' });
      return;
    }

    const pool = getPool();
    for (const [key, value] of Object.entries(updates)) {
      if (!isAdmin) {
        if (!(isDcc && DCC_SETTINGS_ALLOWLIST.has(key))) {
          res.status(403).json({
            error: 'FORBIDDEN_SETTING_KEY',
            message: `Not authorized to edit setting key: ${key}`,
          });
          return;
        }
      }
      await pool.query(
        `INSERT INTO settings (key, value, updated_by)
         VALUES ($1, $2::jsonb, $3)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [key, JSON.stringify(value), actor.user_id]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Committees CRUD (Admin + DCC Head)
cmsRouter.get('/committees', async (_req, res, next) => {
  try {
    const rows = (
      await getPool().query(`SELECT * FROM committees ORDER BY sort_order ASC, name ASC`)
    ).rows;
    res.json({ committees: rows });
  } catch (err) {
    next(err);
  }
});

cmsRouter.post('/committees', async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    if (!isDccActor(actor, req.departments)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Admin or DCC Head required.' });
      return;
    }
    const b = req.body ?? {};
    const row = (
      await getPool().query(
        `INSERT INTO committees (
          id, chamber, name, abbreviation, difficulty, description, topics,
          chair_name, vice_chair_name, capacity, published, sort_order, updated_by
        ) VALUES (
          COALESCE($1::uuid, gen_random_uuid()), $2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13
        )
        ON CONFLICT (id) DO UPDATE SET
          chamber = EXCLUDED.chamber,
          name = EXCLUDED.name,
          abbreviation = EXCLUDED.abbreviation,
          difficulty = EXCLUDED.difficulty,
          description = EXCLUDED.description,
          topics = EXCLUDED.topics,
          chair_name = EXCLUDED.chair_name,
          vice_chair_name = EXCLUDED.vice_chair_name,
          capacity = EXCLUDED.capacity,
          published = EXCLUDED.published,
          sort_order = EXCLUDED.sort_order,
          updated_by = EXCLUDED.updated_by,
          updated_at = now()
        RETURNING *`,
        [
          b.id || null,
          String(b.chamber ?? 'General Assembly'),
          String(b.name ?? '').trim(),
          String(b.abbreviation ?? '').trim(),
          String(b.difficulty ?? 'Intermediate'),
          String(b.description ?? ''),
          JSON.stringify(Array.isArray(b.topics) ? b.topics : []),
          String(b.chair_name ?? 'TBA'),
          String(b.vice_chair_name ?? 'TBA'),
          Number(b.capacity ?? 30),
          b.published !== false,
          Number(b.sort_order ?? 0),
          actor.user_id,
        ]
      )
    ).rows[0];
    res.status(201).json({ committee: row });
  } catch (err) {
    next(err);
  }
});

cmsRouter.delete('/committees/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!isDccActor(req.effectiveActor!, req.departments)) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }
    await getPool().query(`DELETE FROM committees WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Sponsors CRUD (Admin + PR Head)
cmsRouter.get('/sponsors', async (_req, res, next) => {
  try {
    const rows = (await getPool().query(`SELECT * FROM sponsors ORDER BY sort_order ASC`)).rows;
    res.json({ sponsors: rows });
  } catch (err) {
    next(err);
  }
});

cmsRouter.post('/sponsors', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!isPrActor(req.effectiveActor!, req.departments)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Admin or PR Head required.' });
      return;
    }
    const b = req.body ?? {};
    const row = (
      await getPool().query(
        `INSERT INTO sponsors (id, name, tier, website_url, logo_url, published, sort_order)
         VALUES (COALESCE($1::uuid, gen_random_uuid()), $2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name, tier = EXCLUDED.tier, website_url = EXCLUDED.website_url,
           logo_url = EXCLUDED.logo_url, published = EXCLUDED.published, sort_order = EXCLUDED.sort_order
         RETURNING *`,
        [
          b.id || null,
          String(b.name ?? '').trim(),
          String(b.tier ?? 'Partner'),
          b.website_url || null,
          b.logo_url || null,
          b.published !== false,
          Number(b.sort_order ?? 0),
        ]
      )
    ).rows[0];
    res.status(201).json({ sponsor: row });
  } catch (err) {
    next(err);
  }
});

cmsRouter.delete('/sponsors/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!isPrActor(req.effectiveActor!, req.departments)) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }
    await getPool().query(`DELETE FROM sponsors WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Admin Content Tables (Announcements, Schedule, Secretariat, Documents, FAQs)
function requireAdminActor(req: AuthenticatedRequest): boolean {
  const r = req.effectiveActor?.role;
  return r === 'super_admin' || r === 'admin';
}

cmsRouter.get('/bundle', async (_req, res, next) => {
  try {
    const pool = getPool();
    const [ann, days, sessions, sec, docs, faq, forms] = await Promise.all([
      pool.query(`SELECT * FROM announcements ORDER BY published_at DESC`),
      pool.query(`SELECT * FROM schedule_days ORDER BY sort_order ASC`),
      pool.query(`SELECT * FROM schedule_sessions ORDER BY sort_order ASC`),
      pool.query(`SELECT * FROM secretariat_members ORDER BY sort_order ASC`),
      pool.query(`SELECT * FROM documents ORDER BY sort_order ASC`),
      pool.query(`SELECT * FROM faqs ORDER BY sort_order ASC`),
      pool.query(`SELECT * FROM custom_forms ORDER BY updated_at DESC`),
    ]);
    res.json({
      announcements: ann.rows,
      scheduleDays: days.rows,
      scheduleSessions: sessions.rows,
      secretariat: sec.rows,
      documents: docs.rows,
      faqs: faq.rows,
      customForms: forms.rows,
    });
  } catch (err) {
    next(err);
  }
});

cmsRouter.post('/announcements', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!requireAdminActor(req)) {
      res.status(403).json({ error: 'ADMIN_ONLY' });
      return;
    }
    const row = (
      await getPool().query(
        `INSERT INTO announcements (title, body, published) VALUES ($1,$2,$3) RETURNING *`,
        [String(req.body?.title ?? ''), String(req.body?.body ?? ''), req.body?.published !== false]
      )
    ).rows[0];
    res.status(201).json({ announcement: row });
  } catch (err) {
    next(err);
  }
});

cmsRouter.delete('/announcements/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!requireAdminActor(req)) {
      res.status(403).json({ error: 'ADMIN_ONLY' });
      return;
    }
    await getPool().query(`DELETE FROM announcements WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

cmsRouter.post('/faqs', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!requireAdminActor(req)) {
      res.status(403).json({ error: 'ADMIN_ONLY' });
      return;
    }
    const row = (
      await getPool().query(
        `INSERT INTO faqs (question, answer, category, published) VALUES ($1,$2,$3,$4) RETURNING *`,
        [
          String(req.body?.question ?? ''),
          String(req.body?.answer ?? ''),
          String(req.body?.category ?? 'General'),
          req.body?.published !== false,
        ]
      )
    ).rows[0];
    res.status(201).json({ faq: row });
  } catch (err) {
    next(err);
  }
});

cmsRouter.delete('/faqs/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!requireAdminActor(req)) {
      res.status(403).json({ error: 'ADMIN_ONLY' });
      return;
    }
    await getPool().query(`DELETE FROM faqs WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

cmsRouter.post('/forms', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!requireAdminActor(req)) {
      res.status(403).json({ error: 'ADMIN_ONLY' });
      return;
    }
    const b = req.body ?? {};
    const slug = String(b.slug ?? `form-${Date.now()}`)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-');
    const row = (
      await getPool().query(
        `INSERT INTO custom_forms (slug, title, description, department_slug, is_open, fields, created_by)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
         ON CONFLICT (slug) DO UPDATE SET
           title = EXCLUDED.title, description = EXCLUDED.description,
           is_open = EXCLUDED.is_open, fields = EXCLUDED.fields, updated_at = now()
         RETURNING *`,
        [
          slug,
          String(b.title ?? 'Custom Form'),
          String(b.description ?? ''),
          b.department_slug || null,
          b.is_open !== false,
          JSON.stringify(Array.isArray(b.fields) ? b.fields : []),
          req.effectiveActor!.user_id,
        ]
      )
    ).rows[0];
    res.status(201).json({ form: row });
  } catch (err) {
    next(err);
  }
});

cmsRouter.get('/forms/:id/submissions', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!requireAdminActor(req)) {
      res.status(403).json({ error: 'ADMIN_ONLY' });
      return;
    }
    const rows = (
      await getPool().query(
        `SELECT * FROM custom_form_submissions WHERE form_id = $1 ORDER BY submitted_at DESC`,
        [req.params.id]
      )
    ).rows;
    res.json({ submissions: rows });
  } catch (err) {
    next(err);
  }
});

cmsRouter.post('/schedule-days', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!requireAdminActor(req)) {
      res.status(403).json({ error: 'ADMIN_ONLY' });
      return;
    }
    const b = req.body ?? {};
    const row = (
      await getPool().query(
        `INSERT INTO schedule_days (id, label, event_date, sort_order, published)
         VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
           label = EXCLUDED.label, event_date = EXCLUDED.event_date,
           sort_order = EXCLUDED.sort_order, published = EXCLUDED.published
         RETURNING *`,
        [b.id || null, String(b.label ?? ''), b.event_date || null, Number(b.sort_order ?? 0), b.published !== false]
      )
    ).rows[0];
    res.status(201).json({ day: row });
  } catch (err) {
    next(err);
  }
});

cmsRouter.delete('/schedule-days/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!requireAdminActor(req)) {
      res.status(403).json({ error: 'ADMIN_ONLY' });
      return;
    }
    await getPool().query(`DELETE FROM schedule_days WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

cmsRouter.post('/schedule-sessions', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!requireAdminActor(req)) {
      res.status(403).json({ error: 'ADMIN_ONLY' });
      return;
    }
    const b = req.body ?? {};
    const row = (
      await getPool().query(
        `INSERT INTO schedule_sessions (day_id, title, time_range, location, description, sort_order, published)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [b.day_id, String(b.title ?? ''), String(b.time_range ?? ''), b.location || null, b.description || null, Number(b.sort_order ?? 0), b.published !== false]
      )
    ).rows[0];
    res.status(201).json({ session: row });
  } catch (err) {
    next(err);
  }
});

cmsRouter.delete('/schedule-sessions/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!requireAdminActor(req)) {
      res.status(403).json({ error: 'ADMIN_ONLY' });
      return;
    }
    await getPool().query(`DELETE FROM schedule_sessions WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

cmsRouter.post('/secretariat', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!requireAdminActor(req)) {
      res.status(403).json({ error: 'ADMIN_ONLY' });
      return;
    }
    const b = req.body ?? {};
    const row = (
      await getPool().query(
        `INSERT INTO secretariat_members (full_name, title, department, bio, photo_url, sort_order, published)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [String(b.full_name ?? ''), String(b.title ?? ''), b.department || null, b.bio || null, b.photo_url || null, Number(b.sort_order ?? 0), b.published !== false]
      )
    ).rows[0];
    res.status(201).json({ member: row });
  } catch (err) {
    next(err);
  }
});

cmsRouter.delete('/secretariat/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!requireAdminActor(req)) {
      res.status(403).json({ error: 'ADMIN_ONLY' });
      return;
    }
    await getPool().query(`DELETE FROM secretariat_members WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

cmsRouter.post('/documents', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!requireAdminActor(req)) {
      res.status(403).json({ error: 'ADMIN_ONLY' });
      return;
    }
    const b = req.body ?? {};
    const row = (
      await getPool().query(
        `INSERT INTO documents (title, category, url, description, sort_order, published)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [String(b.title ?? ''), String(b.category ?? 'Guide'), String(b.url ?? ''), b.description || null, Number(b.sort_order ?? 0), b.published !== false]
      )
    ).rows[0];
    res.status(201).json({ document: row });
  } catch (err) {
    next(err);
  }
});

cmsRouter.delete('/documents/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!requireAdminActor(req)) {
      res.status(403).json({ error: 'ADMIN_ONLY' });
      return;
    }
    await getPool().query(`DELETE FROM documents WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Persistent Notifications Center (strips application/decision notifications for Heads & EB!)
cmsRouter.get('/notifications', async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    const rows = (
      await getPool().query(
        `SELECT * FROM notifications
         WHERE user_id IS NULL OR user_id = $1
         ORDER BY created_at DESC LIMIT 80`,
        [actor.user_id]
      )
    ).rows;

    const isHeadOrEb = actor.role === 'department_head' || actor.role === 'executive_board' || actor.role === 'staff';
    const filtered = isHeadOrEb
      ? rows.filter(
          (n) =>
            n.category !== 'application' &&
            !/\b(accepted|rejected|waitlisted|override|spoof)\b/i.test(`${n.title} ${n.body}`)
        )
      : rows;

    res.json({ notifications: filtered });
  } catch (err) {
    next(err);
  }
});

cmsRouter.patch('/notifications/:id/read', async (req, res, next) => {
  try {
    await getPool().query(`UPDATE notifications SET is_read = true WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
