import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {

  Building2,
  ClipboardCheck,
  FileText,
  Mail,
  MessageSquare,
  QrCode,
  Shield,
  Users,
} from 'lucide-react';
import { apiRequest } from '../client/api';
import { useAuth } from '../client/AuthContext';
import { DashboardShell, type ShellNavItem } from '../client/components/DashboardShell';
import {
  EmptyState,
  LoadingSkeleton,
  MetricLedger,
  PortalPageHeader,
  ProportionalDistributionBar,
  StatusLabel,
  useToast,
} from '../client/components/UiPrimitives';
import { EmailsDashboardView } from './EmailsDashboardView';
import {
  CommitteesManagerView,
  InquiriesManagerView,

  SponsorsManagerView,
} from './OperationalHubComponents';
import { DepartmentQrSectionView, LiveQrScannerWorkspace, MyQrPassView } from './ScannerAndPassPages';
import { formatApplicationAnswersForReview } from '../shared/intake';
import { canonicalDepartmentForStorage, hasPermission } from '../shared/permissions';
import type { ConferenceApplication } from '../shared/types';

function getDepartmentBrief(deptSlug: string): { kicker: string; subtitle: string } {
  if (deptSlug === 'security') {
    return {
      kicker: 'Security & Protocol Directorate',
      subtitle:
        'High-contrast gate operations, screening of security personnel applicants, shift deployments, and live QR credential checkpoints.',
    };
  }
  if (deptSlug === 'hr') {
    return {
      kicker: 'Human Resources Directorate',
      subtitle:
        'Manage accepted personnel rosters, issue non-expiring onboarding links, dispatch bulk communications, and resolve inquiries.',
    };
  }
  if (deptSlug === 'media_press') {
    return {
      kicker: 'Media & Press Directorate',
      subtitle:
        'Editorial production coordination, portfolio-backed Stage 1 screening, shift coverage, and press pass distribution.',
    };
  }
  if (deptSlug === 'volunteers') {
    return {
      kicker: 'Volunteers & Floor Logistics',
      subtitle:
        'Coordinate runner squads, Stage 1 screening, floor shift rotations, and division credential oversight.',
    };
  }
  if (deptSlug === 'pr') {
    return {
      kicker: 'Public Relations Directorate',
      subtitle:
        'Govern institutional sponsors, partner visibility tiers, and external outreach records.',
    };
  }
  if (deptSlug === 'dcc') {
    return {
      kicker: 'Delegate & Chair Councils',
      subtitle:
        'Review Delegate and Chair cohorts, govern council availability, and publish committees to the Living Atlas.',
    };
  }
  return {
    kicker: 'Department Directorate',
    subtitle: 'Scoped operations, team roster coordination, and departmental milestones.',
  };
}

export const HeadPortal: React.FC = () => {
  const { effectiveActor, departments } = useAuth();
  const { addToast } = useToast();

  const deptSlug = canonicalDepartmentForStorage(effectiveActor?.department_slug);
  const isOperational = ['volunteers', 'media_press', 'security'].includes(deptSlug);
  const isHr = deptSlug === 'hr';
  const isPr = deptSlug === 'pr';
  const isDcc = deptSlug === 'dcc';
  const isCoHead = effectiveActor?.eb_rank === 'co_head';
  const canScan = deptSlug === 'security' || hasPermission(effectiveActor, 'qr.scan', departments);

  const [activeTab, setActiveTab] = useState(isCoHead ? 'my_qr' : 'registrations');
  const [apps, setApps] = useState<ConferenceApplication[]>([]);
  const [applicantStatusTab, setApplicantStatusTab] = useState<'pending' | 'accepted' | 'rejected' | 'waitlisted'>('pending');
  const [headNotes, setHeadNotes] = useState<Record<string, string>>({});
  const [issuedUrls, setIssuedUrls] = useState<Record<string, string>>({});
  const [certPreview, setCertPreview] = useState<{
    fileName: string;
    mimeType: string;
    url: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const loadApps = useCallback(async () => {
    setLoading(true);
    try {
      const q = isHr ? '?scope=hr_roster' : '';
      const res = await apiRequest<{ applications: ConferenceApplication[] }>(
        `/api/applications${q}`
      );
      setApps(res.applications || []);
    } catch {
      setApps([]);
    } finally {
      setLoading(false);
    }
  }, [isHr]);

  useEffect(() => {
    void loadApps();
  }, [loadApps]);

  const navItems: ShellNavItem[] = isCoHead
    ? [{ id: 'my_qr', label: 'My QR Code', group: 'Credential', icon: QrCode }]
    : [
        { id: 'registrations', label: 'Applications & Decisions', group: 'Department', icon: ClipboardCheck },
        { id: 'dept_qr', label: 'My Department QR Codes', group: 'Department', icon: QrCode },
        ...(canScan && deptSlug === 'security'
          ? [{ id: 'scanner', label: 'QR Scanner', group: 'Security', icon: Shield }]
          : []),
      ];

  const handleRecommend = async (appId: string, rec: 'recommend_accept' | 'recommend_reject') => {
    try {
      await apiRequest(`/api/applications/${appId}/recommend`, {
        method: 'POST',
        body: { head_recommendation: rec, head_notes: headNotes[appId] || '' },
      });
      addToast('Recommendation submitted to Secretariat.', 'success');
      await loadApps();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Unable to submit recommendation.', 'error');
    }
  };

  const handleHrInvite = async (appId: string) => {
    try {
      const res = await apiRequest<{ inviteUrl: string }>('/api/invites/hr/create', {
        method: 'POST',
        body: { application_id: appId },
      });
      setIssuedUrls((p) => ({ ...p, [appId]: `${window.location.origin}${res.inviteUrl}` }));
      addToast('Non-expiring personal signup link created.', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Invite creation failed.', 'error');
    }
  };

  const brief = getDepartmentBrief(deptSlug);
  const recAcceptCount = apps.filter((a) => a.head_recommendation === 'recommend_accept').length;
  const recRejectCount = apps.filter((a) => a.head_recommendation === 'recommend_reject').length;
  const unreviewedCount = apps.length - recAcceptCount - recRejectCount;
  const statusTabs = [
    { id: 'pending' as const, label: 'Pending', count: apps.filter((a) => ['pending', 'received', 'under_review'].includes(a.status)).length },
    { id: 'accepted' as const, label: 'Accepted', count: apps.filter((a) => a.status === 'accepted').length },
    { id: 'rejected' as const, label: 'Rejected', count: apps.filter((a) => a.status === 'rejected').length },
    { id: 'waitlisted' as const, label: 'Waitlisted', count: apps.filter((a) => a.status === 'waitlisted').length },
  ];
  const headFilteredApps = apps.filter((a) => applicantStatusTab === 'pending'
    ? ['pending', 'received', 'under_review'].includes(a.status)
    : a.status === applicantStatusTab);

  return (
    <DashboardShell
      portalLabel={`${deptSlug.toUpperCase()} Head Portal`}
      breadcrumbSection={navItems.find((n) => n.id === activeTab)?.label || 'Overview'}
      departmentTheme={deptSlug}
      navItems={navItems}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
    >
      {activeTab === 'my_qr' && isCoHead && <MyQrPassView />}

      {!isCoHead && activeTab === 'overview' && (
        <div className="space-y-6">
          <PortalPageHeader
            kicker={`${brief.kicker} · Scoped to ${deptSlug}${effectiveActor?.gender ? ` (${effectiveActor.gender})` : ''}`}
            title={
              effectiveActor?.department_name ||
              brief.kicker
            }
            subtitle={brief.subtitle}
          />

          <MetricLedger
            items={[
              { label: 'Scoped Queue', value: apps.length, accent: 'gold', detail: isHr ? 'Secretariat-accepted roster' : 'Records within active scope' },
              { label: 'Confidential Medical Isolation', value: 'Active', accent: 'green', detail: 'Medical fields stripped server-side' },
              { label: 'Division Binding', value: effectiveActor?.gender ? `${effectiveActor.gender} division` : 'Unified', accent: 'default', detail: `Department: ${deptSlug}` },
            ]}
          />

          {isOperational && (
            <ProportionalDistributionBar
              title="Stage 1 Screening Progress"
              segments={[
                { label: 'Recommended Accept', value: recAcceptCount, color: '#86EFAC' },
                { label: 'Recommended Reject', value: recRejectCount, color: '#FCA5A5' },
                { label: 'Awaiting Head Screening', value: Math.max(0, unreviewedCount), color: '#D5BD8B' },
              ]}
            />
          )}

          {isDcc && (
            <ProportionalDistributionBar
              title="Delegate & Chair Cohort Status"
              segments={[
                { label: 'Accepted', value: apps.filter((a) => a.status === 'accepted').length, color: '#86EFAC' },
                { label: 'Pending Review', value: apps.filter((a) => ['pending', 'received', 'under_review'].includes(a.status)).length, color: '#FCD34D' },
                { label: 'Waitlisted', value: apps.filter((a) => a.status === 'waitlisted').length, color: '#D5BD8B' },
                { label: 'Rejected', value: apps.filter((a) => a.status === 'rejected').length, color: '#FCA5A5' },
              ]}
            />
          )}
        </div>
      )}

      {!isCoHead && activeTab === 'registrations' && (
        <div className="space-y-6">
          <PortalPageHeader
            kicker="Stage 1 Departmental Screening"
            title="Pending Applicant Screening"
            subtitle="Showing pending applications within your scope only. Final admission status and medical disclosures are isolated to Secretariat Admins."
          />

          <div className="flex flex-wrap gap-2 border-b border-[#263D59]/50 pb-3">
            {statusTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setApplicantStatusTab(tab.id)}
                className={`border px-4 py-2 font-mono text-[10px] tracking-[0.12em] uppercase transition-colors ${applicantStatusTab === tab.id ? 'border-[#D5BD8B] bg-[#D5BD8B]/10 text-[#F3EDE0]' : 'border-[#263D59] text-[#B9C6D8] hover:border-[#8CA2BD]'}`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
          {loading ? (
            <LoadingSkeleton rows={4} />
          ) : headFilteredApps.length === 0 ? (
            <EmptyState
              title={`No ${applicantStatusTab} Applicants`}
              description={`There are currently no ${applicantStatusTab} applications in your department and section.`}
            />
          ) : (
            <div className="divide-y divide-[#263D59]/60 border border-[#263D59]/65 bg-[#050E1C]/85">
              {headFilteredApps.map((a) => (
                <div key={a.id} className="space-y-4 p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-2xl text-[#F3EDE0]">{a.applicant_name}</p>
                      <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[#D5BD8B]">
                        {a.application_code} · {a.email} · {a.institution}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StatusLabel status={a.status} />
                      <StatusLabel status={a.head_recommendation || 'Needs Stage 1 Review'} />
                    </div>
                  </div>
                  {['accepted', 'rejected', 'waitlisted'].includes(a.status) && (
                    <div className="border border-[#263D59]/45 bg-[#030914]/70 px-3 py-2 font-mono text-[10px] text-[#B9C6D8]">
                      <span className="text-[#B89A62]">ADMIN DECISION:</span> {a.status.toUpperCase()}
                      {a.decision_by_name ? ` · BY ${a.decision_by_name}` : ''}
                      {a.decision_at ? ` · ${new Date(a.decision_at).toLocaleString()}` : ''}
                      {a.admin_decision_notes ? <p className="mt-1 whitespace-pre-wrap font-sans text-xs">{a.admin_decision_notes}</p> : null}
                    </div>
                  )}

                  <div className="grid gap-3 border border-[#263D59]/50 bg-[#030914]/80 p-3.5 text-xs sm:grid-cols-2">
                    <div className="space-y-1">
                      <p>
                        <span className="font-mono text-[10px] text-[#B89A62] uppercase">Gender: </span>
                        <span className="capitalize">{a.gender || 'N/A'}</span>
                      </p>
                      <p>
                        <span className="font-mono text-[10px] text-[#B89A62] uppercase">Birth Date / Age: </span>
                        <span className="font-mono">
                          {a.birth_date ? String(a.birth_date).slice(0, 10) : 'N/A'}
                          {a.age ? ` (${a.age})` : ''}
                        </span>
                      </p>
                      <p>
                        <span className="font-mono text-[10px] text-[#B89A62] uppercase">Grade: </span>
                        {a.grade_or_year || 'N/A'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p>
                        <span className="font-mono text-[10px] text-[#B89A62] uppercase">Phone: </span>
                        <span className="font-mono">{a.phone || 'N/A'}</span>
                      </p>
                      <p>
                        <span className="font-mono text-[10px] text-[#B89A62] uppercase">Emergency Contact: </span>
                        {a.emergency_phone || 'N/A'}
                      </p>
                      <p>
                        <span className="font-mono text-[10px] text-[#B89A62] uppercase">Role: </span>
                        {a.position || a.application_type}
                      </p>
                    </div>
                  </div>

                  {a.experience && (
                    <div className="border border-[#263D59]/50 bg-[#030914]/80 p-3.5 font-sans text-xs">
                      <p className="font-mono text-[10px] tracking-[0.14em] text-[#B89A62] uppercase">
                        Previous Experiences
                      </p>
                      <p className="mt-1 whitespace-pre-wrap leading-relaxed text-[#E8E1D2]/85">
                        {a.experience}
                      </p>
                    </div>
                  )}

                  {a.statement && (
                    <div className="border border-[#263D59]/50 bg-[#030914]/80 p-3.5 font-sans text-xs leading-relaxed text-[#E8E1D2]/80">
                      {a.statement}
                    </div>
                  )}

                  {(() => {
                    const formatted = formatApplicationAnswersForReview(a, { includeMedical: false });
                    if (formatted.length === 0) return null;
                    return (
                      <div className="space-y-2.5 border border-[#263D59]/50 bg-[#030914]/80 p-3.5 text-xs">
                        <p className="font-mono text-[10px] tracking-[0.14em] text-[#B89A62] uppercase">
                          Department Responses ({formatted.length})
                        </p>
                        <div className="divide-y divide-[#263D59]/40">
                          {formatted.map((item) => (
                            <div key={item.id} className="py-2 first:pt-0 last:pb-0">
                              <p className="font-medium text-[#D5BD8B]">
                                {item.numberLabel ? `${item.numberLabel}. ` : ''}
                                {item.questionLabel}
                              </p>
                              <p className="mt-1 whitespace-pre-wrap leading-relaxed text-[#E8E1D2]/90">
                                {item.answerText}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {Array.isArray(a.attachments) && a.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {a.attachments.map((att) => (
                        <button
                          key={att.id}
                          type="button"
                          onClick={async () => {
                            try {
                              const r = await apiRequest<{ signedUrl: string }>(
                                `/api/applications/${a.id}/sign-attachment`,
                                { method: 'POST', body: { storage_key: att.storage_key } }
                              );
                              setCertPreview({
                                fileName: att.file_name,
                                mimeType: att.mime_type,
                                url: r.signedUrl,
                              });
                            } catch (err) {
                              addToast(
                                err instanceof Error ? err.message : 'Unable to preview attachment.',
                                'error'
                              );
                            }
                          }}
                          className="portal-btn-secondary py-1.5 text-[10px]"
                        >
                          Certificate: {att.file_name} ({Math.max(1, Math.round((att.size_bytes || 0) / 1024))} KB)
                        </button>
                      ))}
                    </div>
                  )}

                  {['pending', 'received', 'under_review'].includes(a.status) ? (
                    <>
                      <textarea
                        rows={2}
                        placeholder="Head review notes..."
                        value={headNotes[a.id] ?? a.head_notes ?? ''}
                        onChange={(e) => setHeadNotes((p) => ({ ...p, [a.id]: e.target.value }))}
                        className="portal-textarea"
                      />
                      <div className="flex flex-wrap gap-2.5">
                        <button
                          type="button"
                          onClick={() => void handleRecommend(a.id, 'recommend_accept')}
                          className="inline-flex items-center border border-[#16A34A]/70 bg-[#05140E] px-4 py-2 font-mono text-[11px] tracking-[0.13em] text-[#86EFAC] uppercase whitespace-nowrap hover:border-[#22C55E]"
                        >
                          Recommend Accept
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleRecommend(a.id, 'recommend_reject')}
                          className="portal-btn-danger"
                        >
                          Recommend Reject
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="border border-[#263D59]/45 bg-[#030914]/70 px-3 py-2 font-mono text-[10px] tracking-[0.08em] text-[#B9C6D8] uppercase">
                      Final status: {a.status.replace(/_/g, ' ')} · Read-only
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!isCoHead && activeTab === 'hr_accepted' && (
        <div className="space-y-6">
          <PortalPageHeader
            kicker="Personnel Onboarding"
            title="Personnel Applicant Roster"
            subtitle="Track pending, accepted, rejected and waitlisted team applicants across departments. Signup links are available for accepted staff only."
          />
          <div className="flex flex-wrap gap-2 border-b border-[#263D59]/50 pb-3">
            {statusTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setApplicantStatusTab(tab.id)}
                className={`border px-4 py-2 font-mono text-[10px] tracking-[0.12em] uppercase transition-colors ${applicantStatusTab === tab.id ? 'border-[#D5BD8B] bg-[#D5BD8B]/10 text-[#F3EDE0]' : 'border-[#263D59] text-[#B9C6D8] hover:border-[#8CA2BD]'}`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
          {headFilteredApps.length === 0 ? (
            <EmptyState
              title={`No ${applicantStatusTab} Applicants`}
              description={`There are no ${applicantStatusTab} personnel applications across the conference.`}
            />
          ) : (
            <div className="divide-y divide-[#263D59]/55 border border-[#263D59]/65 bg-[#050E1C]/85">
              {headFilteredApps.map((a) => (
                <div key={a.id} className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-sans text-sm font-medium text-[#F3EDE0]">
                        {a.applicant_name} ({a.email})
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] tracking-[0.12em] text-[#B89A62] uppercase">
                        {a.application_type} · {a.department_slug} {a.gender ? `· ${a.gender}` : ''}
                      </p>
                    </div>
                    {a.status === 'accepted' && !['delegate', 'chair'].includes(a.application_type) && (
                      <button
                        type="button"
                        onClick={() => void handleHrInvite(a.id)}
                        className="portal-btn-primary py-1.5 text-[10px]"
                      >
                        Create Signup Link
                      </button>
                    )}
                  </div>
                  {issuedUrls[a.id] && (
                    <p className="mt-3 break-all border border-[#16A34A]/50 bg-[#05140E] px-3 py-2 font-mono text-[11px] text-[#86EFAC]">
                      {issuedUrls[a.id]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!isCoHead && activeTab === 'dcc_apps' && (
        <div className="space-y-6">
          <PortalPageHeader
            kicker="Council Admissions"
            title="Delegate & Chair Applications"
            subtitle="Review delegate and chair submissions scoped to the Delegate & Chair Councils directorate."
          />
          <div className="flex flex-wrap gap-2 border-b border-[#263D59]/50 pb-3">
            {statusTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setApplicantStatusTab(tab.id)}
                className={`border px-4 py-2 font-mono text-[10px] tracking-[0.12em] uppercase transition-colors ${applicantStatusTab === tab.id ? 'border-[#D5BD8B] bg-[#D5BD8B]/10 text-[#F3EDE0]' : 'border-[#263D59] text-[#B9C6D8] hover:border-[#8CA2BD]'}`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
          {headFilteredApps.length === 0 ? (
            <EmptyState
              title={`No ${applicantStatusTab} Applicants`}
              description={`There are no ${applicantStatusTab} delegate or chair applications.`}
            />
          ) : (
            <div className="divide-y divide-[#263D59]/55 border border-[#263D59]/65 bg-[#050E1C]/85">
              {headFilteredApps.map((a) => (
                <div
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-[#071426]/65"
                >
                  <div>
                    <p className="font-sans text-sm font-medium text-[#F3EDE0]">
                      {a.applicant_name} ({a.institution})
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[#D5BD8B]">
                      {a.application_code} · {a.application_type} · {a.tier || 'standard'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusLabel status={a.status} />
                    {a.application_type === 'delegate' && ['pending', 'received', 'under_review'].includes(a.status) && (
                      <button
                        type="button"
                        onClick={async () => {
                          await apiRequest(`/api/applications/${a.id}/decision`, {
                            method: 'PATCH',
                            body: { status: 'accepted', expected_status: a.status },
                          });
                          addToast('Delegate accepted.', 'success');
                          await loadApps();
                        }}
                        className="inline-flex items-center border border-[#16A34A]/70 bg-[#05140E] px-3 py-1.5 font-mono text-[10px] text-[#86EFAC] uppercase whitespace-nowrap hover:border-[#22C55E]"
                      >
                        Approve
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!isCoHead && activeTab === 'dept_qr' && <DepartmentQrSectionView departmentSlug={deptSlug} />}
      {!isCoHead && activeTab === 'scanner' && canScan && deptSlug === 'security' && <LiveQrScannerWorkspace />}
      {!isCoHead && activeTab === 'emails' && <EmailsDashboardView />}
      {!isCoHead && activeTab === 'inquiries' && <InquiriesManagerView />}
      {!isCoHead && activeTab === 'sponsors' && <SponsorsManagerView />}
      {!isCoHead && activeTab === 'committees' && <CommitteesManagerView />}


      {certPreview &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            className="portal-app-shell wm-admin fixed inset-0 z-[90] flex items-center justify-center !bg-[#02060E]/90 p-4 backdrop-blur-sm"
            onClick={() => setCertPreview(null)}
          >
            <div
              className="portal-modal-enter flex max-h-[90vh] w-full max-w-3xl flex-col border border-[#9eb8da]/35 bg-[#09182b] p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 border-b border-[#9eb8da]/20 pb-3">
                <div>
                  <p className="font-mono text-[10px] tracking-[0.14em] text-[#83b5ed] uppercase">
                    Certificate Preview
                  </p>
                  <p className="font-sans text-sm font-semibold text-[#edf3fb]">{certPreview.fileName}</p>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={certPreview.url}
                    download={certPreview.fileName}
                    className="portal-btn-primary py-1.5 text-[10px]"
                  >
                    Download
                  </a>
                  <button
                    type="button"
                    onClick={() => setCertPreview(null)}
                    className="portal-btn-secondary py-1.5 text-[10px]"
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="mt-4 flex-1 overflow-auto bg-[#07111f] p-2">
                {certPreview.mimeType.startsWith('image/') ? (
                  <img
                    src={certPreview.url}
                    alt={certPreview.fileName}
                    className="mx-auto max-h-[70vh] object-contain"
                  />
                ) : (
                  <iframe
                    title={certPreview.fileName}
                    src={certPreview.url}
                    className="h-[70vh] w-full border-0"
                  />
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </DashboardShell>
  );
};
