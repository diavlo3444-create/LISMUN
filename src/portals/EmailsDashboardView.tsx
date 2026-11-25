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
  MetricLedger,
  PortalPageHeader,
  ProportionalDistributionBar,
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
      <PortalPageHeader
        kicker="Communications & Dispatch"
        title="Email Dispatch & Communications Hub"
        subtitle="Resend transactional/bulk messaging, Shared Gmail OAuth2, editable templates, and Failed-to-Send recovery."
        actions={
          <button
            type="button"
            onClick={() => void loadDashboard()}
            className="portal-btn-secondary"
          >
            <RefreshCw className="h-3.5 w-3.5 shrink-0" />
            <span>Refresh</span>
          </button>
        }
      />

      {/* Underline Tab Rail */}
      <nav aria-label="Email Hub Sections" className="flex flex-wrap gap-1 border-b border-[#263D59]/60">
        {(
          [
            ['overview', 'Overview & Providers'],
            ['templates', `Templates (${templates.length})`],
            ['bulk', 'Bulk HR Send'],
            ['failed', `Failed-to-Send (${failedItems.length})`],
            ['history', `History (${deliveries.length + manualConfirmations.length})`],
          ] as Array<[SubTab, string]>
        ).map(([id, label]) => {
          const active = subTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setSubTab(id)}
              className={`border-b-2 px-4 py-2.5 font-mono text-[11px] tracking-[0.14em] uppercase whitespace-nowrap transition-colors ${
                active
                  ? 'border-[#D5BD8B] text-[#D5BD8B]'
                  : 'border-transparent text-[#E8E1D2]/55 hover:text-[#E8E1D2]'
              }`}
            >
              {label}
            </button>
          );
        })}
      </nav>

      {subTab === 'overview' && (
        <div className="portal-panel-enter space-y-6">
          <MetricLedger
            items={[
              { label: 'Delivered Emails', value: sentCount, accent: 'green' },
              { label: 'Manual Gmail Confirmations', value: manualConfirmations.length, accent: 'default' },
              { label: 'Failed Recovery Queue', value: failedItems.length, accent: failedItems.length > 0 ? 'red' : 'default' },
              {
                label: 'HR Ready To Send',
                value: (bulkPreview?.accepted.ready ?? 0) + (bulkPreview?.rejected.ready ?? 0),
                accent: 'gold',
              },
            ]}
          />

          <ProportionalDistributionBar
            title="Dispatch Channel Composition"
            segments={[
              { label: 'API Delivered', value: sentCount, color: '#86EFAC' },
              { label: 'Manual Gmail Confirmed', value: manualConfirmations.length, color: '#D5BD8B' },
              { label: 'Failed / Pending Recovery', value: failedItems.length, color: '#FCA5A5' },
            ]}
          />

          <div className="grid divide-y divide-[#263D59]/60 border border-[#263D59]/65 bg-[#050E1C]/80 md:grid-cols-2 md:divide-x md:divide-y-0">
            <div className="p-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-2xl text-[#F3EDE0]">Resend Bulk Provider</h3>
                <StatusLabel
                  status={resendConfigured ? 'Configured' : 'Secret Missing'}
                  tone={resendConfigured ? 'green' : 'amber'}
                />
              </div>
              <p className="mt-2.5 font-sans text-xs leading-relaxed text-[#E8E1D2]/65">
                Requires <code className="font-mono">RESEND_API_KEY</code> and{' '}
                <code className="font-mono">EMAIL_FROM</code> in project Secrets for automatic API dispatch.
              </p>
            </div>

            <div className="p-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-2xl text-[#F3EDE0]">Shared Gmail OAuth2</h3>
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
              <p className="mt-2.5 font-sans text-xs leading-relaxed text-[#E8E1D2]/65">
                Server-stored encrypted offline refresh token for Admin &amp; HR individual dispatch.
              </p>
              {isAdmin && (
                <div className="mt-4 flex gap-3">
                  {!gmailConnected ? (
                    <button
                      type="button"
                      disabled={!gmailOAuthConfigured}
                      onClick={() => void handleConnectGmail()}
                      className="portal-btn-primary disabled:opacity-45"
                    >
                      Connect Shared Gmail
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleDisconnectGmail()}
                      className="portal-btn-danger"
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
        <div className="portal-panel-enter grid gap-6 lg:grid-cols-12">
          <div className="divide-y divide-[#263D59]/50 border border-[#263D59]/65 bg-[#050E1C]/80 self-start lg:col-span-4">
            {templates.map((t) => {
              const selected = editingTplKey === t.template_key;
              return (
                <button
                  key={t.template_key}
                  type="button"
                  onClick={() => selectTemplate(t.template_key)}
                  className={`block w-full border-l-2 px-5 py-4 text-left transition-colors ${
                    selected
                      ? 'border-l-[#D5BD8B] bg-[#071426]'
                      : 'border-l-transparent hover:bg-[#071426]/45'
                  }`}
                >
                  <p className="font-mono text-[10px] tracking-[0.16em] text-[#B89A62] uppercase">
                    {t.template_key}
                  </p>
                  <p className="mt-1 font-sans text-sm font-medium text-[#F3EDE0]">{t.name}</p>
                </button>
              );
            })}
          </div>

          <form
            onSubmit={handleSaveTemplate}
            className="space-y-4 border border-[#263D59]/65 bg-[#050E1C]/80 p-6 lg:col-span-8"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#263D59]/50 pb-3">
              <p className="font-mono text-[10px] tracking-[0.16em] text-[#B89A62] uppercase">
                Supported placeholders: {'{name}'} {'{department}'} {'{institution}'} {'{signup_link}'}
              </p>
            </div>
            <div>
              <label className="block font-mono text-[10px] tracking-[0.16em] text-[#B89A62] uppercase">
                Subject Line
              </label>
              <input
                required
                value={tplSubject}
                onChange={(e) => setTplSubject(e.target.value)}
                className="portal-input mt-1.5"
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] tracking-[0.16em] text-[#B89A62] uppercase">
                Body Text
              </label>
              <textarea
                required
                rows={10}
                value={tplBody}
                onChange={(e) => setTplBody(e.target.value)}
                className="portal-textarea mt-1.5 font-mono text-xs leading-relaxed"
              />
            </div>
            <button type="submit" disabled={savingTpl} className="portal-btn-primary">
              {savingTpl ? 'Saving...' : 'Save Email Template'}
            </button>
          </form>
        </div>
      )}

      {subTab === 'bulk' && (
        <div className="portal-panel-enter space-y-5 border border-[#263D59]/65 bg-[#050E1C]/80 p-6">
          <div className="grid divide-y divide-[#263D59]/50 border border-[#263D59]/65 bg-[#030914] sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            {(['acceptance', 'rejection'] as const).map((k) => {
              const b = bulkPreview?.[k === 'acceptance' ? 'accepted' : 'rejected'];
              const active = bulkKey === k;
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
                  className={`border-b-2 px-5 py-4 text-left transition-colors ${
                    active
                      ? 'border-b-[#D5BD8B] bg-[#071426]/90'
                      : 'border-b-transparent hover:bg-[#071426]/40'
                  }`}
                >
                  <p className="font-mono text-xs tracking-[0.14em] text-[#D5BD8B] uppercase">
                    {k === 'acceptance' ? 'Accepted Cohort' : 'Rejected Cohort'}
                  </p>
                  {b && (
                    <p className="mt-1.5 font-mono text-[11px] tabular-nums text-[#E8E1D2]/70">
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
              className="portal-input"
            />
            <textarea
              rows={8}
              value={bulkBody}
              onChange={(e) => setBulkBody(e.target.value)}
              className="portal-textarea font-mono text-xs leading-relaxed"
            />
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#263D59]/50 pt-4">
              <p className="font-sans text-xs text-[#E8E1D2]/60">
                Deduplication guard skips applicants who already received this template. Failed recipients move to Failed-to-Send for Gmail fallback.
              </p>
              <button
                type="button"
                disabled={bulkSending}
                onClick={() => void handleBulkSend()}
                className="portal-btn-primary"
              >
                <Send className="h-3.5 w-3.5 shrink-0" />
                <span>{bulkSending ? 'Dispatching...' : 'Run Bulk Dispatch'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {subTab === 'failed' && (
        <div className="portal-panel-enter space-y-4">
          {failedItems.length === 0 ? (
            <EmptyState
              title="No Pending Failed Emails"
              description="All failed dispatches have been retried or manually confirmed via Gmail."
            />
          ) : (
            <div className="divide-y divide-[#263D59]/55 border border-[#DC2626]/40 bg-[#050E1C]/85">
              {failedItems.map((item) => {
                const preparedUrl = preparedGmailLinks[item.key];
                return (
                  <div key={item.key} className="flex flex-wrap items-start justify-between gap-4 p-5">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <AlertTriangle className="h-4 w-4 text-[#FCA5A5]" />
                        <p className="font-sans text-sm font-medium text-[#F3EDE0]">
                          {item.recipientName} &lt;{item.recipientEmail}&gt;
                        </p>
                        <StatusLabel status={item.emailType} tone="amber" />
                        {item.departmentSlug && (
                          <StatusLabel status={item.departmentSlug} tone="gold" />
                        )}
                      </div>
                      <p className="mt-1.5 font-mono text-xs text-[#FCA5A5]">{item.errorMessage}</p>
                      {item.gmailOpenedAt && (
                        <p className="mt-1 font-mono text-[10px] tabular-nums text-[#86EFAC]">
                          Gmail Draft Prepared: {new Date(item.gmailOpenedAt).toLocaleString()}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {item.deliveryId && (
                        <button
                          type="button"
                          onClick={() => void handleRetryDelivery(item)}
                          className="portal-btn-secondary py-1.5 text-[10px]"
                        >
                          Retry API
                        </button>
                      )}
                      {!preparedUrl ? (
                        <button
                          type="button"
                          onClick={() => void handlePrepareGmail(item)}
                          className="portal-btn-primary py-1.5 text-[10px]"
                        >
                          <Mail className="h-3.5 w-3.5 shrink-0" />
                          <span>Prepare Gmail Link</span>
                        </button>
                      ) : (
                        <a
                          href={preparedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="portal-btn-primary py-1.5 text-[10px]"
                        >
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                          <span>Open in Gmail</span>
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => setMarkSentTarget(item)}
                        className="inline-flex items-center gap-1.5 border border-[#16A34A]/65 bg-[#05140E] px-3 py-1.5 font-mono text-[10px] tracking-[0.13em] text-[#86EFAC] uppercase whitespace-nowrap shrink-0 hover:border-[#22C55E]"
                      >
                        <Check className="h-3.5 w-3.5 shrink-0" />
                        <span>Mark as Sent</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {subTab === 'history' && (
        <div className="portal-panel-enter overflow-x-auto border border-[#263D59]/65 bg-[#050E1C]/85">
          <table className="w-full text-left font-sans text-xs">
            <thead className="border-b border-[#263D59] bg-[#040B18] font-mono text-[10px] tracking-[0.16em] text-[#B89A62] uppercase">
              <tr>
                <th className="px-4 py-3">Recipient</th>
                <th className="px-4 py-3">Template</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Sent By</th>
                <th className="px-4 py-3 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#263D59]/45">
              {manualConfirmations.map((m) => (
                <tr key={`man-${m.id}`} className="transition-colors hover:bg-[#071426]/65">
                  <td className="px-4 py-3">
                    <p className="font-medium text-[#F3EDE0]">{m.recipient_name}</p>
                    <p className="font-mono text-[11px] text-[#E8E1D2]/55">{m.recipient_email}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] uppercase">{m.decision_status}</td>
                  <td className="px-4 py-3">
                    <StatusLabel status="Manual via Gmail" tone="gold" />
                  </td>
                  <td className="px-4 py-3">
                    <StatusLabel status="sent" tone="green" />
                  </td>
                  <td className="px-4 py-3 text-[#E8E1D2]/75">
                    {m.confirmed_by_name || m.confirmed_by_email}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[11px] tabular-nums text-[#E8E1D2]/60">
                    {new Date(m.sent_at).toLocaleString()}
                  </td>
                </tr>
              ))}
              {deliveries.map((d) => (
                <tr key={d.id} className="transition-colors hover:bg-[#071426]/65">
                  <td className="px-4 py-3">
                    <p className="font-medium text-[#F3EDE0]">{d.recipient_name}</p>
                    <p className="font-mono text-[11px] text-[#E8E1D2]/55">{d.recipient_email}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] uppercase">{d.template_key}</td>
                  <td className="px-4 py-3 font-mono text-[11px] uppercase">{d.delivery_method}</td>
                  <td className="px-4 py-3">
                    <StatusLabel status={d.status} />
                  </td>
                  <td className="px-4 py-3 text-[#E8E1D2]/75">{d.sent_by_name || 'System'}</td>
                  <td className="px-4 py-3 text-right font-mono text-[11px] tabular-nums text-[#E8E1D2]/60">
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
          className="fixed inset-0 z-[75] flex items-center justify-center bg-[#02060E]/88 p-4 backdrop-blur-sm"
        >
          <div className="portal-modal-enter w-full max-w-md border border-[#B89A62]/45 bg-[#061020] p-6 shadow-2xl shadow-black/60">
            <p className="font-mono text-[10px] tracking-[0.2em] text-[#B89A62] uppercase">
              Manual Dispatch Verification
            </p>
            <h3 className="mt-1.5 font-display text-2xl text-[#F3EDE0]">
              Confirm Manual Gmail Dispatch
            </h3>
            <p className="mt-2 font-sans text-xs leading-relaxed text-[#E8E1D2]/80">
              Confirm that you manually sent the email via Gmail to{' '}
              <strong>{markSentTarget.recipientName}</strong> ({markSentTarget.recipientEmail}).
            </p>
            <div className="mt-6 flex justify-end gap-3 border-t border-[#263D59]/60 pt-4">
              <button
                type="button"
                onClick={() => setMarkSentTarget(null)}
                className="portal-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={markingSent}
                onClick={() => void confirmMarkAsSent()}
                className="inline-flex items-center gap-1.5 border border-[#16A34A] bg-[#05140E] px-4 py-2 font-mono text-xs text-[#86EFAC] uppercase whitespace-nowrap hover:border-[#22C55E]"
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
