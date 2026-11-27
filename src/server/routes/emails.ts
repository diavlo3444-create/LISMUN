import { Router } from 'express';
import { getPool, withTransaction } from '../db/pool.ts';
import {
  decryptGmailSecret,
  encryptGmailSecret,
  generateOpaqueToken,
  hashOpaqueToken,
  hashPassword,
} from '../services/crypto.ts';
import { issueHrSignupInvite } from './invites.ts';
import {
  attachAuthOptional,
  requireAuth,
  type AuthenticatedRequest,
} from '../middleware/auth.ts';
import {
  applySignupLinkToBody,
  isHrActor,
  resolveEmailTemplate,
  sanitizeEmailError,
} from '../../shared/permissions.ts';
import type { ConferenceApplication } from '../../shared/types.ts';

export const emailsRouter = Router();

emailsRouter.use(attachAuthOptional);

function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim());
}

function isGmailOAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim() &&
      process.env.GMAIL_TOKEN_ENCRYPTION_KEY?.trim()
  );
}

function getAppOrigin(req: AuthenticatedRequest): string {
  const envOrigin = process.env.APP_URL?.trim();
  if (envOrigin) return envOrigin.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost:3000';
  return `${proto}://${host}`;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildBrandedHtml(subject: string, bodyText: string): string {
  const paragraphs = bodyText
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px 0;line-height:1.65;">${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('');

  return `<!doctype html><html><body style="background:#030914;color:#E8E1D2;font-family:Georgia,serif;padding:32px;">
  <div style="max-width:600px;margin:0 auto;border:1px solid #B89A62;background:#071426;padding:32px;">
    <p style="font-family:monospace;font-size:11px;letter-spacing:0.22em;color:#D5BD8B;text-transform:uppercase;margin:0 0 12px 0;">
      Leadership International School MUN
    </p>
    <h1 style="font-size:24px;font-weight:500;color:#E8E1D2;margin:0 0 20px 0;">${escapeHtml(subject)}</h1>
    <div style="font-family:sans-serif;font-size:14px;color:#E8E1D2;">${paragraphs}</div>
  </div></body></html>`;
}

async function dispatchViaResend(params: {
  to: string;
  subject: string;
  bodyText: string;
}): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  if (!isResendConfigured()) {
    return {
      ok: false,
      error: 'Resend API is not configured (missing RESEND_API_KEY or EMAIL_FROM).',
    };
  }
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM!.trim(),
        to: [params.to],
        subject: params.subject,
        text: params.bodyText,
        html: buildBrandedHtml(params.subject, params.bodyText),
      }),
    });
    const data = (await resp.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!resp.ok) {
      return { ok: false, error: sanitizeEmailError(data.message || `Resend HTTP ${resp.status}`) };
    }
    return { ok: true, messageId: data.id || `resend_${Date.now()}` };
  } catch (err) {
    return { ok: false, error: sanitizeEmailError(err instanceof Error ? err.message : err) };
  }
}

async function dispatchViaGmailOAuth(params: {
  to: string;
  subject: string;
  bodyText: string;
}): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  if (!isGmailOAuthConfigured()) {
    return { ok: false, error: 'Gmail OAuth2 is not configured on the server.' };
  }
  const pool = getPool();
  const cred = (
    await pool.query<{ encrypted_refresh_token: string }>(
      `SELECT encrypted_refresh_token FROM gmail_oauth_credentials WHERE singleton = true LIMIT 1`
    )
  ).rows[0];
  if (!cred) {
    return { ok: false, error: 'Shared Gmail account is not connected in Settings.' };
  }

  try {
    const refreshToken = decryptGmailSecret(cred.encrypted_refresh_token);
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
        client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const tokenJson = (await tokenResp.json()) as { access_token?: string; error?: string };
    if (!tokenResp.ok || !tokenJson.access_token) {
      return { ok: false, error: sanitizeEmailError(tokenJson.error || 'Gmail token refresh failed') };
    }

    const boundary = `lismun_${Date.now()}`;
    const mime = [
      `To: ${params.to}`,
      `Subject: ${params.subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      params.bodyText,
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      '',
      buildBrandedHtml(params.subject, params.bodyText),
      `--${boundary}--`,
    ].join('\r\n');

    const raw = Buffer.from(mime, 'utf8').toString('base64url');
    const sendResp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenJson.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    });
    const sendJson = (await sendResp.json()) as { id?: string; error?: { message?: string } };
    if (!sendResp.ok) {
      return {
        ok: false,
        error: sanitizeEmailError(sendJson.error?.message || `Gmail HTTP ${sendResp.status}`),
      };
    }
    return { ok: true, messageId: sendJson.id || `gmail_${Date.now()}` };
  } catch (err) {
    return { ok: false, error: sanitizeEmailError(err instanceof Error ? err.message : err) };
  }
}

// GET /api/emails/gmail/callback (OAuth2 callback — no Bearer header on redirect; state nonce verified)
emailsRouter.get('/gmail/callback', async (req, res, next) => {
  try {
    const code = String(req.query.code ?? '');
    const state = String(req.query.state ?? '');
    if (!code || !state || !isGmailOAuthConfigured()) {
      res.status(400).send('Invalid Gmail OAuth callback parameters or missing server config.');
      return;
    }
    const nonceHash = hashOpaqueToken(state);
    const pool = getPool();
    const stateRow = (
      await pool.query<{ id: string; user_id: string; expires_at: string; consumed_at: string | null }>(
        `SELECT * FROM gmail_oauth_states WHERE nonce_hash = $1 LIMIT 1`,
        [nonceHash]
      )
    ).rows[0];
    if (!stateRow || stateRow.consumed_at || new Date(stateRow.expires_at).getTime() <= Date.now()) {
      res.status(400).send('OAuth state nonce invalid or expired.');
      return;
    }

    await pool.query(`UPDATE gmail_oauth_states SET consumed_at = now() WHERE id = $1`, [
      stateRow.id,
    ]);

    const redirectUri = `${getAppOrigin(req as AuthenticatedRequest)}/api/emails/gmail/callback`;
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
        client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = (await tokenResp.json()) as { refresh_token?: string; access_token?: string };
    if (!tokenResp.ok || !tokenData.refresh_token) {
      res.status(400).send('Google did not return an offline refresh_token. Ensure prompt=consent.');
      return;
    }

    const encrypted = encryptGmailSecret(tokenData.refresh_token);
    await pool.query(
      `INSERT INTO gmail_oauth_credentials (singleton, encrypted_refresh_token, connected_by)
       VALUES (true, $1, $2)
       ON CONFLICT (singleton) DO UPDATE SET
         encrypted_refresh_token = EXCLUDED.encrypted_refresh_token,
         connected_by = EXCLUDED.connected_by,
         connected_at = now(),
         updated_at = now()`,
      [encrypted, stateRow.user_id]
    );

    res.redirect('/admin?gmail=connected');
  } catch (err) {
    next(err);
  }
});

// Public existing-account password setup: email and password only.
emailsRouter.post('/account-setup/complete', async (req, res, next) => {
  try {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 10 || password.length > 128) {
      res.status(400).json({ error: 'INVALID_INPUT', message: 'Enter a valid registered email and a 10–128 character password.' });
      return;
    }

    const outcome = await withTransaction(async (client) => {
      const account = (
        await client.query<{ id: string; role: string; department_slug: string | null }>(
          `SELECT u.id, p.role, p.department_slug
           FROM users u JOIN profiles p ON p.user_id = u.id
           WHERE lower(u.email) = $1 AND p.role <> 'super_admin'
           LIMIT 1 FOR UPDATE OF u, p`,
          [email]
        )
      ).rows[0];
      if (!account) return null;

      await client.query(
        `UPDATE users SET password_hash = $1, banned_until = NULL, updated_at = now() WHERE id = $2`,
        [hashPassword(password), account.id]
      );
      await client.query(
        `UPDATE profiles SET is_active = true, updated_at = now() WHERE user_id = $1`,
        [account.id]
      );
      await client.query(
        `UPDATE users SET setup_completed_at = COALESCE(setup_completed_at, now()), updated_at = now() WHERE id = $1`,
        [account.id]
      );
      return { role: account.role, departmentSlug: account.department_slug };
    });

    if (!outcome) {
      res.status(400).json({ error: 'ACCOUNT_NOT_FOUND', message: 'No eligible account exists for that email.' });
      return;
    }
    res.json({ ok: true, message: 'Password saved. Your existing account details were preserved.' });
  } catch (err) {
    next(err);
  }
});

// All remaining routes require Auth + Admin or HR Head
emailsRouter.use(requireAuth);

function requireEmailActor(req: AuthenticatedRequest): boolean {
  const actor = req.effectiveActor;
  if (!actor) return false;
  return isHrActor(actor, req.departments);
}

// GET /api/emails/dashboard
emailsRouter.get('/dashboard', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!requireEmailActor(req)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Admin or HR Head access required.' });
      return;
    }
    const pool = getPool();
    const [delivRes, manRes, tplRes, gmailRes] = await Promise.all([
      pool.query(`SELECT * FROM email_deliveries ORDER BY created_at DESC LIMIT 300`),
      pool.query(`SELECT * FROM email_manual_confirmations ORDER BY sent_at DESC LIMIT 300`),
      pool.query(`SELECT * FROM email_templates ORDER BY template_key ASC`),
      pool.query(`SELECT connected_email, connected_at FROM gmail_oauth_credentials WHERE singleton = true LIMIT 1`),
    ]);

    res.json({
      deliveries: delivRes.rows,
      manualConfirmations: manRes.rows,
      templates: tplRes.rows,
      resendConfigured: isResendConfigured(),
      gmailOAuthConfigured: isGmailOAuthConfigured(),
      gmailConnected: Boolean(gmailRes.rows[0]),
      gmailConnectedAt: gmailRes.rows[0]?.connected_at ?? null,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/emails/templates/:key
emailsRouter.put('/templates/:key', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!requireEmailActor(req)) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }
    const subject = String(req.body?.subject ?? '').trim();
    const bodyText = String(req.body?.body_text ?? '').trim();
    if (!subject || subject.length > 200 || !bodyText || bodyText.length > 12000) {
      res.status(400).json({
        error: 'INVALID_TEMPLATE',
        message: 'Subject (1–200 chars) and body (1–12,000 chars) required.',
      });
      return;
    }
    const row = (
      await getPool().query(
        `UPDATE email_templates
         SET subject = $2, body_text = $3, updated_at = now()
         WHERE template_key = $1
         RETURNING *`,
        [req.params.key, subject, bodyText]
      )
    ).rows[0];
    if (!row) {
      res.status(404).json({ error: 'TEMPLATE_NOT_FOUND' });
      return;
    }
    res.json({ ok: true, template: row });
  } catch (err) {
    next(err);
  }
});

// POST /api/emails/hr-bulk/preview
emailsRouter.post('/hr-bulk/preview', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!requireEmailActor(req)) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }
    const pool = getPool();
    const [appsRes, sentRes, tplRes] = await Promise.all([
      pool.query<ConferenceApplication>(
        `SELECT id, application_type, department_slug, applicant_name, email, institution, status
         FROM applications
         WHERE status IN ('accepted', 'rejected')`
      ),
      pool.query<{ source_applicant_id: string; template_key: string }>(
        `SELECT source_applicant_id, template_key FROM email_deliveries
         WHERE source_applicant_id IS NOT NULL AND status IN ('queued', 'sent')`
      ),
      pool.query(`SELECT * FROM email_templates WHERE template_key IN ('acceptance', 'rejection')`),
    ]);

    const sentSet = new Set(sentRes.rows.map((r) => `${r.source_applicant_id}|${r.template_key}`));
    const calcBucket = (targetStatus: 'accepted' | 'rejected', tplKey: string) => {
      const subset = appsRes.rows.filter((a) => a.status === targetStatus);
      let alreadyHandled = 0;
      let missingEmail = 0;
      let ready = 0;
      for (const app of subset) {
        if (sentSet.has(`${app.id}|${tplKey}`)) {
          alreadyHandled++;
        } else if (!app.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(app.email)) {
          missingEmail++;
        } else {
          ready++;
        }
      }
      return { total: subset.length, alreadyHandled, missingEmail, ready };
    };

    res.json({
      accepted: calcBucket('accepted', 'acceptance'),
      rejected: calcBucket('rejected', 'rejection'),
      templates: tplRes.rows,
      resendConfigured: isResendConfigured(),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/emails/hr-bulk/send (Resend bulk HR messaging with deduplication)
emailsRouter.post('/hr-bulk/send', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!requireEmailActor(req)) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }
    const actor = req.effectiveActor!;
    const target = req.body?.template_key === 'rejection' ? 'rejection' : 'acceptance';
    const targetStatus = target === 'acceptance' ? 'accepted' : 'rejected';
    const customSubject = String(req.body?.subject ?? '').trim();
    const customBody = String(req.body?.body_text ?? '').trim();

    if (!customSubject || customSubject.length > 200 || !customBody || customBody.length > 12000) {
      res.status(400).json({ error: 'INVALID_TEMPLATE', message: 'Valid subject and body required.' });
      return;
    }

    const pool = getPool();
    const apps = (
      await pool.query<ConferenceApplication>(
        `SELECT * FROM applications WHERE status = $1 ORDER BY created_at ASC`,
        [targetStatus]
      )
    ).rows;

    const origin = getAppOrigin(req);
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const app of apps) {
      if (!app.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(app.email)) {
        skipped++;
        continue;
      }

      let signupUrl = '';
      if (target === 'acceptance' && app.application_type !== 'delegate' && app.application_type !== 'chair') {
        const inv = await issueHrSignupInvite(app.id, actor.user_id);
        if (inv.inviteUrl) {
          signupUrl = `${origin}${inv.inviteUrl}`;
        }
      }

      const resolved = resolveEmailTemplate(
        { subject: customSubject, body_text: customBody },
        {
          name: app.applicant_name,
          department: app.department_slug,
          institution: app.institution || '',
          signup_link: signupUrl,
        }
      );
      const finalBody = signupUrl ? applySignupLinkToBody(resolved.bodyText, signupUrl) : resolved.bodyText;

      // Insert 'queued' guarded by unique partial index (applicant_type, source_applicant_id, template_key)
      let deliveryId: string | null = null;
      try {
        const ins = await pool.query<{ id: string }>(
          `INSERT INTO email_deliveries (
            application_id, applicant_type, source_applicant_id, recipient_email, recipient_name,
            department_slug, template_key, subject, body_text, status, delivery_method, sent_by, sent_by_name
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'queued','resend',$10,$11)
          RETURNING id`,
          [
            app.id,
            app.application_type,
            app.id,
            app.email.toLowerCase(),
            app.applicant_name,
            app.department_slug,
            target,
            resolved.subject,
            finalBody,
            actor.user_id,
            actor.full_name,
          ]
        );
        deliveryId = ins.rows[0].id;
      } catch {
        // Unique conflict -> already queued/sent
        skipped++;
        continue;
      }

      const dispatch = await dispatchViaResend({
        to: app.email.toLowerCase(),
        subject: resolved.subject,
        bodyText: finalBody,
      });

      if (dispatch.ok) {
        sent++;
        await pool.query(
          `UPDATE email_deliveries
           SET status = 'sent', provider_message_id = $2, sent_at = now()
           WHERE id = $1`,
          [deliveryId, dispatch.messageId]
        );
      } else {
        failed++;
        await pool.query(
          `UPDATE email_deliveries
           SET status = 'failed', error_message = $2
           WHERE id = $1`,
          [deliveryId, dispatch.error]
        );
      }
    }

    res.json({ ok: true, sent, failed, skipped });
  } catch (err) {
    next(err);
  }
});

// POST /api/emails/application-send (individual decision email via Resend or Gmail OAuth2)
emailsRouter.post('/application-send', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!requireEmailActor(req)) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }
    const actor = req.effectiveActor!;
    const applicationId = String(req.body?.application_id ?? '').trim();
    const method = req.body?.method === 'gmail_oauth' ? 'gmail_oauth' : 'resend';
    const decision = String(req.body?.decision ?? '');

    const pool = getPool();
    const app = (
      await pool.query<ConferenceApplication>(`SELECT * FROM applications WHERE id = $1`, [
        applicationId,
      ])
    ).rows[0];
    if (!app) {
      res.status(404).json({ error: 'NOT_FOUND' });
      return;
    }

    const templateKey =
      decision === 'accepted'
        ? app.application_type === 'delegate'
          ? 'delegate_acceptance'
          : 'acceptance'
        : decision === 'waitlisted'
        ? 'waitlist'
        : 'rejection';

    const tpl = (
      await pool.query<{ subject: string; body_text: string }>(
        `SELECT subject, body_text FROM email_templates WHERE template_key = $1 LIMIT 1`,
        [templateKey]
      )
    ).rows[0] ?? {
      subject: `LIS MUN — Application ${decision}`,
      body_text: `Dear {name},\n\nYour application status is: ${decision}.\n`,
    };

    const origin = getAppOrigin(req);
    let signupUrl = '';
    if (decision === 'accepted' && app.application_type !== 'delegate' && app.application_type !== 'chair') {
      const inv = await issueHrSignupInvite(app.id, actor.user_id);
      if (inv.inviteUrl) signupUrl = `${origin}${inv.inviteUrl}`;
    }

    const resolved = resolveEmailTemplate(tpl, {
      name: app.applicant_name,
      department: app.department_slug,
      institution: app.institution || '',
      signup_link: signupUrl,
    });
    const finalBody = signupUrl ? applySignupLinkToBody(resolved.bodyText, signupUrl) : resolved.bodyText;

    const dispatch =
      method === 'gmail_oauth'
        ? await dispatchViaGmailOAuth({
            to: app.email,
            subject: resolved.subject,
            bodyText: finalBody,
          })
        : await dispatchViaResend({
            to: app.email,
            subject: resolved.subject,
            bodyText: finalBody,
          });

    const delivRow = (
      await pool.query(
        `INSERT INTO email_deliveries (
          application_id, applicant_type, recipient_email, recipient_name, department_slug,
          template_key, subject, body_text, status, delivery_method, provider_message_id,
          error_message, sent_by, sent_by_name, sent_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, CASE WHEN $9='sent' THEN now() ELSE NULL END)
        RETURNING *`,
        [
          app.id,
          app.application_type,
          app.email,
          app.applicant_name,
          app.department_slug,
          templateKey,
          resolved.subject,
          finalBody,
          dispatch.ok ? 'sent' : 'failed',
          method,
          dispatch.ok ? dispatch.messageId : null,
          dispatch.ok ? null : dispatch.error,
          actor.user_id,
          actor.full_name,
        ]
      )
    ).rows[0];

    res.status(dispatch.ok ? 200 : 502).json({
      ok: dispatch.ok,
      delivery: delivRow,
      error: dispatch.ok ? undefined : dispatch.error,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/emails/mark-sent (Atomic Mark-as-Sent audit for manual Gmail sends)
emailsRouter.post('/mark-sent', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!requireEmailActor(req)) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }
    const actor = req.effectiveActor!;
    const applicationId = String(req.body?.application_id ?? '').trim();
    const decisionStatus = String(req.body?.decision_status ?? 'accepted').trim();
    const recipientName = String(req.body?.recipient_name ?? '').trim();
    const recipientEmail = String(req.body?.recipient_email ?? '').trim().toLowerCase();
    const subject = String(req.body?.subject ?? 'LIS MUN Notice').trim();
    const bodyText = String(req.body?.body_text ?? '').trim();
    const serverDeliveryId = req.body?.server_delivery_id || null;

    if (!applicationId || !recipientEmail) {
      res.status(400).json({ error: 'INVALID_INPUT', message: 'Application ID and recipient email required.' });
      return;
    }

    const confirmation = await withTransaction(async (client) => {
      const conf = (
        await client.query(
          `INSERT INTO email_manual_confirmations (
            application_id, decision_status, server_delivery_id, recipient_name, recipient_email,
            department_slug, subject, body_text, confirmed_by, confirmed_by_name, confirmed_by_email
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          ON CONFLICT (application_id, decision_status) DO UPDATE SET
            attempt_count = email_manual_confirmations.attempt_count + 1,
            sent_at = now(),
            subject = EXCLUDED.subject,
            body_text = EXCLUDED.body_text,
            confirmed_by = EXCLUDED.confirmed_by,
            confirmed_by_name = EXCLUDED.confirmed_by_name,
            confirmed_by_email = EXCLUDED.confirmed_by_email
          RETURNING *`,
          [
            applicationId,
            decisionStatus,
            serverDeliveryId,
            recipientName,
            recipientEmail,
            req.body?.department_slug || null,
            subject,
            bodyText,
            actor.user_id,
            actor.full_name,
            actor.email,
          ]
        )
      ).rows[0];

      await client.query(
        `UPDATE email_deliveries
         SET status = 'sent', delivery_method = 'manual_gmail', error_message = NULL, sent_at = now()
         WHERE application_id = $1 AND status IN ('failed', 'queued')`,
        [applicationId]
      );

      return conf;
    });

    res.json({ ok: true, confirmation });
  } catch (err) {
    next(err);
  }
});

// POST /api/emails/retry/:deliveryId (Retry failed delivery via original or requested provider)
emailsRouter.post('/retry/:deliveryId', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!requireEmailActor(req)) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }
    const pool = getPool();
    const delivery = (
      await pool.query(
        `SELECT * FROM email_deliveries WHERE id = $1 LIMIT 1`,
        [req.params.deliveryId]
      )
    ).rows[0];
    if (!delivery) {
      res.status(404).json({ error: 'DELIVERY_NOT_FOUND', message: 'Delivery record not found.' });
      return;
    }
    if (delivery.status === 'sent') {
      res.json({ ok: true, delivery, message: 'Email already sent.' });
      return;
    }

    const method =
      req.body?.method === 'gmail_oauth'
        ? 'gmail_oauth'
        : req.body?.method === 'resend'
        ? 'resend'
        : delivery.delivery_method === 'gmail_oauth'
        ? 'gmail_oauth'
        : 'resend';

    const dispatch =
      method === 'gmail_oauth'
        ? await dispatchViaGmailOAuth({
            to: delivery.recipient_email,
            subject: delivery.subject,
            bodyText: delivery.body_text,
          })
        : await dispatchViaResend({
            to: delivery.recipient_email,
            subject: delivery.subject,
            bodyText: delivery.body_text,
          });

    const updated = (
      await pool.query(
        `UPDATE email_deliveries
         SET status = $2,
             delivery_method = $3,
             provider_message_id = COALESCE($4, provider_message_id),
             error_message = $5,
             attempt_count = attempt_count + 1,
             sent_at = CASE WHEN $2 = 'sent' THEN now() ELSE sent_at END
         WHERE id = $1
         RETURNING *`,
        [
          delivery.id,
          dispatch.ok ? 'sent' : 'failed',
          method,
          dispatch.ok ? dispatch.messageId : null,
          dispatch.ok ? null : dispatch.error,
        ]
      )
    ).rows[0];

    res.status(dispatch.ok ? 200 : 502).json({
      ok: dispatch.ok,
      delivery: updated,
      error: dispatch.ok ? undefined : dispatch.error,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/emails/gmail/start & disconnect (Admin only)
emailsRouter.post('/gmail/start', async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    if (actor.role !== 'super_admin' && actor.role !== 'admin') {
      res.status(403).json({ error: 'ADMIN_ONLY' });
      return;
    }
    if (!isGmailOAuthConfigured()) {
      res.status(503).json({
        error: 'GMAIL_OAUTH_NOT_CONFIGURED',
        message: 'GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GMAIL_TOKEN_ENCRYPTION_KEY are required.',
      });
      return;
    }

    const nonce = generateOpaqueToken(24);
    await getPool().query(
      `INSERT INTO gmail_oauth_states (nonce_hash, user_id, expires_at)
       VALUES ($1, $2, now() + interval '10 minutes')`,
      [hashOpaqueToken(nonce), actor.user_id]
    );

    const redirectUri = `${getAppOrigin(req)}/api/emails/gmail/callback`;
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID!.trim());
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/gmail.send');
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('state', nonce);

    res.json({ authUrl: authUrl.toString() });
  } catch (err) {
    next(err);
  }
});

emailsRouter.post('/gmail/disconnect', async (req: AuthenticatedRequest, res, next) => {
  try {
    const actor = req.effectiveActor!;
    if (actor.role !== 'super_admin' && actor.role !== 'admin') {
      res.status(403).json({ error: 'ADMIN_ONLY' });
      return;
    }
    await getPool().query(`DELETE FROM gmail_oauth_credentials WHERE singleton = true`);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
