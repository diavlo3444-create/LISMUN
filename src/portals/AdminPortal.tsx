import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  ClipboardCheck,
  Download,
  FileText,
  FlaskConical,
  Globe,
  KeyRound,
  Mail,
  MessageSquare,
  QrCode,
  Shield,
  Sliders,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { apiRequest } from '../client/api';
import { useAuth } from '../client/AuthContext';
import { saveLocalFailedEmail } from '../client/failedEmailHelpers';
import { navigate } from '../client/router';
import { DashboardShell, type ShellNavItem } from '../client/components/DashboardShell';
import {
  ConfirmDialog,
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
import { LiveQrScannerWorkspace } from './ScannerAndPassPages';
import {
  ALL_PERMISSION_KEYS,
  CORE_DEPARTMENTS,
  formatDecisionByLabel,
  hasPermission,
  isSectionedDepartment,
} from '../shared/permissions';
import type {
  ApplicationStatus,
  ConferenceApplication,
  DecisionOverrideAudit,
  DepartmentRecord,
  GenderSection,
  PermissionKey,
  QrPassRecord,
  UserProfile,
  UserRole,
} from '../shared/types';

export const AdminPortal: React.FC<{ isSuperAdminRoute: boolean }> = ({
  isSuperAdminRoute,
}) => {
  const {
    effectiveActor,
    departments,
    refreshStatusAndSession,
    launchAndEnterTestMode,
  } = useAuth();
  const { addToast } = useToast();

  const isSuper = effectiveActor?.role === 'super_admin';
  const [activeTab, setActiveTab] = useState('overview');

  // Core hydrated state
  const [apps, setApps] = useState<ConferenceApplication[]>([]);
  const [accounts, setAccounts] = useState<UserProfile[]>([]);
  const [ebAllowlist, setEbAllowlist] = useState<
    Array<{
      member_key: string;
      email: string;
      full_name: string;
      department_slug: string;
      eb_rank: string;
      claimed_at: string | null;
    }>
  >([]);
  const [violations, setViolations] = useState<
    Array<{
      id: string;
      attempted_email: string;
      portal_attempted: string;
      actual_role: string | null;
      reason: string;
      created_at: string;
    }>
  >([]);
  const [spoofLogs, setSpoofLogs] = useState<DecisionOverrideAudit[]>([]);
  const [testLogs, setTestLogs] = useState<
    Array<{
      id: string;
      actor_email: string;
      department_slug: string;
      section: string | null;
      action: string;
      created_at: string;
    }>
  >([]);
  const [spoofAdmins, setSpoofAdmins] = useState<
    Array<{ user_id: string; email: string; full_name: string; role: string }>
  >([]);
  const [qrPasses, setQrPasses] = useState<QrPassRecord[]>([]);
  const [qrCorrections, setQrCorrections] = useState<
    Array<{
      id: string;
      actor_name: string;
      action: string;
      reason: string;
      created_at: string;
    }>
  >([]);
  const [cmsBundle, setCmsBundle] = useState<{
    announcements: Array<{ id: string; title: string; body: string; published: boolean }>;
    scheduleDays: Array<{ id: string; label: string; event_date: string | null }>;
    scheduleSessions: Array<{ id: string; day_id: string; title: string; time_range: string }>;
    secretariat: Array<{ id: string; full_name: string; title: string }>;
    documents: Array<{ id: string; title: string; category: string; url: string }>;
    faqs: Array<{ id: string; question: string; answer: string; category: string }>;
    customForms: Array<{ id: string; slug: string; title: string; is_open: boolean }>;
  }>({
    announcements: [],
    scheduleDays: [],
    scheduleSessions: [],
    secretariat: [],
    documents: [],
    faqs: [],
    customForms: [],
  });
  const [publicDepts, setPublicDepts] = useState<DepartmentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Modals
  const [appFilterStatus, setAppFilterStatus] = useState('all');
  const [appFilterType, setAppFilterType] = useState('all');
  const [appSearch, setAppSearch] = useState('');
  const [selectedApp, setSelectedApp] = useState<ConferenceApplication | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [overrideTarget, setOverrideTarget] = useState<ConferenceApplication | null>(null);
  const [overrideStatus, setOverrideStatus] = useState<ApplicationStatus>('accepted');
  const [overrideReason, setOverrideReason] = useState('');
  const [spoofTarget, setSpoofTarget] = useState<ConferenceApplication | null>(null);
  const [spoofStatus, setSpoofStatus] = useState<ApplicationStatus>('accepted');
  const [spoofAdminId, setSpoofAdminId] = useState('');
  const [spoofNotes, setSpoofNotes] = useState('');
  const [deleteAppTarget, setDeleteAppTarget] = useState<ConferenceApplication | null>(null);
  const [batchSelectedIds, setBatchSelectedIds] = useState<string[]>([]);
  const [issuedInviteUrls, setIssuedInviteUrls] = useState<Record<string, string>>({});

  // Account creation form
  const [newAccEmail, setNewAccEmail] = useState('');
  const [newAccName, setNewAccName] = useState('');
  const [newAccRole, setNewAccRole] = useState<UserRole>('department_head');
  const [newAccDept, setNewAccDept] = useState('volunteers');
  const [newAccGender, setNewAccGender] = useState<GenderSection>('male');
  const [newAccPassword, setNewAccPassword] = useState('');
  const [newAccPerms, setNewAccPerms] = useState<Partial<Record<PermissionKey, boolean>>>({});
  const [lastSetupLink, setLastSetupLink] = useState('');

  // EB Invite / Allowlist forms
  const [allowEmail, setAllowEmail] = useState('');
  const [allowName, setAllowName] = useState('');
  const [allowDept, setAllowDept] = useState('hr');
  const [allowRank, setAllowRank] = useState('co_head');
  const [ebInvEmail, setEbInvEmail] = useState('');
  const [ebInvDept, setEbInvDept] = useState('security');
  const [ebInvRole, setEbInvRole] = useState('co_head');
  const [ebGeneratedUrl, setEbGeneratedUrl] = useState('');

  // Super IT Test Mode Launcher
  const [testDept, setTestDept] = useState('security');
  const [testSection, setTestSection] = useState<GenderSection>('male');

  // QR Manual Correction & Global Reset
  const [corrPassId, setCorrPassId] = useState('');
  const [corrAction, setCorrAction] = useState('mark_checked_in');
  const [corrReason, setCorrReason] = useState('');
  const [resetConfirmText, setResetConfirmText] = useState('');

  // CMS Editor inputs
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [faqQ, setFaqQ] = useState('');
  const [faqA, setFaqA] = useState('');
  const [secName, setSecName] = useState('');
  const [secTitle, setSecTitle] = useState('');
  const [docTitle, setDocTitle] = useState('');
  const [docUrl, setDocUrl] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formSlug, setFormSlug] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [appsRes, ovRes, bundleRes] = await Promise.all([
        apiRequest<{ applications: ConferenceApplication[] }>('/api/applications').catch(() => ({
          applications: [],
        })),
        apiRequest<{ departments: DepartmentRecord[] }>('/api/public/overview').catch(() => ({
          departments: [],
        })),
        apiRequest<typeof cmsBundle>('/api/cms/bundle').catch(() => cmsBundle),
      ]);
      setApps(appsRes.applications || []);
      setPublicDepts(ovRes.departments || []);
      setCmsBundle(bundleRes);

      if (hasPermission(effectiveActor, 'accounts.view', departments)) {
        const accRes = await apiRequest<{
          accounts: UserProfile[];
          ebAllowlist: typeof ebAllowlist;
          securityViolations: typeof violations;
        }>('/api/super-admin/accounts').catch(() => null);
        if (accRes) {
          setAccounts(accRes.accounts || []);
          setEbAllowlist(accRes.ebAllowlist || []);
          setViolations(accRes.securityViolations || []);
        }
      }

      if (hasPermission(effectiveActor, 'qr.registry_view', departments)) {
        const qrRes = await apiRequest<{
          passes: QrPassRecord[];
          corrections: typeof qrCorrections;
        }>('/api/qr/registry').catch(() => null);
        if (qrRes) {
          setQrPasses(qrRes.passes || []);
          setQrCorrections(qrRes.corrections || []);
        }
      }

      if (isSuper) {
        const [admRes, logRes, tmRes] = await Promise.all([
          apiRequest<{ admins: typeof spoofAdmins }>('/api/applications/spoof/admins').catch(
            () => ({ admins: [] })
          ),
          apiRequest<{ logs: DecisionOverrideAudit[] }>('/api/applications/spoof/audit').catch(
            () => ({ logs: [] })
          ),
          apiRequest<{ logs: typeof testLogs }>('/api/super-admin/test-mode/audit').catch(() => ({
            logs: [],
          })),
        ]);
        setSpoofAdmins(admRes.admins || []);
        setSpoofLogs(logRes.logs || []);
        setTestLogs(tmRes.logs || []);
      }
    } finally {
      setLoading(false);
    }
  }, [departments, effectiveActor, isSuper]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const navItems: ShellNavItem[] = [
    { id: 'overview', label: 'Overview & Statistics', group: 'Overview', icon: BarChart3 },
    { id: 'applications', label: `Applications (${apps.length})`, group: 'Admissions', icon: FileText },
    { id: 'recommendations', label: 'Head Recommendations', group: 'Admissions', icon: ClipboardCheck },
    { id: 'app_toggles', label: 'Registration Toggles', group: 'Admissions', icon: Sliders },
    { id: 'emails', label: 'Email Management', group: 'Communications', icon: Mail },
    { id: 'inquiries', label: 'Inquiries Inbox', group: 'Communications', icon: MessageSquare },
    { id: 'notifications', label: 'Notifications Center', group: 'Communications', icon: Bell },
    { id: 'scanner', label: 'Live QR Scanner', group: 'Attendance & QR', icon: QrCode },
    { id: 'qr_registry', label: 'QR Attendance Registry', group: 'Attendance & QR', icon: Activity },
    { id: 'ops_workspace', label: 'Dept Workspace', group: 'Operations', icon: Building2 },
    { id: 'ops_roles', label: 'Org Chart & Roles', group: 'Operations', icon: Users },
    { id: 'ops_groups', label: 'Custom Groups', group: 'Operations', icon: Users },
    { id: 'ops_shifts', label: 'Shift Management', group: 'Operations', icon: Activity },
    { id: 'cms_editor', label: 'Website & Form CMS', group: 'Content & CMS', icon: Globe },
    { id: 'committees', label: 'Committees & Windows', group: 'Content & CMS', icon: Building2 },
    { id: 'sponsors', label: 'Sponsors', group: 'Content & CMS', icon: Building2 },
    { id: 'accounts', label: isSuper ? 'Accounts & Permissions' : 'Staff Directory', group: 'Governance', icon: Shield },
    ...(isSuper
      ? [
          { id: 'test_mode', label: 'Super IT Test Mode', group: 'Governance', icon: FlaskConical },
          { id: 'spoof_audit', label: 'Spoof & Override Logs', group: 'Governance', icon: KeyRound },
        ]
      : []),
  ];

  const handleDecision = async (app: ConferenceApplication, nextStatus: ApplicationStatus) => {
    try {
      await apiRequest(`/api/applications/${app.id}/decision`, {
        method: 'PATCH',
        body: {
          status: nextStatus,
          review_notes: reviewNotes || undefined,
          expected_status: app.status,
        },
      });
      addToast(`Application ${app.application_code} marked ${nextStatus}.`, 'success');
      setSelectedApp(null);
      setReviewNotes('');
      await loadAll();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Decision failed.', 'error');
    }
  };

  const sendDecisionEmail = async (
    app: ConferenceApplication,
    method: 'resend' | 'gmail_oauth'
  ) => {
    try {
      const res = await apiRequest<{ ok: boolean; error?: string }>('/api/emails/application-send', {
        method: 'POST',
        body: {
          application_id: app.id,
          decision: app.status,
          method,
        },
      });
      if (res.ok) {
        addToast(`Decision email dispatched via ${method}.`, 'success');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Send failed';
      saveLocalFailedEmail({
        key: `${app.id}|${app.status}`,
        deliveryId: null,
        applicationId: app.id,
        applicantType: app.application_type,
        recipientName: app.applicant_name,
        recipientEmail: app.email,
        departmentSlug: app.department_slug,
        emailType: app.status === 'accepted' ? 'acceptance' : app.status === 'rejected' ? 'rejection' : app.status,
        subject: `LIS MUN — Application ${app.status}`,
        bodyText: `Dear ${app.applicant_name},\n\nYour LIS MUN application status has been updated to: ${app.status}.\n`,
        errorMessage: msg,
        attemptCount: 1,
        failedAt: new Date().toISOString(),
      });
      addToast(`Send failed (${msg}). Saved to Failed-to-Send Gmail recovery queue.`, 'error');
    }
  };

  const handleOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideTarget) return;
    try {
      await apiRequest(`/api/applications/${overrideTarget.id}/override`, {
        method: 'POST',
        body: { status: overrideStatus, reason: overrideReason },
      });
      addToast('Super Admin override recorded.', 'success');
      setOverrideTarget(null);
      setOverrideReason('');
      await loadAll();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Override failed.', 'error');
    }
  };

  const handleSpoof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!spoofTarget) return;
    try {
      await apiRequest(`/api/applications/${spoofTarget.id}/spoof`, {
        method: 'POST',
        body: {
          status: spoofStatus,
          attributed_admin_id: spoofStatus === 'pending' ? null : spoofAdminId,
          notes: spoofNotes || undefined,
        },
      });
      addToast('Stealth decision attribution saved (no emails triggered).', 'success');
      setSpoofTarget(null);
      setSpoofNotes('');
      await loadAll();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Spoof failed.', 'error');
    }
  };

  const handleDeleteApp = async () => {
    if (!deleteAppTarget) return;
    try {
      await apiRequest(`/api/applications/${deleteAppTarget.id}`, { method: 'DELETE' });
      addToast('Application permanently deleted.', 'info');
      setDeleteAppTarget(null);
      setSelectedApp(null);
      await loadAll();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Delete failed.', 'error');
    }
  };

  const issueSingleInvite = async (appId: string) => {
    try {
      const res = await apiRequest<{ inviteUrl: string }>('/api/invites/hr/create', {
        method: 'POST',
        body: { application_id: appId },
      });
      const full = `${window.location.origin}${res.inviteUrl}`;
      setIssuedInviteUrls((p) => ({ ...p, [appId]: full }));
      addToast('Non-expiring HR signup link generated.', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Invite creation failed.', 'error');
    }
  };

  const issueBatchInvites = async () => {
    if (batchSelectedIds.length === 0) return;
    try {
      const res = await apiRequest<{
        results: Array<{ applicationId: string; inviteUrl?: string }>;
      }>('/api/invites/hr/create-batch', {
        method: 'POST',
        body: { application_ids: batchSelectedIds.slice(0, 25) },
      });
      const next: Record<string, string> = {};
      for (const r of res.results || []) {
        if (r.inviteUrl) next[r.applicationId] = `${window.location.origin}${r.inviteUrl}`;
      }
      setIssuedInviteUrls((p) => ({ ...p, ...next }));
      setBatchSelectedIds([]);
      addToast(`Generated ${Object.keys(next).length} batch signup links.`, 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Batch invite failed.', 'error');
    }
  };

  const exportApplicationsCsv = () => {
    const header = ['Code', 'Name', 'Email', 'Type', 'Department', 'Gender', 'Status', 'HeadRec', 'DecisionBy'];
    const rows = apps.map((a) => [
      a.application_code,
      `"${a.applicant_name.replace(/"/g, '""')}"`,
      a.email,
      a.application_type,
      a.department_slug,
      a.gender || '',
      a.status,
      a.head_recommendation || '',
      formatDecisionByLabel(a.status, a.decision_by_name),
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lismun-applications-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredApps = apps.filter((a) => {
    if (appFilterStatus !== 'all' && a.status !== appFilterStatus) return false;
    if (appFilterType !== 'all' && a.application_type !== appFilterType) return false;
    if (appSearch) {
      const q = appSearch.toLowerCase();
      if (
        !a.applicant_name.toLowerCase().includes(q) &&
        !a.email.toLowerCase().includes(q) &&
        !a.application_code.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  const recommendedApps = apps.filter((a) => Boolean(a.head_recommendation));

  return (
    <DashboardShell
      portalLabel={isSuperAdminRoute || isSuper ? 'Super Admin Control' : 'Admin Secretariat'}
      breadcrumbSection={navItems.find((n) => n.id === activeTab)?.label || 'Overview'}
      navItems={navItems}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      actions={
        <button
          type="button"
          onClick={() => navigate('/preview?preview=1')}
          className="hidden border border-[#263D59] bg-[#071426] px-3 py-1.5 font-mono text-[11px] text-[#E8E1D2] uppercase sm:inline-flex"
        >
          Live Site Preview
        </button>
      }
    >
      {loading ? (
        <LoadingSkeleton rows={6} />
      ) : (
        <>
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <h1 className="font-display text-3xl text-[#E8E1D2]">
                  Secretariat Command &amp; Analytics
                </h1>
                <button
                  type="button"
                  onClick={exportApplicationsCsv}
                  className="inline-flex items-center gap-2 border border-[#B89A62] bg-[#071426] px-4 py-2 font-mono text-xs text-[#D5BD8B] uppercase"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Export CSV</span>
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="border border-[#263D59]/80 bg-[#071426] p-5">
                  <p className="font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                    Total Applications
                  </p>
                  <p className="mt-2 font-display text-4xl tabular-nums text-[#E8E1D2]">
                    {apps.length}
                  </p>
                </div>
                <div className="border border-[#263D59]/80 bg-[#071426] p-5">
                  <p className="font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                    Accepted
                  </p>
                  <p className="mt-2 font-display text-4xl tabular-nums text-[#86EFAC]">
                    {apps.filter((a) => a.status === 'accepted').length}
                  </p>
                </div>
                <div className="border border-[#263D59]/80 bg-[#071426] p-5">
                  <p className="font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                    Pending Stage 2 Review
                  </p>
                  <p className="mt-2 font-display text-4xl tabular-nums text-[#FCD34D]">
                    {apps.filter((a) => ['pending', 'received', 'under_review'].includes(a.status)).length}
                  </p>
                </div>
                <div className="border border-[#263D59]/80 bg-[#071426] p-5">
                  <p className="font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                    Inside Venue (QR)
                  </p>
                  <p className="mt-2 font-display text-4xl tabular-nums text-[#D5BD8B]">
                    {qrPasses.filter((p) => p.inside).length} / {qrPasses.length}
                  </p>
                </div>
              </div>

              <div className="border border-[#263D59]/80 bg-[#071426] p-5">
                <p className="mb-4 font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                  Track Breakdown
                </p>
                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {(['delegate', 'chair', 'media', 'press', 'security', 'volunteers'] as const).map((t) => (
                    <div key={t} className="border border-[#263D59]/60 bg-[#030914] p-3">
                      <p className="font-mono text-[10px] text-[#B89A62] uppercase">{t}</p>
                      <p className="mt-1 font-display text-2xl tabular-nums text-[#E8E1D2]">
                        {apps.filter((a) => a.application_type === t).length}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {(activeTab === 'applications' || activeTab === 'recommendations') && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="font-display text-3xl text-[#E8E1D2]">
                  {activeTab === 'recommendations'
                    ? `Head Recommendations Queue (${recommendedApps.length})`
                    : 'All Conference Applications'}
                </h1>
                {batchSelectedIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void issueBatchInvites()}
                    className="border border-[#D5BD8B] bg-[#071426] px-4 py-2 font-mono text-xs text-[#D5BD8B] uppercase"
                  >
                    Create Batch Signup Links ({batchSelectedIds.length})
                  </button>
                )}
              </div>

              {activeTab === 'applications' && (
                <div className="grid gap-3 border border-[#263D59]/80 bg-[#071426] p-4 sm:grid-cols-3">
                  <input
                    placeholder="Search applicant name, email, code..."
                    value={appSearch}
                    onChange={(e) => setAppSearch(e.target.value)}
                    className="border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                  />
                  <select
                    value={appFilterType}
                    onChange={(e) => setAppFilterType(e.target.value)}
                    className="border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                  >
                    <option value="all">All Tracks</option>
                    <option value="delegate">Delegate</option>
                    <option value="chair">Chair</option>
                    <option value="media">Media</option>
                    <option value="press">Press</option>
                    <option value="security">Security</option>
                    <option value="volunteers">Volunteers</option>
                  </select>
                  <select
                    value={appFilterStatus}
                    onChange={(e) => setAppFilterStatus(e.target.value)}
                    className="border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                  >
                    <option value="all">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="accepted">Accepted</option>
                    <option value="waitlisted">Waitlisted</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              )}

              {(activeTab === 'recommendations' ? recommendedApps : filteredApps).length === 0 ? (
                <EmptyState
                  title="No Applications Matching Filter"
                  description="Submitted applications from the public portal and Registration modal will appear here."
                />
              ) : (
                <div className="overflow-x-auto border border-[#263D59]/80 bg-[#071426]">
                  <table className="w-full text-left font-sans text-xs">
                    <thead className="border-b border-[#263D59] bg-[#040B18] font-mono text-[10px] tracking-[0.15em] text-[#B89A62] uppercase">
                      <tr>
                        <th className="p-3">Batch</th>
                        <th className="p-3">Applicant</th>
                        <th className="p-3">Track</th>
                        <th className="p-3">Head Rec</th>
                        <th className="p-3">Status &amp; Decision Maker</th>
                        <th className="p-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#263D59]/50">
                      {(activeTab === 'recommendations' ? recommendedApps : filteredApps).map((a) => (
                        <tr key={a.id} className="hover:bg-[#040B18]/60">
                          <td className="p-3">
                            {a.status === 'accepted' && !['delegate', 'chair'].includes(a.application_type) && (
                              <input
                                type="checkbox"
                                checked={batchSelectedIds.includes(a.id)}
                                onChange={(e) =>
                                  setBatchSelectedIds((p) =>
                                    e.target.checked ? [...p, a.id] : p.filter((x) => x !== a.id)
                                  )
                                }
                              />
                            )}
                          </td>
                          <td className="p-3">
                            <p className="font-medium text-[#E8E1D2]">{a.applicant_name}</p>
                            <p className="font-mono text-[10px] text-[#E8E1D2]/60">
                              {a.application_code} · {a.email}
                            </p>
                            {a.medical_has_conditions && (
                              <span className="mt-1 inline-block border border-[#DC2626]/60 bg-[#1B0B10] px-1.5 py-0.5 font-mono text-[9px] text-[#FCA5A5] uppercase">
                                Confidential Medical Flag
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            <StatusLabel status={`${a.application_type}${a.gender ? ` · ${a.gender}` : ''}`} tone="gold" />
                          </td>
                          <td className="p-3">
                            {a.head_recommendation ? (
                              <div>
                                <StatusLabel status={a.head_recommendation} />
                                {a.recommended_by_name && (
                                  <p className="mt-1 font-mono text-[10px] text-[#E8E1D2]/55">
                                    by {a.recommended_by_name}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="font-mono text-[10px] text-[#E8E1D2]/40">None yet</span>
                            )}
                          </td>
                          <td className="p-3">
                            <StatusLabel status={a.status} />
                            {a.decision_by_name && (
                              <p className="mt-1 font-mono text-[10px] text-[#E8E1D2]/65">
                                {formatDecisionByLabel(a.status, a.decision_by_name)}
                              </p>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1.5">
                              <button
                                type="button"
                                onClick={() => setSelectedApp(a)}
                                className="border border-[#263D59] bg-[#030914] px-2.5 py-1 font-mono text-[10px] text-[#D5BD8B] uppercase"
                              >
                                Inspect
                              </button>
                              {isSuper && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOverrideTarget(a);
                                      setOverrideStatus(a.status);
                                    }}
                                    className="border border-[#D97706]/60 bg-[#1B1409] px-2 py-1 font-mono text-[10px] text-[#FCD34D] uppercase"
                                  >
                                    Override
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSpoofTarget(a);
                                      setSpoofStatus(a.status);
                                      setSpoofAdminId(spoofAdmins[0]?.user_id || '');
                                    }}
                                    className="border border-[#B89A62]/60 bg-[#030914] px-2 py-1 font-mono text-[10px] text-[#D5BD8B] uppercase"
                                  >
                                    Spoof
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeleteAppTarget(a)}
                                    className="border border-[#DC2626]/60 bg-[#1B0B10] px-2 py-1 font-mono text-[10px] text-[#FCA5A5] uppercase"
                                  >
                                    Del
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'app_toggles' && (
            <div className="space-y-4">
              <h1 className="font-display text-3xl text-[#E8E1D2]">Public Registration Toggles</h1>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {publicDepts
                  .filter((d) => d.has_public_intake || d.slug === 'dcc')
                  .map((d) => (
                    <div key={d.id} className="flex items-center justify-between border border-[#263D59]/80 bg-[#071426] p-5">
                      <div>
                        <p className="font-display text-xl text-[#E8E1D2]">{d.name}</p>
                        <p className="font-mono text-[10px] text-[#B89A62] uppercase">{d.slug}</p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          await apiRequest(`/api/departments/${d.slug}/registration`, {
                            method: 'PATCH',
                            body: { registration_open: !d.registration_open },
                          });
                          addToast(`Toggled ${d.name} registration.`, 'success');
                          await loadAll();
                        }}
                        className={`border px-3 py-1.5 font-mono text-xs uppercase ${
                          d.registration_open
                            ? 'border-[#16A34A] bg-[#081A12] text-[#86EFAC]'
                            : 'border-[#DC2626] bg-[#1B0B10] text-[#FCA5A5]'
                        }`}
                      >
                        {d.registration_open ? 'Open' : 'Closed'}
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {activeTab === 'emails' && <EmailsDashboardView />}
          {activeTab === 'inquiries' && <InquiriesManagerView />}
          {activeTab === 'notifications' && <NotificationsCenterView />}
          {activeTab === 'scanner' && <LiveQrScannerWorkspace />}

          {activeTab === 'qr_registry' && (
            <div className="space-y-6">
              <h1 className="font-display text-3xl text-[#E8E1D2]">
                QR Attendance Registry &amp; Corrections
              </h1>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await apiRequest('/api/qr/manual-correct', {
                      method: 'POST',
                      body: { pass_id: corrPassId, action: corrAction, reason: corrReason },
                    });
                    setCorrReason('');
                    addToast('Manual QR correction applied & logged.', 'success');
                    await loadAll();
                  } catch (err) {
                    addToast(err instanceof Error ? err.message : 'Correction failed.', 'error');
                  }
                }}
                className="grid gap-3 border border-[#263D59]/80 bg-[#071426] p-5 sm:grid-cols-4"
              >
                <select
                  required
                  value={corrPassId}
                  onChange={(e) => setCorrPassId(e.target.value)}
                  className="border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                >
                  <option value="">Select Badge Holder...</option>
                  {qrPasses.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name} ({p.pass_code})
                    </option>
                  ))}
                </select>
                <select
                  value={corrAction}
                  onChange={(e) => setCorrAction(e.target.value)}
                  className="border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                >
                  <option value="mark_checked_in">Mark Checked In</option>
                  <option value="mark_checked_out">Mark Checked Out</option>
                  <option value="clear_checkin">Clear Check-In Stamp</option>
                  <option value="toggle_active">Toggle Active / Revoked</option>
                </select>
                <input
                  required
                  minLength={4}
                  placeholder="Audit Rationale (min 4 chars) *"
                  value={corrReason}
                  onChange={(e) => setCorrReason(e.target.value)}
                  className="border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                />
                <button
                  type="submit"
                  className="border border-[#B89A62] bg-[#030914] px-4 py-2 font-mono text-xs text-[#D5BD8B] uppercase"
                >
                  Apply Correction
                </button>
              </form>

              {isSuper && (
                <div className="border border-[#DC2626]/60 bg-[#1B0B10] p-5">
                  <h3 className="font-display text-xl text-[#FCA5A5]">
                    Global Attendance Reset (Super Admin Exclusive)
                  </h3>
                  <p className="mt-1 font-sans text-xs text-[#E8E1D2]/75">
                    Clears all active venue check-in/check-out stamps across every pass and deletes scan check-in history. Type exact word <code className="font-mono">RESET</code> to confirm.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <input
                      placeholder='Type "RESET"'
                      value={resetConfirmText}
                      onChange={(e) => setResetConfirmText(e.target.value)}
                      className="border border-[#DC2626]/60 bg-[#030914] px-3 py-2 font-mono text-xs text-[#E8E1D2]"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await apiRequest('/api/qr/reset-all', {
                            method: 'POST',
                            body: { confirmation: resetConfirmText },
                          });
                          setResetConfirmText('');
                          addToast('Global QR attendance reset complete.', 'info');
                          await loadAll();
                        } catch (err) {
                          addToast(err instanceof Error ? err.message : 'Reset failed.', 'error');
                        }
                      }}
                      className="border border-[#DC2626] bg-[#030914] px-4 py-2 font-mono text-xs text-[#FCA5A5] uppercase"
                    >
                      Execute Global Reset
                    </button>
                  </div>
                </div>
              )}

              {qrCorrections.length > 0 && (
                <div className="border border-[#263D59]/80 bg-[#071426] p-4">
                  <p className="mb-2 font-mono text-[10px] tracking-[0.16em] text-[#B89A62] uppercase">
                    Recent Manual Corrections
                  </p>
                  <div className="space-y-1.5 font-mono text-[11px] text-[#E8E1D2]/75">
                    {qrCorrections.slice(0, 10).map((c) => (
                      <div key={c.id}>
                        {new Date(c.created_at).toLocaleString()} · {c.actor_name} · {c.action} — {c.reason}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'ops_workspace' && <DepartmentWorkspaceView />}
          {activeTab === 'ops_roles' && <OrgChartAndRolesView />}
          {activeTab === 'ops_groups' && <GroupManagementView />}
          {activeTab === 'ops_shifts' && <ShiftManagementView />}
          {activeTab === 'committees' && <CommitteesManagerView />}
          {activeTab === 'sponsors' && <SponsorsManagerView />}

          {activeTab === 'cms_editor' && (
            <div className="space-y-6">
              <h1 className="font-display text-3xl text-[#E8E1D2]">
                Website Content &amp; Dynamic Form Builder
              </h1>

              <div className="grid gap-6 lg:grid-cols-2">
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await apiRequest('/api/cms/announcements', {
                      method: 'POST',
                      body: { title: annTitle, body: annBody, published: true },
                    });
                    setAnnTitle('');
                    setAnnBody('');
                    addToast('Announcement published.', 'success');
                    await loadAll();
                  }}
                  className="space-y-3 border border-[#263D59]/80 bg-[#071426] p-5"
                >
                  <h3 className="font-display text-xl text-[#D5BD8B]">Announcements</h3>
                  <input
                    required
                    placeholder="Title"
                    value={annTitle}
                    onChange={(e) => setAnnTitle(e.target.value)}
                    className="w-full border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                  />
                  <textarea
                    required
                    rows={2}
                    placeholder="Announcement Body"
                    value={annBody}
                    onChange={(e) => setAnnBody(e.target.value)}
                    className="w-full border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                  />
                  <button type="submit" className="border border-[#B89A62] px-4 py-1.5 font-mono text-xs text-[#D5BD8B] uppercase">
                    Publish
                  </button>
                  <div className="space-y-1.5 pt-2">
                    {cmsBundle.announcements.map((a) => (
                      <div key={a.id} className="flex justify-between border border-[#263D59]/50 bg-[#030914] p-2 text-xs">
                        <span>{a.title}</span>
                        <button
                          type="button"
                          onClick={async () => {
                            await apiRequest(`/api/cms/announcements/${a.id}`, { method: 'DELETE' });
                            await loadAll();
                          }}
                          className="text-[#FCA5A5]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </form>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await apiRequest('/api/cms/faqs', {
                      method: 'POST',
                      body: { question: faqQ, answer: faqA, published: true },
                    });
                    setFaqQ('');
                    setFaqA('');
                    addToast('FAQ published.', 'success');
                    await loadAll();
                  }}
                  className="space-y-3 border border-[#263D59]/80 bg-[#071426] p-5"
                >
                  <h3 className="font-display text-xl text-[#D5BD8B]">FAQs</h3>
                  <input
                    required
                    placeholder="Question"
                    value={faqQ}
                    onChange={(e) => setFaqQ(e.target.value)}
                    className="w-full border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                  />
                  <textarea
                    required
                    rows={2}
                    placeholder="Answer"
                    value={faqA}
                    onChange={(e) => setFaqA(e.target.value)}
                    className="w-full border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                  />
                  <button type="submit" className="border border-[#B89A62] px-4 py-1.5 font-mono text-xs text-[#D5BD8B] uppercase">
                    Add FAQ
                  </button>
                  <div className="space-y-1.5 pt-2">
                    {cmsBundle.faqs.map((f) => (
                      <div key={f.id} className="flex justify-between border border-[#263D59]/50 bg-[#030914] p-2 text-xs">
                        <span className="truncate">{f.question}</span>
                        <button
                          type="button"
                          onClick={async () => {
                            await apiRequest(`/api/cms/faqs/${f.id}`, { method: 'DELETE' });
                            await loadAll();
                          }}
                          className="text-[#FCA5A5]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </form>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await apiRequest('/api/cms/secretariat', {
                      method: 'POST',
                      body: { full_name: secName, title: secTitle },
                    });
                    setSecName('');
                    setSecTitle('');
                    addToast('Secretariat member saved.', 'success');
                    await loadAll();
                  }}
                  className="space-y-3 border border-[#263D59]/80 bg-[#071426] p-5"
                >
                  <h3 className="font-display text-xl text-[#D5BD8B]">Secretariat Profiles</h3>
                  <input
                    required
                    placeholder="Full Name"
                    value={secName}
                    onChange={(e) => setSecName(e.target.value)}
                    className="w-full border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                  />
                  <input
                    required
                    placeholder="Official Secretariat Title"
                    value={secTitle}
                    onChange={(e) => setSecTitle(e.target.value)}
                    className="w-full border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                  />
                  <button type="submit" className="border border-[#B89A62] px-4 py-1.5 font-mono text-xs text-[#D5BD8B] uppercase">
                    Add Member
                  </button>
                </form>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await apiRequest('/api/cms/documents', {
                      method: 'POST',
                      body: { title: docTitle, url: docUrl },
                    });
                    setDocTitle('');
                    setDocUrl('');
                    addToast('Document published.', 'success');
                    await loadAll();
                  }}
                  className="space-y-3 border border-[#263D59]/80 bg-[#071426] p-5"
                >
                  <h3 className="font-display text-xl text-[#D5BD8B]">Conference Documents</h3>
                  <input
                    required
                    placeholder="Document Title"
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                    className="w-full border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                  />
                  <input
                    required
                    type="url"
                    placeholder="https://..."
                    value={docUrl}
                    onChange={(e) => setDocUrl(e.target.value)}
                    className="w-full border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                  />
                  <button type="submit" className="border border-[#B89A62] px-4 py-1.5 font-mono text-xs text-[#D5BD8B] uppercase">
                    Publish Document
                  </button>
                </form>
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await apiRequest('/api/cms/forms', {
                    method: 'POST',
                    body: {
                      slug: formSlug,
                      title: formTitle,
                      fields: [
                        { id: 'full_name', label: 'Full Name', type: 'text', required: true },
                        { id: 'response', label: 'Details', type: 'textarea', required: true },
                      ],
                    },
                  });
                  setFormSlug('');
                  setFormTitle('');
                  addToast('Dynamic form published.', 'success');
                  await loadAll();
                }}
                className="grid gap-3 border border-[#263D59]/80 bg-[#071426] p-5 sm:grid-cols-3"
              >
                <input
                  required
                  placeholder="Form Title (e.g. Position Paper Portal)"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                />
                <input
                  required
                  placeholder="slug (e.g. position-papers)"
                  value={formSlug}
                  onChange={(e) => setFormSlug(e.target.value)}
                  className="border border-[#263D59] bg-[#030914] px-3 py-2 font-mono text-xs text-[#E8E1D2]"
                />
                <button type="submit" className="border border-[#B89A62] px-4 py-2 font-mono text-xs text-[#D5BD8B] uppercase">
                  Create Custom Form
                </button>
              </form>
            </div>
          )}

          {activeTab === 'accounts' && (
            <div className="space-y-6">
              <h1 className="font-display text-3xl text-[#E8E1D2]">
                {isSuper ? 'Accounts, RBAC Permissions & EB Onboarding' : 'Authorized Staff Directory'}
              </h1>

              {isSuper && (
                <>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      try {
                        const res = await apiRequest<{ setupLink?: string | null }>(
                          '/api/super-admin/accounts',
                          {
                            method: 'POST',
                            body: {
                              email: newAccEmail,
                              full_name: newAccName,
                              role: newAccRole,
                              department_slug: newAccRole === 'admin' ? null : newAccDept,
                              gender: isSectionedDepartment(newAccDept) ? newAccGender : null,
                              password: newAccPassword || undefined,
                              permissions: newAccPerms,
                            },
                          }
                        );
                        setNewAccEmail('');
                        setNewAccName('');
                        setNewAccPassword('');
                        if (res.setupLink) {
                          setLastSetupLink(`${window.location.origin}${res.setupLink}`);
                        }
                        addToast('Account provisioned successfully.', 'success');
                        await loadAll();
                      } catch (err) {
                        addToast(err instanceof Error ? err.message : 'Account creation failed.', 'error');
                      }
                    }}
                    className="space-y-4 border border-[#263D59]/80 bg-[#071426] p-5"
                  >
                    <p className="flex items-center gap-2 font-mono text-xs text-[#B89A62] uppercase">
                      <UserPlus className="h-4 w-4" />
                      <span>Provision New Account (47-Key Permissions Matrix)</span>
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                      <input
                        required
                        type="email"
                        placeholder="Email *"
                        value={newAccEmail}
                        onChange={(e) => setNewAccEmail(e.target.value)}
                        className="border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                      />
                      <input
                        required
                        placeholder="Full Name *"
                        value={newAccName}
                        onChange={(e) => setNewAccName(e.target.value)}
                        className="border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                      />
                      <select
                        value={newAccRole}
                        onChange={(e) => setNewAccRole(e.target.value as UserRole)}
                        className="border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                      >
                        <option value="admin">Admin</option>
                        <option value="department_head">Department Head</option>
                        <option value="executive_board">Executive Board</option>
                        <option value="staff">Staff Member</option>
                      </select>
                      {newAccRole !== 'admin' && (
                        <select
                          value={newAccDept}
                          onChange={(e) => setNewAccDept(e.target.value)}
                          className="border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                        >
                          {CORE_DEPARTMENTS.map((d) => (
                            <option key={d.slug} value={d.slug}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      )}
                      {isSectionedDepartment(newAccDept) && newAccRole !== 'admin' && (
                        <select
                          value={newAccGender}
                          onChange={(e) => setNewAccGender(e.target.value as GenderSection)}
                          className="border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                        >
                          <option value="male">Male Division</option>
                          <option value="female">Female Division</option>
                        </select>
                      )}
                    </div>

                    <input
                      type="password"
                      placeholder="Initial Password (leave empty to generate 7-day /head-setup link)"
                      value={newAccPassword}
                      onChange={(e) => setNewAccPassword(e.target.value)}
                      className="w-full border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                    />

                    <details className="border border-[#263D59]/60 bg-[#030914] p-3">
                      <summary className="cursor-pointer font-mono text-[11px] text-[#D5BD8B] uppercase">
                        Custom Permission Overrides ({ALL_PERMISSION_KEYS.length} Keys)
                      </summary>
                      <div className="mt-3 grid max-h-48 gap-1.5 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
                        {ALL_PERMISSION_KEYS.map((pk) => (
                          <label key={pk} className="flex items-center gap-1.5 font-mono text-[10px]">
                            <input
                              type="checkbox"
                              checked={Boolean(newAccPerms[pk])}
                              onChange={(e) =>
                                setNewAccPerms((p) => ({ ...p, [pk]: e.target.checked }))
                              }
                            />
                            <span className="truncate">{pk}</span>
                          </label>
                        ))}
                      </div>
                    </details>

                    <button
                      type="submit"
                      className="border border-[#B89A62] bg-[#030914] px-5 py-2 font-mono text-xs text-[#D5BD8B] uppercase"
                    >
                      Create Account
                    </button>

                    {lastSetupLink && (
                      <div className="border border-[#16A34A]/60 bg-[#081A12] p-3 font-mono text-xs text-[#86EFAC]">
                        Setup Link Generated: {lastSetupLink}
                      </div>
                    )}
                  </form>

                  {/* EB Allowlist & Invite Links */}
                  <div className="grid gap-5 lg:grid-cols-2">
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        await apiRequest('/api/super-admin/eb-allowlist', {
                          method: 'POST',
                          body: {
                            email: allowEmail,
                            full_name: allowName,
                            department_slug: allowDept,
                            eb_rank: allowRank,
                          },
                        });
                        setAllowEmail('');
                        setAllowName('');
                        addToast('EB allowlist entry saved (/eb-signup).', 'success');
                        await loadAll();
                      }}
                      className="space-y-3 border border-[#263D59]/80 bg-[#071426] p-5"
                    >
                      <h3 className="font-display text-xl text-[#D5BD8B]">
                        EB Signup Allowlist ({ebAllowlist.length})
                      </h3>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input
                          required
                          type="email"
                          placeholder="EB Email *"
                          value={allowEmail}
                          onChange={(e) => setAllowEmail(e.target.value)}
                          className="border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                        />
                        <input
                          required
                          placeholder="Full Name *"
                          value={allowName}
                          onChange={(e) => setAllowName(e.target.value)}
                          className="border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                        />
                        <select
                          value={allowDept}
                          onChange={(e) => setAllowDept(e.target.value)}
                          className="border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                        >
                          {CORE_DEPARTMENTS.map((d) => (
                            <option key={`al-${d.slug}`} value={d.slug}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={allowRank}
                          onChange={(e) => setAllowRank(e.target.value)}
                          className="border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                        >
                          <option value="co_head">Co-Head</option>
                          <option value="designer">Designer</option>
                          <option value="marketing">Marketing</option>
                          <option value="member">Member</option>
                        </select>
                      </div>
                      <button
                        type="submit"
                        className="border border-[#B89A62] px-4 py-1.5 font-mono text-xs text-[#D5BD8B] uppercase"
                      >
                        Add to Allowlist
                      </button>
                    </form>

                    <div className="space-y-3 border border-[#263D59]/80 bg-[#071426] p-5">
                      <h3 className="font-display text-xl text-[#D5BD8B]">
                        EB Invite &amp; Reusable Link Generator
                      </h3>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <input
                          type="email"
                          placeholder="EB Email (7-day lock)"
                          value={ebInvEmail}
                          onChange={(e) => setEbInvEmail(e.target.value)}
                          className="border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                        />
                        <select
                          value={ebInvDept}
                          onChange={(e) => setEbInvDept(e.target.value)}
                          className="border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                        >
                          {CORE_DEPARTMENTS.map((d) => (
                            <option key={`ei-${d.slug}`} value={d.slug}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={ebInvRole}
                          onChange={(e) => setEbInvRole(e.target.value)}
                          className="border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                        >
                          <option value="co_head">Co-Head</option>
                          <option value="designer">Designer</option>
                          <option value="marketing">Marketing</option>
                        </select>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            const r = await apiRequest<{ inviteUrl: string }>('/api/invites/eb/admin-create', {
                              method: 'POST',
                              body: {
                                mode: 'personal',
                                email: ebInvEmail,
                                department_slug: ebInvDept,
                                eb_role: ebInvRole,
                              },
                            });
                            setEbGeneratedUrl(`${window.location.origin}${r.inviteUrl}`);
                          }}
                          className="border border-[#B89A62] px-3 py-1.5 font-mono text-[11px] text-[#D5BD8B] uppercase"
                        >
                          Issue 7-Day Invite
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const r = await apiRequest<{ signupUrl: string }>('/api/invites/eb/admin-create', {
                              method: 'POST',
                              body: { mode: 'reusable_link' },
                            });
                            setEbGeneratedUrl(`${window.location.origin}${r.signupUrl}`);
                          }}
                          className="border border-[#263D59] px-3 py-1.5 font-mono text-[11px] text-[#E8E1D2] uppercase"
                        >
                          Generate Reusable #token Link
                        </button>
                      </div>
                      {ebGeneratedUrl && (
                        <p className="break-all border border-[#B89A62]/40 bg-[#030914] p-2 font-mono text-[11px] text-[#D5BD8B]">
                          {ebGeneratedUrl}
                        </p>
                      )}
                    </div>
                  </div>
                </>
              )}

              <div className="overflow-x-auto border border-[#263D59]/80 bg-[#071426]">
                <table className="w-full text-left font-sans text-xs">
                  <thead className="border-b border-[#263D59] bg-[#040B18] font-mono text-[10px] text-[#B89A62] uppercase">
                    <tr>
                      <th className="p-3">Account</th>
                      <th className="p-3">Role &amp; Dept</th>
                      <th className="p-3">Status</th>
                      {isSuper && <th className="p-3">Governance</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#263D59]/50">
                    {accounts.map((acc) => (
                      <tr key={acc.user_id}>
                        <td className="p-3">
                          <p className="font-medium text-[#E8E1D2]">{acc.full_name}</p>
                          <p className="font-mono text-[10px] text-[#E8E1D2]/60">{acc.email}</p>
                        </td>
                        <td className="p-3">
                          <StatusLabel status={acc.role} tone="gold" />
                          {acc.department_slug && (
                            <span className="ml-2 font-mono text-[10px] text-[#E8E1D2]/70">
                              {acc.department_slug} {acc.gender ? `(${acc.gender})` : ''}
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          <StatusLabel
                            status={acc.is_active ? 'Active' : 'Suspended'}
                            tone={acc.is_active ? 'green' : 'red'}
                          />
                        </td>
                        {isSuper && (
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1.5">
                              {!acc.is_primary_super_admin && (
                                <>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      await apiRequest(`/api/super-admin/accounts/${acc.user_id}`, {
                                        method: 'PATCH',
                                        body: { is_active: !acc.is_active },
                                      });
                                      addToast('Account status updated.', 'success');
                                      await loadAll();
                                    }}
                                    className="border border-[#263D59] px-2 py-1 font-mono text-[10px] text-[#D5BD8B] uppercase"
                                  >
                                    {acc.is_active ? 'Suspend' : 'Reactivate'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const res = await apiRequest<{ setupLink?: string }>(
                                        `/api/super-admin/accounts/${acc.user_id}/reset-password`,
                                        { method: 'POST', body: { send_setup_link: true } }
                                      );
                                      if (res.setupLink) {
                                        setLastSetupLink(`${window.location.origin}${res.setupLink}`);
                                        addToast('Password setup link generated.', 'success');
                                      }
                                    }}
                                    className="border border-[#263D59] px-2 py-1 font-mono text-[10px] text-[#E8E1D2] uppercase"
                                  >
                                    Setup Link
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      await apiRequest(`/api/super-admin/accounts/${acc.user_id}`, {
                                        method: 'DELETE',
                                      });
                                      addToast('Account deleted.', 'info');
                                      await loadAll();
                                    }}
                                    className="border border-[#DC2626]/60 px-2 py-1 font-mono text-[10px] text-[#FCA5A5] uppercase"
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {violations.length > 0 && (
                <div className="border border-[#DC2626]/40 bg-[#071426] p-4">
                  <p className="mb-2 font-mono text-[10px] text-[#FCA5A5] uppercase">
                    Security Portal Violation Audit ({violations.length})
                  </p>
                  <div className="max-h-40 space-y-1 overflow-y-auto font-mono text-[11px] text-[#E8E1D2]/70">
                    {violations.map((v) => (
                      <div key={v.id}>
                        {new Date(v.created_at).toLocaleString()} · {v.attempted_email} → {v.portal_attempted} ({v.reason})
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'test_mode' && isSuper && (
            <div className="space-y-6">
              <div className="border border-[#D5BD8B]/45 bg-[#071426] p-6">
                <h2 className="font-display text-3xl text-[#E8E1D2]">Super IT Test Mode Launcher</h2>
                <p className="mt-2 font-sans text-xs text-[#E8E1D2]/75">
                  Impersonate any Department Head with server-clamped privileges (`department_head` role only, Super Admin bypass disabled inside test session) and full audit trail.
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <select
                    value={testDept}
                    onChange={(e) => setTestDept(e.target.value)}
                    className="border border-[#263D59] bg-[#030914] px-3 py-2.5 text-sm text-[#E8E1D2]"
                  >
                    {CORE_DEPARTMENTS.map((d) => (
                      <option key={`tm-${d.slug}`} value={d.slug}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  {isSectionedDepartment(testDept) && (
                    <select
                      value={testSection}
                      onChange={(e) => setTestSection(e.target.value as GenderSection)}
                      className="border border-[#263D59] bg-[#030914] px-3 py-2.5 text-sm text-[#E8E1D2]"
                    >
                      <option value="male">Male Section</option>
                      <option value="female">Female Section</option>
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      void launchAndEnterTestMode(
                        testDept,
                        isSectionedDepartment(testDept) ? testSection : null
                      )
                    }
                    className="border border-[#D5BD8B] bg-[#030914] px-5 py-2.5 font-mono text-xs text-[#D5BD8B] uppercase"
                  >
                    Enter Scoped Head Portal
                  </button>
                </div>
              </div>

              <div className="border border-[#263D59]/80 bg-[#071426] p-5">
                <p className="mb-3 font-mono text-[10px] text-[#B89A62] uppercase">
                  Test Mode Audit Log
                </p>
                <div className="space-y-1.5 font-mono text-xs text-[#E8E1D2]/75">
                  {testLogs.map((l) => (
                    <div key={l.id}>
                      {new Date(l.created_at).toLocaleString()} · {l.actor_email} · {l.action} · {l.department_slug}{' '}
                      {l.section ? `(${l.section})` : ''}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'spoof_audit' && isSuper && (
            <div className="space-y-4">
              <h1 className="font-display text-3xl text-[#E8E1D2]">
                Decision Overrides &amp; Stealth Attribution Audit
              </h1>
              {spoofLogs.length === 0 ? (
                <EmptyState title="No Overrides Recorded" description="Super Admin overrides and stealth spoof attributions are permanently audited here." />
              ) : (
                <div className="space-y-2">
                  {spoofLogs.map((log) => (
                    <div key={log.id} className="border border-[#263D59]/80 bg-[#071426] p-4 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-[#E8E1D2]">
                          {log.applicant_name} ({log.application_code}) · {log.previous_status} → {log.new_status}
                        </span>
                        <StatusLabel
                          status={log.is_spoof ? 'Stealth Spoof' : 'Formal Override'}
                          tone={log.is_spoof ? 'gold' : 'amber'}
                        />
                      </div>
                      <p className="mt-1 font-mono text-[11px] text-[#E8E1D2]/70">
                        Actor: {log.actor_name}
                        {log.spoofed_decision_by_name
                          ? ` · Attributed as: ${log.spoofed_decision_by_name}`
                          : ''}{' '}
                        · Reason: {log.reason}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Application Detail & Stage 2 Decision Modal */}
      {selectedApp && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[75] flex items-center justify-center bg-[#030914]/90 p-4"
          onClick={() => setSelectedApp(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto border border-[#B89A62]/60 bg-[#071426] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-[#263D59] pb-4">
              <div>
                <p className="font-mono text-[11px] text-[#B89A62] uppercase">
                  {selectedApp.application_code} · {selectedApp.application_type}
                </p>
                <h2 className="mt-1 font-display text-3xl text-[#E8E1D2]">
                  {selectedApp.applicant_name}
                </h2>
              </div>
              <StatusLabel status={selectedApp.status} />
            </div>

            <div className="mt-4 space-y-3 font-sans text-xs text-[#E8E1D2]/85">
              <p>
                <strong>Email:</strong> {selectedApp.email} · <strong>Phone:</strong> {selectedApp.phone || 'N/A'}
              </p>
              <p>
                <strong>Institution:</strong> {selectedApp.institution || 'N/A'} ·{' '}
                <strong>Division:</strong> {selectedApp.gender || 'N/A'}
              </p>
              {selectedApp.statement && (
                <div className="border border-[#263D59] bg-[#030914] p-3">
                  <p className="font-mono text-[10px] text-[#B89A62] uppercase">Statement</p>
                  <p className="mt-1 leading-relaxed">{selectedApp.statement}</p>
                </div>
              )}
              {selectedApp.medical_has_conditions !== undefined && (
                <div className="border border-[#DC2626]/50 bg-[#1B0B10] p-3">
                  <p className="font-mono text-[10px] text-[#FCA5A5] uppercase">
                    Confidential Medical Disclosure (Admin Only)
                  </p>
                  <p className="mt-1">
                    {selectedApp.medical_has_conditions
                      ? selectedApp.medical_details || 'Flagged without additional text.'
                      : 'No medical conditions disclosed.'}
                  </p>
                </div>
              )}

              {Array.isArray(selectedApp.attachments) && selectedApp.attachments.length > 0 && (
                <div className="space-y-1.5">
                  <p className="font-mono text-[10px] text-[#B89A62] uppercase">Attachments</p>
                  {selectedApp.attachments.map((att) => (
                    <button
                      key={att.id}
                      type="button"
                      onClick={async () => {
                        const r = await apiRequest<{ signedUrl: string }>(
                          `/api/applications/${selectedApp.id}/sign-attachment`,
                          { method: 'POST', body: { storage_key: att.storage_key } }
                        );
                        window.location.assign(r.signedUrl);
                      }}
                      className="mr-2 border border-[#263D59] bg-[#030914] px-3 py-1.5 font-mono text-[11px] text-[#D5BD8B]"
                    >
                      Download {att.file_name}
                    </button>
                  ))}
                </div>
              )}

              <textarea
                rows={2}
                placeholder="Stage 2 review notes..."
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                className="w-full border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
              />

              <div className="flex flex-wrap gap-2 border-t border-[#263D59] pt-4">
                <button
                  type="button"
                  onClick={() => void handleDecision(selectedApp, 'accepted')}
                  className="border border-[#16A34A] bg-[#081A12] px-4 py-2 font-mono text-xs text-[#86EFAC] uppercase"
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => void handleDecision(selectedApp, 'waitlisted')}
                  className="border border-[#D97706] bg-[#1B1409] px-4 py-2 font-mono text-xs text-[#FCD34D] uppercase"
                >
                  Waitlist
                </button>
                <button
                  type="button"
                  onClick={() => void handleDecision(selectedApp, 'rejected')}
                  className="border border-[#DC2626] bg-[#1B0B10] px-4 py-2 font-mono text-xs text-[#FCA5A5] uppercase"
                >
                  Reject
                </button>
                {['accepted', 'rejected', 'waitlisted'].includes(selectedApp.status) && (
                  <>
                    <button
                      type="button"
                      onClick={() => void sendDecisionEmail(selectedApp, 'resend')}
                      className="border border-[#B89A62] bg-[#030914] px-3 py-2 font-mono text-xs text-[#D5BD8B] uppercase"
                    >
                      Send via Resend
                    </button>
                    <button
                      type="button"
                      onClick={() => void sendDecisionEmail(selectedApp, 'gmail_oauth')}
                      className="border border-[#263D59] bg-[#030914] px-3 py-2 font-mono text-xs text-[#E8E1D2] uppercase"
                    >
                      Send via Gmail
                    </button>
                  </>
                )}
                {selectedApp.status === 'accepted' && !['delegate', 'chair'].includes(selectedApp.application_type) && (
                  <button
                    type="button"
                    onClick={() => void issueSingleInvite(selectedApp.id)}
                    className="border border-[#D5BD8B] bg-[#030914] px-3 py-2 font-mono text-xs text-[#D5BD8B] uppercase"
                  >
                    Create Signup Link
                  </button>
                )}
              </div>

              {issuedInviteUrls[selectedApp.id] && (
                <p className="break-all border border-[#16A34A]/60 bg-[#081A12] p-2 font-mono text-[11px] text-[#86EFAC]">
                  {issuedInviteUrls[selectedApp.id]}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Override Modal */}
      {overrideTarget && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[80] flex items-center justify-center bg-[#030914]/90 p-4">
          <form onSubmit={handleOverride} className="w-full max-w-md space-y-4 border border-[#D97706] bg-[#071426] p-6">
            <h3 className="font-display text-2xl text-[#FCD34D]">Super Admin Decision Override</h3>
            <select
              value={overrideStatus}
              onChange={(e) => setOverrideStatus(e.target.value as ApplicationStatus)}
              className="w-full border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
            >
              <option value="accepted">accepted</option>
              <option value="rejected">rejected</option>
              <option value="waitlisted">waitlisted</option>
              <option value="pending">pending</option>
            </select>
            <textarea
              required
              minLength={8}
              placeholder="Mandatory override rationale (min 8 chars) *"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              className="w-full border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOverrideTarget(null)} className="px-3 py-1.5 font-mono text-xs text-[#E8E1D2]/70 uppercase">
                Cancel
              </button>
              <button type="submit" className="border border-[#D97706] bg-[#1B1409] px-4 py-1.5 font-mono text-xs text-[#FCD34D] uppercase">
                Confirm Override
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Stealth Spoof Modal */}
      {spoofTarget && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[80] flex items-center justify-center bg-[#030914]/90 p-4">
          <form onSubmit={handleSpoof} className="w-full max-w-md space-y-4 border border-[#B89A62] bg-[#071426] p-6">
            <h3 className="font-display text-2xl text-[#D5BD8B]">Stealth Decision Attribution</h3>
            <p className="font-sans text-xs text-[#E8E1D2]/70">
              Updates decision attribution silently without sending any email notification.
            </p>
            <select
              value={spoofStatus}
              onChange={(e) => setSpoofStatus(e.target.value as ApplicationStatus)}
              className="w-full border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
            >
              <option value="accepted">accepted</option>
              <option value="rejected">rejected</option>
              <option value="waitlisted">waitlisted</option>
              <option value="pending">Clear to Pending</option>
            </select>
            {spoofStatus !== 'pending' && (
              <select
                required
                value={spoofAdminId}
                onChange={(e) => setSpoofAdminId(e.target.value)}
                className="w-full border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
              >
                <option value="">Select Attributed Admin *</option>
                {spoofAdmins.map((adm) => (
                  <option key={adm.user_id} value={adm.user_id}>
                    {adm.full_name} ({adm.email})
                  </option>
                ))}
              </select>
            )}
            <textarea
              placeholder="Internal notes (optional)"
              value={spoofNotes}
              onChange={(e) => setSpoofNotes(e.target.value)}
              className="w-full border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setSpoofTarget(null)} className="px-3 py-1.5 font-mono text-xs text-[#E8E1D2]/70 uppercase">
                Cancel
              </button>
              <button type="submit" className="border border-[#B89A62] bg-[#030914] px-4 py-1.5 font-mono text-xs text-[#D5BD8B] uppercase">
                Apply Attribution
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteAppTarget)}
        title="Delete Conference Application"
        message={`Permanently delete ${deleteAppTarget?.applicant_name}'s record (${deleteAppTarget?.application_code})? This cannot be undone.`}
        confirmLabel="Delete Permanently"
        destructive
        onCancel={() => setDeleteAppTarget(null)}
        onConfirm={() => void handleDeleteApp()}
      />
    </DashboardShell>
  );
};
