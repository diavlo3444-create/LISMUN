import { Router } from 'express';
import { getPool, isDatabaseConfigured, withTransaction } from '../db/pool.ts';
import {
  generateApplicationCode,
  generateOpaqueToken,
  signHmacPayload,
  verifyHmacPayload,
} from '../services/crypto.ts';
import {
  attachAuthOptional,
  requireDbMiddleware,
  type AuthenticatedRequest,
} from '../middleware/auth.ts';
import {
  LEGAL_CONSENT_VERSION,
  validateTeamIntakePayload,
} from '../../shared/intake.ts';
import {
  canonicalDepartmentForStorage,
  hasPermission,
} from '../../shared/permissions.ts';
import type { ApplicationAttachmentRef } from '../../shared/types.ts';

export const publicRouter = Router();

publicRouter.use(attachAuthOptional);

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MiB practical Postgres BYTEA cap

async function enforceFloodLimit(bucket: string, maxPerMinute: number): Promise<boolean> {
  const pool = getPool();
  const res = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt
     FROM rate_limit_events
     WHERE bucket = $1 AND created_at > now() - interval '1 minute'`,
    [bucket]
  );
  if (Number(res.rows[0]?.cnt ?? '0') >= maxPerMinute) {
    return false;
  }
  await pool.query(`INSERT INTO rate_limit_events (bucket) VALUES ($1)`, [bucket]);
  return true;
}

// GET /api/public/overview
publicRouter.get('/overview', async (_req, res, next) => {
  try {
    if (!isDatabaseConfigured()) {
      res.json({
        dbConfigured: false,
        departments: [],
        settings: {},
        committees: [],
        scheduleDays: [],
        scheduleSessions: [],
        secretariat: [],
        announcements: [],
        documents: [],
        faqs: [],
        sponsors: [],
        customForms: [],
      });
      return;
    }

    const pool = getPool();
    const [
      deptRes,
      settingsRes,
      committeesRes,
      daysRes,
      sessionsRes,
      secRes,
      annRes,
      docsRes,
      faqRes,
      sponsorsRes,
      formsRes,
    ] = await Promise.all([
      pool.query(
        `SELECT id, slug, name, description, is_sectioned, has_public_intake, registration_open, updated_at
         FROM departments ORDER BY name ASC`
      ),
      pool.query(`SELECT key, value FROM settings`),
      pool.query(`SELECT * FROM committees WHERE published = true ORDER BY sort_order ASC, name ASC`),
      pool.query(`SELECT * FROM schedule_days WHERE published = true ORDER BY sort_order ASC`),
      pool.query(`SELECT * FROM schedule_sessions WHERE published = true ORDER BY sort_order ASC`),
      pool.query(`SELECT * FROM secretariat_members WHERE published = true ORDER BY sort_order ASC`),
      pool.query(
        `SELECT * FROM announcements WHERE published = true AND published_at <= now() ORDER BY published_at DESC`
      ),
      pool.query(`SELECT * FROM documents WHERE published = true ORDER BY sort_order ASC`),
      pool.query(`SELECT * FROM faqs WHERE published = true ORDER BY sort_order ASC`),
      pool.query(`SELECT * FROM sponsors WHERE published = true ORDER BY sort_order ASC`),
      pool.query(`SELECT id, slug, title, description, department_slug, is_open, fields FROM custom_forms WHERE is_open = true ORDER BY updated_at DESC`),
    ]);

    const settings: Record<string, unknown> = {};
    for (const row of settingsRes.rows) {
      settings[row.key] = row.value;
    }

    res.json({
      dbConfigured: true,
      departments: deptRes.rows,
      settings,
      committees: committeesRes.rows,
      scheduleDays: daysRes.rows,
      scheduleSessions: sessionsRes.rows,
      secretariat: secRes.rows,
      announcements: annRes.rows,
      documents: docsRes.rows,
      faqs: faqRes.rows,
      sponsors: sponsorsRes.rows,
      customForms: formsRes.rows,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/public/files/init-upload (signed upload ticket for open tracks)
publicRouter.post('/files/init-upload', requireDbMiddleware, async (req, res, next) => {
  try {
    const appType = String(req.body?.application_type ?? '').trim().toLowerCase();
    const fileName = String(req.body?.file_name ?? 'upload.bin')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 80);
    const mimeType = String(req.body?.mime_type ?? '').trim().toLowerCase();
    const sizeBytes = Number(req.body?.size_bytes ?? 0);

    if (!['media', 'press', 'volunteers', 'security'].includes(appType)) {
      res.status(400).json({ error: 'INVALID_TRACK', message: 'Invalid application track.' });
      return;
    }
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      res.status(400).json({
        error: 'UNSUPPORTED_FILE_TYPE',
        message: 'Only JPEG, PNG, WebP, or PDF attachments are accepted.',
      });
      return;
    }
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_UPLOAD_BYTES) {
      res.status(400).json({
        error: 'INVALID_FILE_SIZE',
        message: 'Attachment must be between 1 byte and 15 MiB.',
      });
      return;
    }

    const pool = getPool();
    const deptSlug = canonicalDepartmentForStorage(appType);
    const dept = (
      await pool.query<{ registration_open: boolean }>(
        `SELECT registration_open FROM departments WHERE slug = $1 LIMIT 1`,
        [deptSlug]
      )
    ).rows[0];
    if (!dept || !dept.registration_open) {
      res.status(403).json({
        error: 'REGISTRATION_CLOSED',
        message: 'Applications for this department are currently closed.',
      });
      return;
    }

    const storageKey = `${appType}/${new Date().toISOString().slice(0, 7)}/${generateOpaqueToken(8)}-${fileName}`;
    const uploadToken = signHmacPayload(
      {
        kind: 'public_file_upload',
        storageKey,
        appType,
        fileName,
        mimeType,
        maxBytes: MAX_UPLOAD_BYTES,
      },
      600
    );

    res.json({
      storageKey,
      uploadUrl: `/api/public/files/upload?token=${encodeURIComponent(uploadToken)}`,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/public/files/upload (stores binary attachment securely in Neon PostgreSQL)
publicRouter.put('/files/upload', requireDbMiddleware, async (req, res, next) => {
  try {
    const token = String(req.query.token ?? '');
    const claims = verifyHmacPayload<{
      kind: string;
      storageKey: string;
      appType: string;
      fileName: string;
      mimeType: string;
      maxBytes: number;
    }>(token);

    if (!claims || claims.kind !== 'public_file_upload') {
      res.status(403).json({ error: 'INVALID_UPLOAD_TOKEN', message: 'Upload token expired or invalid.' });
      return;
    }

    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of req) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > claims.maxBytes) {
        res.status(413).json({ error: 'FILE_TOO_LARGE', message: 'File exceeds maximum upload limit.' });
        return;
      }
      chunks.push(buf);
    }
    const content = Buffer.concat(chunks);
    if (content.length === 0) {
      res.status(400).json({ error: 'EMPTY_FILE', message: 'Uploaded file is empty.' });
      return;
    }

    await getPool().query(
      `INSERT INTO application_files (storage_key, application_type, file_name, mime_type, size_bytes, content)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (storage_key) DO NOTHING`,
      [claims.storageKey, claims.appType, claims.fileName, claims.mimeType, content.length, content]
    );

    const attachment: ApplicationAttachmentRef = {
      id: generateOpaqueToken(6),
      file_name: claims.fileName,
      mime_type: claims.mimeType,
      size_bytes: content.length,
      storage_key: claims.storageKey,
      uploaded_at: new Date().toISOString(),
    };

    res.json({ ok: true, attachment });
  } catch (err) {
    next(err);
  }
});

// GET /api/public/files/download?token=... (verified time-limited signed file download)
publicRouter.get('/files/download', requireDbMiddleware, async (req: AuthenticatedRequest, res, next) => {
  try {
    const token = String(req.query.token ?? '');
    const claims = verifyHmacPayload<{
      kind: string;
      storageKey: string;
      userId: string;
    }>(token);
    if (!claims || claims.kind !== 'signed_attachment_download') {
      res.status(403).json({ error: 'INVALID_DOWNLOAD_TOKEN', message: 'Download link expired or invalid.' });
      return;
    }

    // Require active authenticated session or explicit matching actor when downloading private attachments
    if (!req.effectiveActor || !hasPermission(req.effectiveActor, 'applications.view', req.departments)) {
      // Allow direct browser <a href> download via signed token bound to userId issued moments earlier
      if (!claims.userId) {
        res.status(403).json({ error: 'FORBIDDEN' });
        return;
      }
    }

    const row = (
      await getPool().query<{ file_name: string; mime_type: string; content: Buffer }>(
        `SELECT file_name, mime_type, content FROM application_files WHERE storage_key = $1 LIMIT 1`,
        [claims.storageKey]
      )
    ).rows[0];
    if (!row) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Attachment not found.' });
      return;
    }

    res.setHeader('Content-Type', row.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${row.file_name}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(row.content);
  } catch (err) {
    next(err);
  }
});

// POST /api/public/applications/team (Security / Media / Press / Volunteers)
publicRouter.post('/applications/team', requireDbMiddleware, async (req, res, next) => {
  try {
    if (String(req.body?.website ?? '').trim()) {
      // Honeypot triggered: silent fake success
      res.status(201).json({ ok: true, application_code: 'LM-VERIFIED' });
      return;
    }

    const check = validateTeamIntakePayload(req.body ?? {});
    if (!check.valid) {
      res.status(400).json({ error: 'VALIDATION_FAILED', errors: check.errors });
      return;
    }

    const okRate = await enforceFloodLimit('team_intake', 20);
    if (!okRate) {
      res.status(429).json({
        error: 'RATE_LIMITED',
        message: 'Too many submissions this minute. Please wait briefly and try again.',
      });
      return;
    }

    const track = String(req.body.track).toLowerCase();
    const deptSlug = canonicalDepartmentForStorage(track);
    const pool = getPool();

    const deptRow = (
      await pool.query<{ id: string; registration_open: boolean }>(
        `SELECT id, registration_open FROM departments WHERE slug = $1 LIMIT 1`,
        [deptSlug]
      )
    ).rows[0];

    const switchRes = (
      await pool.query<{ value: unknown }>(
        `SELECT value FROM settings WHERE key = $1 LIMIT 1`,
        [`team_${track}_open`]
      )
    ).rows[0];
    const switchOpen = switchRes ? switchRes.value !== false && switchRes.value !== 'false' : true;

    if (!deptRow || !deptRow.registration_open || !switchOpen) {
      res.status(403).json({
        error: 'REGISTRATION_CLOSED',
        message: `Applications for ${track} are currently closed.`,
      });
      return;
    }

    const email = String(req.body.email).trim().toLowerCase();
    const code = generateApplicationCode('LM');
    const attachments: ApplicationAttachmentRef[] = Array.isArray(req.body.attachments)
      ? req.body.attachments.slice(0, 8)
      : [];

    const inserted = await withTransaction(async (client) => {
      const dup = await client.query<{ id: string }>(
        `SELECT id FROM applications
         WHERE lower(application_type) = $1
           AND lower(email) = $2
           AND status IN ('pending', 'received', 'under_review')
         LIMIT 1`,
        [track, email]
      );
      if (dup.rows[0]) {
        return { duplicate: true as const };
      }

      const appRes = await client.query(
        `INSERT INTO applications (
          application_code, application_type, department_id, department_slug,
          applicant_name, email, phone, emergency_phone, gender, institution,
          grade_or_year, age, position, experience, statement, answers, attachments,
          status, privacy_policy_accepted, terms_accepted, legal_consent_version
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb,'pending',true,true,$18)
        RETURNING id, application_code, application_type, department_slug, status, created_at`,
        [
          code,
          track,
          deptRow.id,
          deptSlug,
          String(req.body.applicant_name).trim(),
          email,
          String(req.body.phone).trim(),
          String(req.body.emergency_phone).trim(),
          req.body.gender,
          String(req.body.institution).trim(),
          String(req.body.grade_or_year ?? '').trim() || null,
          Number(req.body.age),
          req.body.position ? String(req.body.position).trim() : null,
          String(req.body.experience ?? '').trim() || null,
          String(req.body.statement ?? '').trim() || null,
          JSON.stringify({
            ...(req.body.answers ?? {}),
            portfolio_url: req.body.portfolio_url ?? null,
          }),
          JSON.stringify(attachments),
          LEGAL_CONSENT_VERSION,
        ]
      );

      const appId = appRes.rows[0].id;
      await client.query(
        `INSERT INTO application_medical (application_id, medical_has_conditions, medical_details)
         VALUES ($1, $2, $3)`,
        [
          appId,
          Boolean(req.body.medical_has_conditions),
          Boolean(req.body.medical_has_conditions)
            ? String(req.body.medical_details ?? '').trim()
            : '',
        ]
      );

      return { duplicate: false as const, application: appRes.rows[0] };
    });

    if ('duplicate' in inserted && inserted.duplicate) {
      res.status(409).json({
        error: 'DUPLICATE_PENDING_APPLICATION',
        message: 'A pending application already exists for this email and track.',
      });
      return;
    }

    res.status(201).json({
      ok: true,
      application: inserted.application,
      application_code: inserted.application.application_code,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/public/applications/delegate
publicRouter.post('/applications/delegate', requireDbMiddleware, async (req, res, next) => {
  try {
    if (String(req.body?.website ?? '').trim()) {
      res.status(201).json({ ok: true, application_code: 'LMD-VERIFIED' });
      return;
    }

    const fullName = String(req.body?.full_name ?? '').trim();
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const institution = String(req.body?.institution ?? '').trim();
    const countryOrCity = String(req.body?.country_or_city ?? '').trim();
    const delegationType =
      req.body?.delegation_type === 'school_delegation'
        ? 'school_delegation'
        : 'single_delegate';
    const delegationSize =
      delegationType === 'school_delegation' ? Number(req.body?.delegation_size ?? 6) : 1;
    const tier = req.body?.tier === 'regular' ? 'regular' : 'early_bird';

    if (fullName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !institution) {
      res.status(400).json({
        error: 'VALIDATION_FAILED',
        message: 'Full name, valid email, and school/institution are required.',
      });
      return;
    }
    if (req.body?.privacy_policy_accepted !== true || req.body?.terms_accepted !== true) {
      res.status(400).json({
        error: 'CONSENT_REQUIRED',
        message: 'Privacy Policy and Terms & Conditions acceptance is required.',
      });
      return;
    }

    const okRate = await enforceFloodLimit('delegate_intake', 20);
    if (!okRate) {
      res.status(429).json({ error: 'RATE_LIMITED', message: 'Rate limit exceeded.' });
      return;
    }

    const pool = getPool();
    const settingsRes = await pool.query<{ key: string; value: unknown }>(
      `SELECT key, value FROM settings WHERE key IN ('registration_open', 'fee_early_bird', 'fee_regular')`
    );
    const settingsMap = Object.fromEntries(settingsRes.rows.map((r) => [r.key, r.value]));
    if (settingsMap.registration_open === false || settingsMap.registration_open === 'false') {
      res.status(403).json({
        error: 'REGISTRATION_CLOSED',
        message: 'Delegate registration is currently closed.',
      });
      return;
    }

    const unitFee =
      tier === 'early_bird'
        ? Number(settingsMap.fee_early_bird ?? 150)
        : Number(settingsMap.fee_regular ?? 200);
    const feeAmount = unitFee * Math.max(1, delegationSize);
    const dccDept = (
      await pool.query<{ id: string }>(`SELECT id FROM departments WHERE slug = 'dcc' LIMIT 1`)
    ).rows[0];

    const dup = await pool.query<{ id: string }>(
      `SELECT id FROM applications
       WHERE application_type = 'delegate' AND lower(email) = $1
         AND COALESCE(tier, 'early_bird') = $2
         AND status IN ('pending', 'received', 'under_review', 'accepted')
       LIMIT 1`,
      [email, tier]
    );
    if (dup.rows[0]) {
      res.status(409).json({
        error: 'DUPLICATE_DELEGATE',
        message: `A delegate application for ${tier.replace('_', ' ')} already exists for this email.`,
      });
      return;
    }

    const code = generateApplicationCode('LMD');
    const inserted = (
      await pool.query(
        `INSERT INTO applications (
          application_code, application_type, department_id, department_slug,
          applicant_name, email, institution, delegation_type, delegation_size,
          tier, fee_amount, payment_status, experience, statement, answers,
          status, privacy_policy_accepted, terms_accepted, legal_consent_version
        ) VALUES ($1,'delegate',$2,'dcc',$3,$4,$5,$6,$7,$8,$9,'unpaid',$10,$11,$12::jsonb,'pending',true,true,$13)
        RETURNING id, application_code, fee_amount, tier, status, created_at`,
        [
          code,
          dccDept?.id ?? null,
          fullName,
          email,
          institution,
          delegationType,
          delegationSize,
          tier,
          feeAmount,
          String(req.body?.experience ?? 'Experienced Delegate'),
          String(req.body?.motivation_note ?? '').trim() || null,
          JSON.stringify({
            country_or_city: countryOrCity,
            preferred_committee_id: req.body?.preferred_committee_id ?? 'tba',
          }),
          LEGAL_CONSENT_VERSION,
        ]
      )
    ).rows[0];

    res.status(201).json({
      ok: true,
      application: inserted,
      dossierCode: inserted.application_code,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/public/applications/chair
publicRouter.post('/applications/chair', requireDbMiddleware, async (req, res, next) => {
  try {
    if (String(req.body?.website ?? '').trim()) {
      res.status(201).json({ ok: true, application_code: 'LMC-VERIFIED' });
      return;
    }
    const fullName = String(req.body?.full_name ?? '').trim();
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const institution = String(req.body?.institution ?? '').trim();
    const experience = String(req.body?.experience ?? '').trim();
    const statement = String(req.body?.statement ?? '').trim();
    const committees = String(req.body?.committee_preferences ?? '').trim();

    if (
      fullName.length < 2 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !institution ||
      !experience ||
      !statement
    ) {
      res.status(400).json({
        error: 'VALIDATION_FAILED',
        message: 'Name, email, institution, chairing experience, and statement are required.',
      });
      return;
    }
    if (req.body?.privacy_policy_accepted !== true || req.body?.terms_accepted !== true) {
      res.status(400).json({
        error: 'CONSENT_REQUIRED',
        message: 'Privacy Policy and Terms & Conditions acceptance is required.',
      });
      return;
    }

    const pool = getPool();
    const chairSwitch = (
      await pool.query<{ value: unknown }>(
        `SELECT value FROM settings WHERE key = 'chair_registration_open' LIMIT 1`
      )
    ).rows[0];
    if (chairSwitch && (chairSwitch.value === false || chairSwitch.value === 'false')) {
      res.status(403).json({
        error: 'CHAIR_CLOSED',
        message: 'Chair applications are currently closed.',
      });
      return;
    }

    const dccDept = (
      await pool.query<{ id: string }>(`SELECT id FROM departments WHERE slug = 'dcc' LIMIT 1`)
    ).rows[0];

    const dup = await pool.query<{ id: string }>(
      `SELECT id FROM applications
       WHERE application_type = 'chair' AND lower(email) = $1
         AND status IN ('pending', 'received', 'under_review')
       LIMIT 1`,
      [email]
    );
    if (dup.rows[0]) {
      res.status(409).json({
        error: 'DUPLICATE_CHAIR',
        message: 'A pending chair application already exists for this email.',
      });
      return;
    }

    const inserted = (
      await pool.query(
        `INSERT INTO applications (
          application_code, application_type, department_id, department_slug,
          applicant_name, email, phone, institution, age, experience, statement,
          answers, status, privacy_policy_accepted, terms_accepted, legal_consent_version
        ) VALUES ($1,'chair',$2,'dcc',$3,$4,$5,$6,$7,$8,$9,$10::jsonb,'pending',true,true,$11)
        RETURNING id, application_code, status, created_at`,
        [
          generateApplicationCode('LMC'),
          dccDept?.id ?? null,
          fullName,
          email,
          req.body?.phone ? String(req.body.phone).trim() : null,
          institution,
          req.body?.age ? Number(req.body.age) : null,
          experience,
          statement,
          JSON.stringify({ committee_preferences: committees }),
          LEGAL_CONSENT_VERSION,
        ]
      )
    ).rows[0];

    res.status(201).json({ ok: true, application: inserted });
  } catch (err) {
    next(err);
  }
});

// POST /api/public/inquiries
publicRouter.post('/inquiries', requireDbMiddleware, async (req, res, next) => {
  try {
    if (String(req.body?.website ?? '').trim()) {
      res.status(201).json({ ok: true });
      return;
    }
    const fullName = String(req.body?.full_name ?? '').trim();
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const subject = String(req.body?.subject ?? 'General Inquiry').trim();
    const message = String(req.body?.message ?? '').trim();

    if (fullName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || message.length < 5) {
      res.status(400).json({
        error: 'VALIDATION_FAILED',
        message: 'Name, valid email, and inquiry message are required.',
      });
      return;
    }

    const okRate = await enforceFloodLimit('public_inquiries', 10);
    if (!okRate) {
      res.status(429).json({ error: 'RATE_LIMITED', message: 'Too many inquiries per minute.' });
      return;
    }

    const row = (
      await getPool().query(
        `INSERT INTO inquiries (full_name, email, subject, message, status)
         VALUES ($1, $2, $3, $4, 'new')
         RETURNING id, created_at`,
        [fullName, email, subject, message]
      )
    ).rows[0];

    res.status(201).json({ ok: true, inquiry: row });
  } catch (err) {
    next(err);
  }
});

// POST /api/public/forms/:slug/submit (Custom Form Builder public submission)
publicRouter.post('/forms/:slug/submit', requireDbMiddleware, async (req, res, next) => {
  try {
    const pool = getPool();
    const form = (
      await pool.query<{ id: string; is_open: boolean }>(
        `SELECT id, is_open FROM custom_forms WHERE slug = $1 LIMIT 1`,
        [req.params.slug]
      )
    ).rows[0];
    if (!form || !form.is_open) {
      res.status(404).json({ error: 'FORM_NOT_OPEN', message: 'Form not found or closed.' });
      return;
    }
    const sub = (
      await pool.query(
        `INSERT INTO custom_form_submissions (form_id, answers)
         VALUES ($1, $2::jsonb)
         RETURNING id, submitted_at`,
        [form.id, JSON.stringify(req.body?.answers ?? {})]
      )
    ).rows[0];
    res.status(201).json({ ok: true, submission: sub });
  } catch (err) {
    next(err);
  }
});
