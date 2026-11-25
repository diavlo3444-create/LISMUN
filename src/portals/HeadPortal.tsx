import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
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
  DepartmentWorkspaceView,
  GroupManagementView,
  InquiriesManagerView,
  NotificationsCenterView,
  OrgChartAndRolesView,
  ShiftManagementView,
  SponsorsManagerView,
} from './OperationalHubComponents';
import { DepartmentQrSectionView, LiveQrScannerWorkspace } from './ScannerAndPassPages';
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
  const canScan = hasPermission(effectiveActor, 'qr.scan', departments);

  const [activeTab, setActiveTab] = useState('overview');
  const [apps, setApps] = useState<ConferenceApplication[]>([]);
  const [headNotes, setHeadNotes] = useState<Record<string, string>>({});
  const [issuedUrls, setIssuedUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const loadApps = useCallback(async () => {
    setLoading(true);
    try {
      const q = isHr ? '?scope=hr_accepted' : '';
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

  const navItems: ShellNavItem[] = [
    { id: 'overview', label: 'Department Overview', group: 'Overview', icon: Building2 },
    ...(isOperational
      ? [
          {
            id: 'registrations',
            label: `Pending Review (${apps.length})`,
            group: 'Registrations',
            icon: ClipboardCheck,
          },
          { id: 'roles', label: 'Roles & Org Chart', group: 'Operations', icon: Users },
          { id: 'groups', label: 'Custom Groups', group: 'Operations', icon: Users },
          { id: 'shifts', label: 'Shifts & Schedule', group: 'Operations', icon: FileText },
          { id: 'dept_qr', label: 'Department QR Passes', group: 'Operations', icon: QrCode },
        ]
      : []),
    ...(canScan
      ? [{ id: 'scanner', label: 'Security QR Scanner', group: 'Security', icon: Shield }]
      : []),
    ...(isHr
      ? [
          { id: 'hr_accepted', label: `Accepted Roster (${apps.length})`, group: 'HR Hub', icon: Users },
          { id: 'emails', label: 'Email Management', group: 'HR Hub', icon: Mail },
          { id: 'inquiries', label: 'Inquiries Inbox', group: 'HR Hub', icon: MessageSquare },
        ]
      : []),
    ...(isPr ? [{ id: 'sponsors', label: 'Sponsors & Partners', group: 'PR Hub', icon: Building2 }] : []),
    ...(isDcc
      ? [
          {
            id: 'dcc_apps',
            label: `Delegates & Chairs (${apps.length})`,
            group: 'DCC Hub',
            icon: FileText,
          },
          { id: 'committees', label: 'Committees & Windows', group: 'DCC Hub', icon: Building2 },
        ]
      : []),
    { id: 'workspace', label: 'Department Workspace', group: 'Coordination', icon: Building2 },
    { id: 'notifications', label: 'Notifications', group: 'Coordination', icon: Bell },
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

  return (
    <DashboardShell
      portalLabel={`${deptSlug.toUpperCase()} Head Portal`}
      breadcrumbSection={navItems.find((n) => n.id === activeTab)?.label || 'Overview'}
      departmentTheme={deptSlug}
      navItems={navItems}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
    >
      {activeTab === 'overview' && (
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

      {activeTab === 'registrations' && (
        <div className="space-y-6">
          <PortalPageHeader
            kicker="Stage 1 Departmental Screening"
            title="Pending Applicant Screening"
            subtitle="Showing pending applications within your scope only. Final admission status and medical disclosures are isolated to Secretariat Admins."
          />

          {loading ? (
            <LoadingSkeleton rows={4} />
          ) : apps.length === 0 ? (
            <EmptyState
              title="No Pending Applications"
              description="All scoped applications have already been processed or none are pending review."
            />
          ) : (
            <div className="divide-y divide-[#263D59]/60 border border-[#263D59]/65 bg-[#050E1C]/85">
              {apps.map((a) => (
                <div key={a.id} className="space-y-4 p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-2xl text-[#F3EDE0]">{a.applicant_name}</p>
                      <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[#D5BD8B]">
                        {a.application_code} · {a.email} · {a.institution}
                      </p>
                    </div>
                    <StatusLabel status={a.head_recommendation || 'Needs Stage 1 Review'} />
                  </div>

                  {a.statement && (
                    <div className="border border-[#263D59]/50 bg-[#030914]/80 p-3.5 font-sans text-xs leading-relaxed text-[#E8E1D2]/80">
                      {a.statement}
                    </div>
                  )}

                  {Array.isArray(a.attachments) && a.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {a.attachments.map((att) => (
                        <button
                          key={att.id}
                          type="button"
                          onClick={async () => {
                            const r = await apiRequest<{ signedUrl: string }>(
                              `/api/applications/${a.id}/sign-attachment`,
                              { method: 'POST', body: { storage_key: att.storage_key } }
                            );
                            window.location.assign(r.signedUrl);
                          }}
                          className="portal-btn-secondary py-1.5 text-[10px]"
                        >
                          Signed Attachment: {att.file_name}
                        </button>
                      ))}
                    </div>
                  )}

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
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'hr_accepted' && (
        <div className="space-y-6">
          <PortalPageHeader
            kicker="Personnel Onboarding"
            title="Accepted Applicants Roster & Onboarding Links"
            subtitle="Generate personal non-expiring portal activation links for Secretariat-accepted staff."
          />
          {apps.length === 0 ? (
            <EmptyState
              title="No Accepted Applicants Yet"
              description="Secretariat-accepted applicants appear here for HR onboarding link generation."
            />
          ) : (
            <div className="divide-y divide-[#263D59]/55 border border-[#263D59]/65 bg-[#050E1C]/85">
              {apps.map((a) => (
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
                    {!['delegate', 'chair'].includes(a.application_type) && (
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

      {activeTab === 'dcc_apps' && (
        <div className="space-y-6">
          <PortalPageHeader
            kicker="Council Admissions"
            title="Delegate & Chair Applications"
            subtitle="Review delegate and chair submissions scoped to the Delegate & Chair Councils directorate."
          />
          {apps.length === 0 ? (
            <EmptyState
              title="No Delegate or Chair Records"
              description="Delegate and Chair applications will appear here."
            />
          ) : (
            <div className="divide-y divide-[#263D59]/55 border border-[#263D59]/65 bg-[#050E1C]/85">
              {apps.map((a) => (
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
                    {a.application_type === 'delegate' && (
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

      {activeTab === 'roles' && <OrgChartAndRolesView departmentSlug={deptSlug} />}
      {activeTab === 'groups' && <GroupManagementView departmentSlug={deptSlug} />}
      {activeTab === 'shifts' && <ShiftManagementView departmentSlug={deptSlug} />}
      {activeTab === 'dept_qr' && <DepartmentQrSectionView departmentSlug={deptSlug} />}
      {activeTab === 'scanner' && canScan && <LiveQrScannerWorkspace />}
      {activeTab === 'emails' && <EmailsDashboardView />}
      {activeTab === 'inquiries' && <InquiriesManagerView />}
      {activeTab === 'sponsors' && <SponsorsManagerView />}
      {activeTab === 'committees' && <CommitteesManagerView />}
      {activeTab === 'workspace' && <DepartmentWorkspaceView departmentSlug={deptSlug} />}
      {activeTab === 'notifications' && <NotificationsCenterView />}
    </DashboardShell>
  );
};
