import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ExternalLink,
  Mail,
  RefreshCw,
  Send,
} from 'lucide-react';
import { apiRequest } from '../client/api';
import { useAuth } from '../client/AuthContext';
import {
  buildGmailComposeUrl,
  getGmailOpenedMap,
  loadLocalFailedEmails,
  type ManualEmailConfirmationRow,
  markGmailOpenedLocally,
  mergeAndDeduplicateFailedEmails,
  removeLocalFailedEmail,
} from '../client/failedEmailHelpers';
import {
  EmptyState,
  LoadingSkeleton,
  StatusLabel,
  useToast,
} from '../client/components/UiPrimitives';
import type {
  EmailDeliveryRecord,
  EmailTemplateRecord,
  FailedEmailItem,
} from '../shared/types';

type SubTab = 'overview' | 'templates' | 'bulk' | 'failed' | 'history';

export const EmailsDashboardView: React.FC = () => {
  const { effectiveActor } = useAuth();
  const { addToast } = useToast();

  const [subTab, setSubTab] = useState<SubTab>('overview');
  const [loading, setLoading] = useState(true);
  const [deliveries, setDeliveries] = useState<EmailDeliveryRecord[]>([]);
  const [manualConfirmations, setManualConfirmations] = useState<ManualEmailConfirmationRow[]>([]);
  const [templates, setTemplates] = useState<EmailTemplateRecord[]>([]);
  const [resendConfigured, setResendConfigured] = useState(false);
  const [gmailOAuthConfigured, setGmailOAuthConfigured] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);

  // Template editing state
  const [editingTplKey, setEditingTplKey] = useState<string>('acceptance');
  const [tplSubject, setTplSubject] = useState('');
  const [tplBody, setTplBody] = useState('');
  const [savingTpl, setSavingTpl] = useState(false);

  // Bulk HR state
  const [bulkKey, setBulkKey] = useState<'acceptance' | 'rejection'>('acceptance');
  const [bulkSubject, setBulkSubject] = useState('');
  const [bulkBody, setBulkBody] = useState('');
  const [bulkPreview, setBulkPreview] = useState<{
    accepted: { total: number; alreadyHandled: number; missingEmail: number; ready: number };
    rejected: { total: number; alreadyHandled: number; missingEmail: number; ready: number };
  } | null>(null);
  const [bulkSending, setBulkSending] = useState(false);

  // Failed-to-send / Gmail compose preparation
  const [gmailOpenedMap, setGmailOpenedMap] = useState<Record<string, string>>(() =>
    getGmailOpenedMap()
  );
  const [preparedGmailLinks, setPreparedGmailLinks] = useState<Record<string, string>>({});
  const [markSentTarget, setMarkSentTarget] = useState<FailedEmailItem | null>(null);
  const [markingSent, setMarkingSent] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [dash, prev] = await Promise.all([
        apiRequest<{
          deliveries: EmailDeliveryRecord[];
          manualConfirmations: ManualEmailConfirmationRow[];
          templates: EmailTemplateRecord[];
          resendConfigured: boolean;
          gmailOAuthConfigured: boolean;
          gmailConnected: boolean;
        }>('/api/emails/dashboard'),
        apiRequest<{
          accepted: { total: number; alreadyHandled: number; missingEmail: number; ready: number };
          rejected: { total: number; alreadyHandled: number; missingEmail: number; ready: number };
        }>('/api/emails/hr-bulk/preview', { method: 'POST' }),
      ]);
      setDeliveries(dash.deliveries || []);
      setManualConfirmations(dash.manualConfirmations || []);
      setTemplates(dash.templates || []);
      setResendConfigured(dash.resendConfigured);
      setGmailOAuthConfigured(dash.gmailOAuthConfigured);
      setGmailConnected(dash.gmailConnected);
      setBulkPreview(prev);

      const firstTpl =
        dash.templates?.find((t) => t.template_key === editingTplKey) || dash.templates?.[0];
      if (firstTpl) {
        setEditingTplKey(firstTpl.template_key);
        setTplSubject(firstTpl.subject);
        setTplBody(firstTpl.body_text);
      }

      const bulkTpl = dash.templates?.find((t) => t.template_key === bulkKey);
      if (bulkTpl && !bulkSubject) {
        setBulkSubject(bulkTpl.subject);
        setBulkBody(bulkTpl.body_text);
      }
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Unable to load email dashboard.', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, bulkKey, bulkSubject, editingTplKey]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const selectTemplate = (key: string) => {
    setEditingTplKey(key);
    const tpl = templates.find((t) => t.template_key === key);
    if (tpl) {
      setTplSubject(tpl.subject);
      setTplBody(tpl.body_text);
    }
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTpl(true);
    try {
      await apiRequest(`/api/emails/templates/${encodeURIComponent(editingTplKey)}`, {
        method: 'PUT',
        body: { subject: tplSubject, body_text: tplBody },
      });
      addToast(`Saved "${editingTplKey}" template.`, 'success');
      await loadDashboard();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Save failed.', 'error');
    } finally {
      setSavingTpl(false);
    }
  };

  const handleBulkSend = async () => {
    setBulkSending(true);
    try {
      const res = await apiRequest<{ sent: number; failed: number; skipped: number }>(
        '/api/emails/hr-bulk/send',
        {
          method: 'POST',
          body: {
            template_key: bulkKey,
            subject: bulkSubject,
            body_text: bulkBody,
          },
        }
      );
      addToast(
        `Bulk dispatch finished: ${res.sent} sent, ${res.failed} failed, ${res.skipped} skipped.`,
        res.failed > 0 ? 'error' : 'success'
      );
      await loadDashboard();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Bulk send failed.', 'error');
    } finally {
      setBulkSending(false);
    }
  };

  const handleRetryDelivery = async (item: FailedEmailItem) => {
    if (!item.deliveryId) {
      addToast('Local draft item cannot be retried via server ID; use Gmail compose.', 'info');
      return;
    }
    try {
      const res = await apiRequest<{ ok: boolean }>(`/api/emails/retry/${item.deliveryId}`, {
        method: 'POST',
      });
      if (res.ok) {
        removeLocalFailedEmail(item.key);
        addToast(`Re-sent email to ${item.recipientEmail}.`, 'success');
      }
      await loadDashboard();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Retry failed.', 'error');
      await loadDashboard();
    }
  };

  const handlePrepareGmail = async (item: FailedEmailItem) => {
    let signupUrl = '';
    if (
      item.applicationId &&
      (item.emailType === 'acceptance' || item.emailType === 'accepted') &&
      !['delegate', 'chair'].includes(item.applicantType)
    ) {
      try {
        const inv = await apiRequest<{ inviteUrl?: string }>('/api/invites/hr/create', {
          method: 'POST',
          body: { application_id: item.applicationId },
        });
        if (inv.inviteUrl) {
          signupUrl = `${window.location.origin}${inv.inviteUrl}`;
        }
      } catch {
        // Proceed without invite URL if non-accepted or already claimed
      }
    }

    const url = buildGmailComposeUrl({
      to: item.recipientEmail,
      subject: item.subject,
      bodyText: item.bodyText,
      signupUrl,
    });
    setPreparedGmailLinks((prev) => ({ ...prev, [item.key]: url }));
    setGmailOpenedMap(markGmailOpenedLocally(item.key));
  };

  const confirmMarkAsSent = async () => {
    if (!markSentTarget) return;
    setMarkingSent(true);
    try {
      await apiRequest('/api/emails/mark-sent', {
        method: 'POST',
        body: {
          application_id: markSentTarget.applicationId || markSentTarget.key,
          decision_status: markSentTarget.emailType,
          server_delivery_id: markSentTarget.deliveryId,
          recipient_name: markSentTarget.recipientName,
          recipient_email: markSentTarget.recipientEmail,
          department_slug: markSentTarget.departmentSlug,
          subject: markSentTarget.subject,
          body_text: markSentTarget.bodyText,
        },
      });
      removeLocalFailedEmail(markSentTarget.key);
      addToast(`Confirmed manual Gmail dispatch for ${markSentTarget.recipientName}.`, 'success');
      setMarkSentTarget(null);
      await loadDashboard();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to confirm.', 'error');
    } finally {
      setMarkingSent(false);
    }
  };

  const handleConnectGmail = async () => {
    try {
      const res = await apiRequest<{ authUrl: string }>('/api/emails/gmail/start', {
        method: 'POST',
      });
      window.location.assign(res.authUrl);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Unable to start Gmail OAuth2.', 'error');
    }
  };

  const handleDisconnectGmail = async () => {
    try {
      await apiRequest('/api/emails/gmail/disconnect', { method: 'POST' });
      addToast('Shared Gmail OAuth2 disconnected.', 'info');
      await loadDashboard();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Disconnect failed.', 'error');
    }
  };

  const failedItems = mergeAndDeduplicateFailedEmails(
    deliveries,
    manualConfirmations,
    loadLocalFailedEmails(),
    gmailOpenedMap
  );

  const sentCount = deliveries.filter((d) => d.status === 'sent').length;
  const isAdmin = effectiveActor?.role === 'super_admin' || effectiveActor?.role === 'admin';

  if (loading) return <LoadingSkeleton rows={5} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#263D59]/70 pb-4">
        <div>
          <h2 className="font-display text-3xl text-[#E8E1D2]">
            Email Dispatch &amp; Communications Hub
          </h2>
          <p className="mt-1 font-sans text-xs text-[#E8E1D2]/65">
            Resend transactional/bulk messaging, Shared Gmail OAuth2, Templates, and Failed-to-Send recovery.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadDashboard()}
          className="inline-flex items-center gap-1.5 border border-[#263D59] bg-[#071426] px-3 py-2 font-mono text-xs text-[#D5BD8B] uppercase"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-1 border-b border-[#263D59]/60 pb-2">
        {(
          [
            ['overview', 'Overview & Providers'],
            ['templates', `Templates (${templates.length})`],
            ['bulk', 'Bulk HR Send'],
            ['failed', `Failed-to-Send (${failedItems.length})`],
            ['history', `History (${deliveries.length + manualConfirmations.length})`],
          ] as Array<[SubTab, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSubTab(id)}
            className={`px-3.5 py-2 font-mono text-[11px] tracking-[0.14em] uppercase transition-colors ${
              subTab === id
                ? 'border border-[#B89A62] bg-[#071426] text-[#D5BD8B]'
                : 'text-[#E8E1D2]/65 hover:text-[#E8E1D2]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {subTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="border border-[#263D59]/80 bg-[#071426] p-5">
              <p className="font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                Delivered Emails
              </p>
              <p className="mt-2 font-display text-3xl tabular-nums text-[#E8E1D2]">
                {sentCount}
              </p>
            </div>
            <div className="border border-[#263D59]/80 bg-[#071426] p-5">
              <p className="font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                Manual Gmail Confirmations
              </p>
              <p className="mt-2 font-display text-3xl tabular-nums text-[#E8E1D2]">
                {manualConfirmations.length}
              </p>
            </div>
            <div className="border border-[#263D59]/80 bg-[#071426] p-5">
              <p className="font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                Failed Queue
              </p>
              <p className="mt-2 font-display text-3xl tabular-nums text-[#FCA5A5]">
                {failedItems.length}
              </p>
            </div>
            <div className="border border-[#263D59]/80 bg-[#071426] p-5">
              <p className="font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                HR Ready To Send
              </p>
              <p className="mt-2 font-display text-3xl tabular-nums text-[#D5BD8B]">
                {(bulkPreview?.accepted.ready ?? 0) + (bulkPreview?.rejected.ready ?? 0)}
              </p>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="border border-[#263D59]/80 bg-[#071426] p-6">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-2xl text-[#E8E1D2]">Resend Bulk Provider</h3>
                <StatusLabel
                  status={resendConfigured ? 'Configured' : 'Secret Missing'}
                  tone={resendConfigured ? 'green' : 'amber'}
                />
              </div>
              <p className="mt-2 font-sans text-xs leading-relaxed text-[#E8E1D2]/70">
                Requires <code className="font-mono">RESEND_API_KEY</code> and{' '}
                <code className="font-mono">EMAIL_FROM</code> in project Secrets for automatic API dispatch.
              </p>
            </div>

            <div className="border border-[#263D59]/80 bg-[#071426] p-6">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-2xl text-[#E8E1D2]">Shared Gmail OAuth2</h3>
                <StatusLabel
                  status={
                    gmailConnected
                      ? 'Connected'
                      : gmailOAuthConfigured
                      ? 'Ready to Connect'
                      : 'OAuth Unconfigured'
                  }
                  tone={gmailConnected ? 'green' : 'gold'}
                />
              </div>
              <p className="mt-2 font-sans text-xs leading-relaxed text-[#E8E1D2]/70">
                Server-stored encrypted offline refresh token for Admin &amp; HR individual dispatch.
              </p>
              {isAdmin && (
                <div className="mt-4 flex gap-3">
                  {!gmailConnected ? (
                    <button
                      type="button"
                      disabled={!gmailOAuthConfigured}
                      onClick={() => void handleConnectGmail()}
                      className="border border-[#B89A62] bg-[#030914] px-4 py-2 font-mono text-xs text-[#D5BD8B] uppercase disabled:opacity-45"
                    >
                      Connect Shared Gmail
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleDisconnectGmail()}
                      className="border border-[#DC2626]/60 bg-[#1B0B10] px-4 py-2 font-mono text-xs text-[#FCA5A5] uppercase"
                    >
                      Disconnect Gmail
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {subTab === 'templates' && (
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="space-y-2 lg:col-span-4">
            {templates.map((t) => (
              <button
                key={t.template_key}
                type="button"
                onClick={() => selectTemplate(t.template_key)}
                className={`w-full border p-4 text-left ${
                  editingTplKey === t.template_key
                    ? 'border-[#B89A62] bg-[#071426]'
                    : 'border-[#263D59]/70 bg-[#040B18]'
                }`}
              >
                <p className="font-mono text-[10px] tracking-[0.16em] text-[#B89A62] uppercase">
                  {t.template_key}
                </p>
                <p className="mt-1 font-sans text-sm font-medium text-[#E8E1D2]">{t.name}</p>
              </button>
            ))}
          </div>

          <form
            onSubmit={handleSaveTemplate}
            className="space-y-4 border border-[#263D59]/80 bg-[#071426] p-6 lg:col-span-8"
          >
            <p className="font-mono text-[10px] tracking-[0.16em] text-[#B89A62] uppercase">
              Supported placeholders: {'{name}'} {'{department}'} {'{institution}'} {'{signup_link}'}
            </p>
            <div>
              <label className="block font-mono text-[10px] tracking-[0.16em] text-[#B89A62] uppercase">
                Subject Line
              </label>
              <input
                required
                value={tplSubject}
                onChange={(e) => setTplSubject(e.target.value)}
                className="mt-1.5 w-full border border-[#263D59] bg-[#030914] px-3 py-2 text-sm text-[#E8E1D2]"
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] tracking-[0.16em] text-[#B89A62] uppercase">
                Body Text
              </label>
              <textarea
                required
                rows={9}
                value={tplBody}
                onChange={(e) => setTplBody(e.target.value)}
                className="mt-1.5 w-full border border-[#263D59] bg-[#030914] px-3 py-2 font-mono text-xs text-[#E8E1D2]"
              />
            </div>
            <button
              type="submit"
              disabled={savingTpl}
              className="border border-[#B89A62] bg-[#030914] px-5 py-2.5 font-mono text-xs text-[#D5BD8B] uppercase"
            >
              {savingTpl ? 'Saving...' : 'Save Email Template'}
            </button>
          </form>
        </div>
      )}

      {subTab === 'bulk' && (
        <div className="space-y-5 border border-[#263D59]/80 bg-[#071426] p-6">
          <div className="flex flex-wrap gap-3">
            {(['acceptance', 'rejection'] as const).map((k) => {
              const b = bulkPreview?.[k === 'acceptance' ? 'accepted' : 'rejected'];
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setBulkKey(k);
                    const tpl = templates.find((t) => t.template_key === k);
                    if (tpl) {
                      setBulkSubject(tpl.subject);
                      setBulkBody(tpl.body_text);
                    }
                  }}
                  className={`border px-4 py-3 text-left ${
                    bulkKey === k ? 'border-[#D5BD8B] bg-[#030914]' : 'border-[#263D59]'
                  }`}
                >
                  <p className="font-mono text-xs text-[#D5BD8B] uppercase">
                    {k === 'acceptance' ? 'Accepted Cohort' : 'Rejected Cohort'}
                  </p>
                  {b && (
                    <p className="mt-1 font-mono text-[11px] tabular-nums text-[#E8E1D2]/70">
                      Ready: {b.ready} · Sent/Queued: {b.alreadyHandled} · Invalid Email: {b.missingEmail}
                    </p>
                  )}
                </button>
              );
            })}
          </div>

          <div className="space-y-4">
            <input
              value={bulkSubject}
              onChange={(e) => setBulkSubject(e.target.value)}
              placeholder="Bulk Email Subject"
              className="w-full border border-[#263D59] bg-[#030914] px-3 py-2 text-sm text-[#E8E1D2]"
            />
            <textarea
              rows={8}
              value={bulkBody}
              onChange={(e) => setBulkBody(e.target.value)}
              className="w-full border border-[#263D59] bg-[#030914] px-3 py-2 font-mono text-xs text-[#E8E1D2]"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-sans text-xs text-[#E8E1D2]/65">
                Deduplication guard skips applicants who already received this template. Failed recipients appear in Failed-to-Send for Gmail fallback.
              </p>
              <button
                type="button"
                disabled={bulkSending}
                onClick={() => void handleBulkSend()}
                className="inline-flex items-center gap-2 border border-[#B89A62] bg-[#030914] px-5 py-2.5 font-mono text-xs text-[#D5BD8B] uppercase"
              >
                <Send className="h-3.5 w-3.5" />
                <span>{bulkSending ? 'Dispatching...' : 'Run Bulk Dispatch'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {subTab === 'failed' && (
        <div className="space-y-4">
          {failedItems.length === 0 ? (
            <EmptyState
              title="No Pending Failed Emails"
              description="All failed dispatches have been retried or manually confirmed via Gmail."
            />
          ) : (
            failedItems.map((item) => {
              const preparedUrl = preparedGmailLinks[item.key];
              return (
                <div
                  key={item.key}
                  className="border border-[#DC2626]/45 bg-[#071426] p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-[#FCA5A5]" />
                        <p className="font-sans text-sm font-medium text-[#E8E1D2]">
                          {item.recipientName} &lt;{item.recipientEmail}&gt;
                        </p>
                        <StatusLabel status={item.emailType} tone="amber" />
                        {item.departmentSlug && (
                          <StatusLabel status={item.departmentSlug} tone="gold" />
                        )}
                      </div>
                      <p className="mt-1 font-mono text-xs text-[#FCA5A5]">{item.errorMessage}</p>
                      {item.gmailOpenedAt && (
                        <p className="mt-1 font-mono text-[10px] text-[#86EFAC]">
                          Gmail Draft Prepared: {new Date(item.gmailOpenedAt).toLocaleString()}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {item.deliveryId && (
                        <button
                          type="button"
                          onClick={() => void handleRetryDelivery(item)}
                          className="border border-[#263D59] bg-[#030914] px-3 py-1.5 font-mono text-[11px] text-[#E8E1D2] uppercase"
                        >
                          Retry API
                        </button>
                      )}
                      {!preparedUrl ? (
                        <button
                          type="button"
                          onClick={() => void handlePrepareGmail(item)}
                          className="inline-flex items-center gap-1.5 border border-[#B89A62] bg-[#030914] px-3 py-1.5 font-mono text-[11px] text-[#D5BD8B] uppercase"
                        >
                          <Mail className="h-3.5 w-3.5" />
                          <span>Prepare Gmail Link</span>
                        </button>
                      ) : (
                        <a
                          href={preparedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 border border-[#D5BD8B] bg-[#030914] px-3 py-1.5 font-mono text-[11px] text-[#D5BD8B] uppercase"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span>Open in Gmail</span>
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => setMarkSentTarget(item)}
                        className="inline-flex items-center gap-1.5 border border-[#16A34A]/70 bg-[#081A12] px-3 py-1.5 font-mono text-[11px] text-[#86EFAC] uppercase"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>Mark as Sent</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {subTab === 'history' && (
        <div className="overflow-x-auto border border-[#263D59]/80 bg-[#071426]">
          <table className="w-full text-left font-sans text-xs">
            <thead className="border-b border-[#263D59] bg-[#040B18] font-mono text-[10px] tracking-[0.16em] text-[#B89A62] uppercase">
              <tr>
                <th className="p-3">Recipient</th>
                <th className="p-3">Template</th>
                <th className="p-3">Method</th>
                <th className="p-3">Status</th>
                <th className="p-3">Sent By</th>
                <th className="p-3">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#263D59]/50">
              {manualConfirmations.map((m) => (
                <tr key={`man-${m.id}`}>
                  <td className="p-3">
                    <p className="font-medium text-[#E8E1D2]">{m.recipient_name}</p>
                    <p className="font-mono text-[11px] text-[#E8E1D2]/60">{m.recipient_email}</p>
                  </td>
                  <td className="p-3 font-mono text-[11px] uppercase">{m.decision_status}</td>
                  <td className="p-3">
                    <StatusLabel status="Manual via Gmail" tone="gold" />
                  </td>
                  <td className="p-3">
                    <StatusLabel status="sent" tone="green" />
                  </td>
                  <td className="p-3 text-[#E8E1D2]/75">{m.confirmed_by_name || m.confirmed_by_email}</td>
                  <td className="p-3 font-mono text-[11px] tabular-nums text-[#E8E1D2]/65">
                    {new Date(m.sent_at).toLocaleString()}
                  </td>
                </tr>
              ))}
              {deliveries.map((d) => (
                <tr key={d.id}>
                  <td className="p-3">
                    <p className="font-medium text-[#E8E1D2]">{d.recipient_name}</p>
                    <p className="font-mono text-[11px] text-[#E8E1D2]/60">{d.recipient_email}</p>
                  </td>
                  <td className="p-3 font-mono text-[11px] uppercase">{d.template_key}</td>
                  <td className="p-3 font-mono text-[11px] uppercase">{d.delivery_method}</td>
                  <td className="p-3">
                    <StatusLabel status={d.status} />
                  </td>
                  <td className="p-3 text-[#E8E1D2]/75">{d.sent_by_name || 'System'}</td>
                  <td className="p-3 font-mono text-[11px] tabular-nums text-[#E8E1D2]/65">
                    {new Date(d.sent_at || d.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {markSentTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[75] flex items-center justify-center bg-[#030914]/90 p-4"
        >
          <div className="w-full max-w-md border border-[#B89A62]/60 bg-[#071426] p-6">
            <h3 className="font-display text-2xl text-[#E8E1D2]">Confirm Manual Gmail Dispatch</h3>
            <p className="mt-2 font-sans text-xs text-[#E8E1D2]/80">
              Confirm that you manually sent the email via Gmail to{' '}
              <strong>{markSentTarget.recipientName}</strong> ({markSentTarget.recipientEmail}).
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setMarkSentTarget(null)}
                className="border border-[#263D59] px-4 py-2 font-mono text-xs text-[#E8E1D2]/75 uppercase"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={markingSent}
                onClick={() => void confirmMarkAsSent()}
                className="border border-[#16A34A] bg-[#081A12] px-4 py-2 font-mono text-xs text-[#86EFAC] uppercase"
              >
                {markingSent ? 'Confirming...' : 'Confirm Sent'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
