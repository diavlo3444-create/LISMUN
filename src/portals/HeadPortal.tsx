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

  return (
    <DashboardShell
      portalLabel={`${deptSlug.toUpperCase()} Head Portal`}
      breadcrumbSection={navItems.find((n) => n.id === activeTab)?.label || 'Overview'}
      navItems={navItems}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
    >
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div>
            <h1 className="font-display text-3xl text-[#E8E1D2]">
              {effectiveActor?.department_name || deptSlug.toUpperCase()} Directorate
            </h1>
            <p className="mt-1 font-mono text-xs text-[#B89A62] uppercase">
              Scoped Access: {deptSlug}
              {effectiveActor?.gender ? ` · ${effectiveActor.gender} division` : ''}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="border border-[#263D59]/80 bg-[#071426] p-5">
              <p className="font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                Scoped Queue
              </p>
              <p className="mt-2 font-display text-4xl tabular-nums text-[#E8E1D2]">{apps.length}</p>
            </div>
            <div className="border border-[#263D59]/80 bg-[#071426] p-5">
              <p className="font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                Confidential Medical Isolation
              </p>
              <p className="mt-2 font-sans text-xs text-[#86EFAC]">
                Active — Medical records stripped server-side
              </p>
            </div>
            <div className="border border-[#263D59]/80 bg-[#071426] p-5">
              <p className="font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                Division Binding
              </p>
              <p className="mt-2 font-display text-2xl text-[#D5BD8B] capitalize">
                {effectiveActor?.gender || 'Unified'}
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'registrations' && (
        <div className="space-y-4">
          <div>
            <h2 className="font-display text-2xl text-[#E8E1D2]">
              Pending Applicant Screening (Stage 1)
            </h2>
            <p className="mt-1 font-sans text-xs text-[#E8E1D2]/65">
              Showing pending applications within your scope only. Final admission status and medical disclosures are isolated to Secretariat Admins.
            </p>
          </div>

          {loading ? (
            <LoadingSkeleton rows={4} />
          ) : apps.length === 0 ? (
            <EmptyState
              title="No Pending Applications"
              description="All scoped applications have already been processed or none are pending review."
            />
          ) : (
            apps.map((a) => (
              <div key={a.id} className="border border-[#263D59]/80 bg-[#071426] p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-2xl text-[#E8E1D2]">{a.applicant_name}</p>
                    <p className="font-mono text-[11px] text-[#D5BD8B]">
                      {a.application_code} · {a.email} · {a.institution}
                    </p>
                  </div>
                  <StatusLabel status={a.head_recommendation || 'Needs Stage 1 Review'} />
                </div>

                {a.statement && (
                  <p className="border-l-2 border-[#B89A62]/60 pl-3 font-sans text-xs text-[#E8E1D2]/80">
                    {a.statement}
                  </p>
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
                        className="border border-[#263D59] bg-[#030914] px-3 py-1 font-mono text-[11px] text-[#D5BD8B]"
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
                  className="w-full border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleRecommend(a.id, 'recommend_accept')}
                    className="border border-[#16A34A] bg-[#081A12] px-4 py-1.5 font-mono text-xs text-[#86EFAC] uppercase"
                  >
                    Recommend Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRecommend(a.id, 'recommend_reject')}
                    className="border border-[#DC2626] bg-[#1B0B10] px-4 py-1.5 font-mono text-xs text-[#FCA5A5] uppercase"
                  >
                    Recommend Reject
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'hr_accepted' && (
        <div className="space-y-4">
          <h2 className="font-display text-2xl text-[#E8E1D2]">
            Accepted Applicants Roster &amp; Onboarding Links
          </h2>
          {apps.length === 0 ? (
            <EmptyState title="No Accepted Applicants Yet" description="Secretariat-accepted applicants appear here for HR onboarding link generation." />
          ) : (
            apps.map((a) => (
              <div key={a.id} className="border border-[#263D59]/80 bg-[#071426] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-sans text-sm font-medium text-[#E8E1D2]">
                      {a.applicant_name} ({a.email})
                    </p>
                    <p className="font-mono text-[10px] text-[#B89A62] uppercase">
                      {a.application_type} · {a.department_slug} {a.gender ? `· ${a.gender}` : ''}
                    </p>
                  </div>
                  {!['delegate', 'chair'].includes(a.application_type) && (
                    <button
                      type="button"
                      onClick={() => void handleHrInvite(a.id)}
                      className="border border-[#D5BD8B] bg-[#030914] px-3 py-1.5 font-mono text-[11px] text-[#D5BD8B] uppercase"
                    >
                      Create Signup Link
                    </button>
                  )}
                </div>
                {issuedUrls[a.id] && (
                  <p className="mt-2 break-all border border-[#16A34A]/60 bg-[#081A12] p-2 font-mono text-[11px] text-[#86EFAC]">
                    {issuedUrls[a.id]}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'dcc_apps' && (
        <div className="space-y-4">
          <h2 className="font-display text-2xl text-[#E8E1D2]">
            Delegate &amp; Chair Applications (DCC Scope)
          </h2>
          {apps.length === 0 ? (
            <EmptyState title="No Delegate or Chair Records" description="Delegate and Chair applications will appear here." />
          ) : (
            apps.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 border border-[#263D59]/80 bg-[#071426] p-4">
                <div>
                  <p className="font-sans text-sm font-medium text-[#E8E1D2]">
                    {a.applicant_name} ({a.institution})
                  </p>
                  <p className="font-mono text-[11px] text-[#D5BD8B]">
                    {a.application_code} · {a.application_type} · {a.tier || 'standard'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
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
                      className="border border-[#16A34A] px-2.5 py-1 font-mono text-[10px] text-[#86EFAC] uppercase"
                    >
                      Approve
                    </button>
                  )}
                </div>
              </div>
            ))
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
