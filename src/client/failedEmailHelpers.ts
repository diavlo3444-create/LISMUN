import type { EmailDeliveryRecord, FailedEmailItem } from '../shared/types';
import { applySignupLinkToBody } from '../shared/permissions';

export const FAILED_EMAILS_STORAGE_KEY = 'wm_failed_emails_v1';
export const GMAIL_OPENED_STORAGE_KEY = 'wm_failed_email_gmail_opened_v1';

export interface ManualEmailConfirmationRow {
  id: string;
  application_id: string | null;
  decision_status: string;
  server_delivery_id: string | null;
  recipient_name: string;
  recipient_email: string;
  department_slug: string | null;
  subject: string;
  body_text: string;
  confirmed_by_name: string | null;
  confirmed_by_email: string | null;
  attempt_count: number;
  sent_at: string;
}

export function loadLocalFailedEmails(): FailedEmailItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(FAILED_EMAILS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as FailedEmailItem[]) : [];
  } catch {
    return [];
  }
}

export function saveLocalFailedEmail(item: FailedEmailItem): void {
  if (typeof window === 'undefined') return;
  try {
    const cur = loadLocalFailedEmails().filter((i) => i.key !== item.key);
    cur.unshift(item);
    window.localStorage.setItem(FAILED_EMAILS_STORAGE_KEY, JSON.stringify(cur.slice(0, 100)));
  } catch {
    // Ignore storage quota errors
  }
}

export function removeLocalFailedEmail(keyOrAppId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const next = loadLocalFailedEmails().filter(
      (i) => i.key !== keyOrAppId && i.applicationId !== keyOrAppId
    );
    window.localStorage.setItem(FAILED_EMAILS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore
  }
}

export function getGmailOpenedMap(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(GMAIL_OPENED_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function markGmailOpenedLocally(key: string): Record<string, string> {
  const map = getGmailOpenedMap();
  map[key] = new Date().toISOString();
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(GMAIL_OPENED_STORAGE_KEY, JSON.stringify(map));
    } catch {
      // Ignore
    }
  }
  return map;
}

export function mergeAndDeduplicateFailedEmails(
  serverDeliveries: EmailDeliveryRecord[],
  manualConfirmations: ManualEmailConfirmationRow[],
  localItems: FailedEmailItem[],
  openedMap: Record<string, string> = {}
): FailedEmailItem[] {
  const sentKeys = new Set<string>();

  for (const d of serverDeliveries) {
    if (d.status === 'sent') {
      sentKeys.add(`id:${d.id}`);
      if (d.application_id) {
        sentKeys.add(`app:${d.application_id}|${d.template_key}`);
      }
      sentKeys.add(`email:${d.recipient_email.toLowerCase()}|${d.template_key}`);
    }
  }

  for (const m of manualConfirmations) {
    if (m.server_delivery_id) sentKeys.add(`id:${m.server_delivery_id}`);
    if (m.application_id) {
      sentKeys.add(`app:${m.application_id}|${m.decision_status}`);
      const tplAlias = m.decision_status === 'accepted' ? 'acceptance' : m.decision_status === 'rejected' ? 'rejection' : m.decision_status;
      sentKeys.add(`app:${m.application_id}|${tplAlias}`);
    }
    sentKeys.add(`email:${m.recipient_email.toLowerCase()}|${m.decision_status}`);
  }

  const deduped = new Map<string, FailedEmailItem>();

  for (const d of serverDeliveries) {
    if (d.status !== 'failed') continue;
    const isResolved =
      sentKeys.has(`id:${d.id}`) ||
      (d.application_id && sentKeys.has(`app:${d.application_id}|${d.template_key}`)) ||
      sentKeys.has(`email:${d.recipient_email.toLowerCase()}|${d.template_key}`);
    if (isResolved) continue;

    const key = d.application_id ? `${d.application_id}|${d.template_key}` : d.id;
    deduped.set(key, {
      key,
      deliveryId: d.id,
      applicationId: d.application_id,
      applicantType: d.applicant_type,
      recipientName: d.recipient_name,
      recipientEmail: d.recipient_email,
      departmentSlug: d.department_slug,
      emailType: d.template_key,
      subject: d.subject,
      bodyText: d.body_text,
      errorMessage: d.error_message || 'Delivery failed',
      attemptCount: d.attempt_count || 1,
      failedAt: d.created_at,
      gmailOpenedAt: openedMap[key] ?? null,
    });
  }

  for (const l of localItems) {
    const isResolved =
      (l.deliveryId && sentKeys.has(`id:${l.deliveryId}`)) ||
      (l.applicationId && sentKeys.has(`app:${l.applicationId}|${l.emailType}`)) ||
      sentKeys.has(`email:${l.recipientEmail.toLowerCase()}|${l.emailType}`);
    if (isResolved) continue;

    if (!deduped.has(l.key)) {
      deduped.set(l.key, {
        ...l,
        gmailOpenedAt: openedMap[l.key] ?? l.gmailOpenedAt ?? null,
      });
    }
  }

  return Array.from(deduped.values()).sort(
    (a, b) => Date.parse(b.failedAt) - Date.parse(a.failedAt)
  );
}

export function buildGmailComposeUrl(params: {
  to: string;
  subject: string;
  bodyText: string;
  signupUrl?: string;
}): string {
  const finalBody = params.signupUrl
    ? applySignupLinkToBody(params.bodyText, params.signupUrl)
    : params.bodyText;
  const u = new URL('https://mail.google.com/mail/');
  u.searchParams.set('view', 'cm');
  u.searchParams.set('fs', '1');
  u.searchParams.set('to', params.to);
  u.searchParams.set('su', params.subject);
  u.searchParams.set('body', finalBody);
  return u.toString();
}
