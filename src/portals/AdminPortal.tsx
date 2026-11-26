import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  ClipboardCheck,
  Download,
  ExternalLink,
  FileText,
  FlaskConical,
  Globe,
  KeyRound,
  Mail,
  MessageSquare,
  QrCode,
  Search,
  Shield,
  Sliders,
  Trash2,
  UserPlus,
  Users,
  X,
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
import { LiveQrScannerWorkspace } from './ScannerAndPassPages';
import { AccountManagementPanel } from './AccountManagementPanel';
import { formatApplicationAnswersForReview } from '../shared/intake';
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

type BulkRosterRow = {
  email: string;
  full_name: string;
  role: string;
  department_slug: string;
  gender: string;
  title: string;
  eb_rank: string;
};

function parseBulkRosterCsv(source: string): BulkRosterRow[] {
  const records: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === '"' && quoted && source[i + 1] === '"') {
      cell += '"'; i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell.trim()); cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(cell.trim()); cell = '';
      if (row.some((value) => value)) records.push(row);
      row = [];
    } else {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some((value) => value)) records.push(row);
  if (records.length < 2) return [];

  const headers = records[0].map((value) => value.toLowerCase().replace(/[\\s-]+/g, '_'));
  const pick = (record: string[], keys: string[]) => {
    const index = headers.findIndex((header) => keys.includes(header));
    return index >= 0 ? (record[index] ?? '').trim() : '';
  };
  return records.slice(1).map((record) => ({
    email: pick(record, ['email', 'email_address']),
    full_name: pick(record, ['full_name', 'name', 'full name']),
    role: pick(record, ['role', 'account_role']) || 'staff',
    department_slug: pick(record, ['department_slug', 'department']),
    gender: pick(record, ['gender', 'division']),
    title: pick(record, ['title', 'position']),
    eb_rank: pick(record, ['eb_rank', 'rank']),
  }));
}

export const AdminPortal: React.FC<{ isSuperAdminRoute: boolean }> = ({
  isSuperAdminRoute,
}) => {
  const {
    effectiveActor,
    departments,
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
  const [certPreview, setCertPreview] = useState<{
    fileName: string;
    mimeType: string;
    url: string;
  } | null>(null);

  // Account creation form
  const [newAccEmail, setNewAccEmail] = useState('');
  const [newAccName, setNewAccName] = useState('');
  const [newAccRole, setNewAccRole] = useState<UserRole>('department_head');
  const [newAccDept, setNewAccDept] = useState('volunteers');
  const [newAccGender, setNewAccGender] = useState<GenderSection>('male');
  const [newAccPassword, setNewAccPassword] = useState('');
  const [newAccPerms, setNewAccPerms] = useState<Partial<Record<PermissionKey, boolean>>>({});
  const [lastSetupLink, setLastSetupLink] = useState('');
  const [bulkRosterText, setBulkRosterText] = useState('');
  const [bulkRosterRows, setBulkRosterRows] = useState<BulkRosterRow[]>([]);
  const [bulkImportResults, setBulkImportResults] = useState<Array<{
    row: number; email: string; full_name: string; status: 'created' | 'skipped' | 'failed';
    setupLink?: string; reason?: string;
  }>>([]);
  const [bulkImporting, setBulkImporting] = useState(false);

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
  const acceptedCount = apps.filter((a) => a.status === 'accepted').length;
  const pendingStage2Count = apps.filter((a) =>
    ['pending', 'received', 'under_review'].includes(a.status)
  ).length;
  const waitlistedCount = apps.filter((a) => a.status === 'waitlisted').length;
  const rejectedCount = apps.filter((a) => a.status === 'rejected').length;
  const insideVenueCount = qrPasses.filter((p) => p.inside).length;
  const tableRows = activeTab === 'recommendations' ? recommendedApps : filteredApps;

  return (
    <DashboardShell
      portalLabel={isSuperAdminRoute || isSuper ? 'Super Admin Control' : 'Admin Secretariat'}
      breadcrumbSection={navItems.find((n) => n.id === activeTab)?.label || 'Overview'}
      departmentTheme="secretariat"
      navItems={navItems}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      actions={
        <button
          type="button"
          onClick={() => navigate('/preview?preview=1')}
          className="portal-btn-secondary hidden py-1.5 text-[10px] sm:inline-flex"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          <span>Live Site Preview</span>
        </button>
      }
    >
      {loading ? (
        <LoadingSkeleton rows={6} />
      ) : (
        <>
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <PortalPageHeader
                kicker={isSuper ? 'Secretariat Command · Supreme Governance' : 'Secretariat Command'}
                title="Secretariat Command & Analytics"
                subtitle="Admissions velocity, Stage 2 adjudication backlog, credentialed attendance, and conference track allocation."
                actions={
                  <button
                    type="button"
                    onClick={exportApplicationsCsv}
                    className="portal-btn-primary"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Export CSV</span>
                  </button>
                }
              />

              <MetricLedger
                items={[
                  {
                    label: 'Total Applications',
                    value: apps.length,
                    detail: `${recommendedApps.length} with head recs`,
                  },
                  {
                    label: 'Accepted',
                    value: acceptedCount,
                    detail: apps.length
                      ? `${Math.round((acceptedCount / apps.length) * 100)}% acceptance rate`
                      : 'Awaiting admissions',
                    accent: 'green',
                  },
                  {
                    label: 'Pending Stage 2 Review',
                    value: pendingStage2Count,
                    detail: `${waitlistedCount} waitlisted`,
                    accent: 'amber',
                  },
                  {
                    label: 'Inside Venue (QR)',
                    value: `${insideVenueCount} / ${qrPasses.length}`,
                    detail: 'Active credentials on floor',
                    accent: 'gold',
                  },
                ]}
              />

              <ProportionalDistributionBar
                title="Admissions Pipeline Distribution"
                segments={[
                  { label: 'Accepted', value: acceptedCount, color: '#86EFAC' },
                  { label: 'Pending Review', value: pendingStage2Count, color: '#D5BD8B' },
                  { label: 'Waitlisted', value: waitlistedCount, color: '#FCD34D' },
                  { label: 'Rejected', value: rejectedCount, color: '#FCA5A5' },
                ]}
              />

              <div className="portal-surface">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#263D59]/55 px-5 py-3.5">
                  <p className="font-mono text-[10px] tracking-[0.2em] text-[#B89A62] uppercase">
                    Track Distribution Matrix
                  </p>
                  <p className="font-mono text-[11px] tabular-nums text-[#E8E1D2]/55">
                    6 Conference Tracks
                  </p>
                </div>
                <div className="grid divide-y divide-[#263D59]/45 sm:grid-cols-3 sm:divide-x sm:divide-y-0 lg:grid-cols-6">
                  {(['delegate', 'chair', 'media', 'press', 'security', 'volunteers'] as const).map(
                    (t) => {
                      const count = apps.filter((a) => a.application_type === t).length;
                      const pct = apps.length > 0 ? Math.round((count / apps.length) * 100) : 0;
                      return (
                        <div key={t} className="p-4">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="font-mono text-[10px] tracking-[0.16em] text-[#B89A62] uppercase">
                              {t}
                            </p>
                            <span className="font-mono text-[10px] tabular-nums text-[#E8E1D2]/45">
                              {pct}%
                            </span>
                          </div>
                          <p className="mt-2 font-display text-3xl font-normal tabular-nums text-[#F3EDE0]">
                            {count}
                          </p>
                          <div className="mt-3 h-1 w-full bg-[#030914]">
                            <div
                              className="h-full bg-[#D5BD8B] transition-[width] duration-300"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              </div>
            </div>
          )}

          {(activeTab === 'applications' || activeTab === 'recommendations') && (
            <div className="space-y-6">
              <PortalPageHeader
                kicker={
                  activeTab === 'recommendations'
                    ? 'Stage 1 -> Stage 2 Hand-Off'
                    : 'Conference Admissions Registry'
                }
                title={
                  activeTab === 'recommendations'
                    ? `Head Recommendations Queue (${recommendedApps.length})`
                    : 'All Conference Applications'
                }
                subtitle={
                  activeTab === 'recommendations'
                    ? 'Applicants carrying Department Head recommendations queued for final Secretariat adjudication.'
                    : 'Inspect dossiers, record Stage 2 decisions, dispatch credentials, and manage non-expiring staff signup links.'
                }
                actions={
                  batchSelectedIds.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => void issueBatchInvites()}
                      className="portal-btn-primary"
                    >
                      Create Batch Signup Links ({batchSelectedIds.length})
                    </button>
                  ) : undefined
                }
              />

              {activeTab === 'applications' && (
                <div className="portal-surface grid gap-3 p-4 sm:grid-cols-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-[#B89A62]/75" />
                    <input
                      placeholder="Search applicant name, email, code..."
                      value={appSearch}
                      onChange={(e) => setAppSearch(e.target.value)}
                      className="portal-input pl-9"
                    />
                  </div>
                  <select
                    value={appFilterType}
                    onChange={(e) => setAppFilterType(e.target.value)}
                    className="portal-select"
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
                    className="portal-select"
                  >
                    <option value="all">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="accepted">Accepted</option>
                    <option value="waitlisted">Waitlisted</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              )}

              {Object.keys(issuedInviteUrls).length > 0 && (
                <div className="portal-surface-editorial p-4">
                  <p className="font-mono text-[10px] tracking-[0.18em] text-[#86EFAC] uppercase">
                    Issued Non-Expiring Signup Links ({Object.keys(issuedInviteUrls).length})
                  </p>
                  <div className="mt-2 space-y-1.5 font-mono text-[11px] text-[#E8E1D2]/85">
                    {Object.entries(issuedInviteUrls).map(([id, link]) => {
                      const holder = apps.find((x) => x.id === id);
                      return (
                        <div key={id} className="flex flex-wrap items-center justify-between gap-2 break-all border-b border-[#263D59]/35 pb-1.5 last:border-b-0 last:pb-0">
                          <span className="text-[#D5BD8B]">
                            {holder?.applicant_name || id}:
                          </span>
                          <span>{link}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {tableRows.length === 0 ? (
                <EmptyState
                  title="No Applications Matching Filter"
                  description="Submitted applications from the public portal and Registration modal will appear here."
                />
              ) : (
                <AccountManagementPanel
                accounts={accounts}
                departments={departments}
                isSuperAdmin={isSuper}
                onReload={loadAll}
                onSetupLink={(url) => setLastSetupLink(url)}
              />

              {violations.length > 0 && (
                <div className="border border-[#DC2626]/45 bg-[#12070B]/80">
                  <div className="border-b border-[#DC2626]/30 px-5 py-3">
                    <p className="font-mono text-[10px] tracking-[0.18em] text-[#FCA5A5] uppercase">
                      Security Portal Violation Audit ({violations.length})
                    </p>
                  </div>
                  <div className="max-h-48 divide-y divide-[#DC2626]/20 overflow-y-auto font-mono text-[11px] text-[#E8E1D2]/75">
                    {violations.map((v) => (
                      <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
                        <span>
                          {v.attempted_email} → {v.portal_attempted} ({v.reason})
                        </span>
                        <span className="tabular-nums text-[#E8E1D2]/45">
                          {new Date(v.created_at).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'test_mode' && isSuper && (
            <div className="space-y-6">
              <PortalPageHeader
                kicker="Super IT Diagnostics"
                title="Super IT Test Mode Launcher"
                subtitle="Impersonate any Department Head with server-clamped privileges (department_head role only, Super Admin bypass disabled inside test session) and immutable audit logging."
              />

              <div className="portal-surface-editorial p-6">
                <p className="font-mono text-[10px] tracking-[0.2em] text-[#D5BD8B] uppercase">
                  Target Scoped Department Session
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <select
                    value={testDept}
                    onChange={(e) => setTestDept(e.target.value)}
                    className="portal-select py-2.5 text-sm"
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
                      className="portal-select py-2.5 text-sm"
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
                    className="portal-btn-primary py-2.5"
                  >
                    Enter Scoped Head Portal
                  </button>
                </div>
              </div>

              <div className="portal-surface">
                <div className="border-b border-[#263D59]/55 px-5 py-3">
                  <p className="font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                    Test Mode Audit Log ({testLogs.length})
                  </p>
                </div>
                {testLogs.length === 0 ? (
                  <p className="px-5 py-6 font-mono text-xs text-[#E8E1D2]/50">
                    No test mode sessions recorded yet.
                  </p>
                ) : (
                  <div className="divide-y divide-[#263D59]/45 font-mono text-xs text-[#E8E1D2]/80">
                    {testLogs.map((l) => (
                      <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                        <span>
                          {l.actor_email} · {l.action} · {l.department_slug}{' '}
                          {l.section ? `(${l.section})` : ''}
                        </span>
                        <span className="tabular-nums text-[#E8E1D2]/45">
                          {new Date(l.created_at).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'spoof_audit' && isSuper && (
            <div className="space-y-6">
              <PortalPageHeader
                kicker="Super Admin Governance Ledger"
                title="Decision Overrides & Stealth Attribution Audit"
                subtitle="Immutable history of formal administrative overrides and silent Stage 2 decision attributions."
              />

              {spoofLogs.length === 0 ? (
                <EmptyState
                  title="No Overrides Recorded"
                  description="Super Admin overrides and stealth spoof attributions are permanently audited here."
                />
              ) : (
                <div className="portal-surface divide-y divide-[#263D59]/45">
                  {spoofLogs.map((log) => (
                    <div key={log.id} className="px-5 py-4 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-[#F3EDE0]">
                          {log.applicant_name} ({log.application_code}) · {log.previous_status} →{' '}
                          {log.new_status}
                        </span>
                        <StatusLabel
                          status={log.is_spoof ? 'Stealth Spoof' : 'Formal Override'}
                          tone={log.is_spoof ? 'gold' : 'amber'}
                        />
                      </div>
                      <p className="mt-1.5 font-mono text-[11px] text-[#E8E1D2]/65">
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
      {selectedApp &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            className="portal-app-shell wm-admin fixed inset-0 z-[75] flex items-center justify-center !bg-[#02060E]/88 p-4 backdrop-blur-sm"
            onClick={() => setSelectedApp(null)}
          >
            <div
              className="portal-modal-enter max-h-[90vh] w-full max-w-2xl overflow-y-auto border border-[#B89A62]/45 bg-[#061020] p-6 shadow-2xl shadow-black/60"
              onClick={(e) => e.stopPropagation()}
            >
            <div className="flex items-start justify-between gap-4 border-b border-[#263D59]/70 pb-4">
              <div>
                <p className="font-mono text-[10px] tracking-[0.2em] text-[#B89A62] uppercase">
                  {selectedApp.application_code} · {selectedApp.application_type}
                </p>
                <h2 className="mt-1 font-display text-3xl font-medium text-[#F3EDE0]">
                  {selectedApp.applicant_name}
                </h2>
              </div>
              <div className="flex items-center gap-3">
                <StatusLabel status={selectedApp.status} />
                <button
                  type="button"
                  onClick={() => setSelectedApp(null)}
                  aria-label="Close application dossier"
                  className="text-[#E8E1D2]/50 transition-colors hover:text-[#E8E1D2]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-5 space-y-4 font-sans text-xs text-[#E8E1D2]/85">
              <div className="grid divide-y divide-[#263D59]/45 border border-[#263D59]/60 bg-[#030914] sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                <div className="space-y-1.5 p-3.5">
                  <p>
                    <span className="font-mono text-[10px] text-[#B89A62] uppercase">Email: </span>
                    {selectedApp.email}
                  </p>
                  <p>
                    <span className="font-mono text-[10px] text-[#B89A62] uppercase">Phone: </span>
                    <span className="font-mono">{selectedApp.phone || 'N/A'}</span>
                  </p>
                  <p>
                    <span className="font-mono text-[10px] text-[#B89A62] uppercase">Emergency Contact: </span>
                    {selectedApp.emergency_phone || 'N/A'}
                  </p>
                  <p>
                    <span className="font-mono text-[10px] text-[#B89A62] uppercase">Gender / Division: </span>
                    <span className="capitalize">{selectedApp.gender || 'N/A'}</span>
                  </p>
                </div>
                <div className="space-y-1.5 p-3.5">
                  <p>
                    <span className="font-mono text-[10px] text-[#B89A62] uppercase">Birth Date / Age: </span>
                    <span className="font-mono">
                      {selectedApp.birth_date ? String(selectedApp.birth_date).slice(0, 10) : 'N/A'}
                      {selectedApp.age ? ` (${selectedApp.age})` : ''}
                    </span>
                  </p>
                  <p>
                    <span className="font-mono text-[10px] text-[#B89A62] uppercase">Grade: </span>
                    {selectedApp.grade_or_year || 'N/A'}
                  </p>
                  <p>
                    <span className="font-mono text-[10px] text-[#B89A62] uppercase">School: </span>
                    {selectedApp.institution || 'N/A'}
                  </p>
                  <p>
                    <span className="font-mono text-[10px] text-[#B89A62] uppercase">Target Role: </span>
                    {selectedApp.position || selectedApp.application_type}
                  </p>
                </div>
              </div>

              {selectedApp.experience && (
                <div className="border border-[#263D59]/60 bg-[#030914] p-4">
                  <p className="font-mono text-[10px] tracking-[0.16em] text-[#B89A62] uppercase">
                    Previous Experiences
                  </p>
                  <p className="mt-1.5 whitespace-pre-wrap leading-relaxed text-[#E8E1D2]/85">
                    {selectedApp.experience}
                  </p>
                </div>
              )}

              {selectedApp.statement && (
                <div className="border border-[#263D59]/60 bg-[#030914] p-4">
                  <p className="font-mono text-[10px] tracking-[0.16em] text-[#B89A62] uppercase">
                    Statement
                  </p>
                  <p className="mt-1.5 whitespace-pre-wrap leading-relaxed text-[#E8E1D2]/85">
                    {selectedApp.statement}
                  </p>
                </div>
              )}

              {(() => {
                const formatted = formatApplicationAnswersForReview(selectedApp, { includeMedical: true });
                if (formatted.length === 0) return null;
                return (
                  <div className="space-y-2.5 border border-[#263D59]/60 bg-[#030914] p-4">
                    <p className="font-mono text-[10px] tracking-[0.16em] text-[#B89A62] uppercase">
                      Department Application Responses ({formatted.length})
                    </p>
                    <div className="divide-y divide-[#263D59]/45">
                      {formatted.map((item) => (
                        <div key={item.id} className="py-2.5 first:pt-0 last:pb-0">
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

              {selectedApp.medical_has_conditions !== undefined && (
                <div className="border border-[#DC2626]/45 bg-[#12070B] p-4">
                  <p className="font-mono text-[10px] tracking-[0.16em] text-[#FCA5A5] uppercase">
                    Confidential Medical Disclosure (Admin Only)
                  </p>
                  <p className="mt-1.5 leading-relaxed text-[#E8E1D2]/90">
                    {selectedApp.medical_has_conditions
                      ? selectedApp.medical_details || 'Flagged without additional text.'
                      : 'No medical conditions disclosed.'}
                  </p>
                </div>
              )}

              {Array.isArray(selectedApp.attachments) && selectedApp.attachments.length > 0 && (
                <div className="space-y-2">
                  <p className="font-mono text-[10px] tracking-[0.16em] text-[#B89A62] uppercase">
                    Uploaded Certificates &amp; Attachments ({selectedApp.attachments.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedApp.attachments.map((att) => (
                      <button
                        key={att.id}
                        type="button"
                        onClick={async () => {
                          try {
                            const r = await apiRequest<{ signedUrl: string }>(
                              `/api/applications/${selectedApp.id}/sign-attachment`,
                              { method: 'POST', body: { storage_key: att.storage_key } }
                            );
                            setCertPreview({
                              fileName: att.file_name,
                              mimeType: att.mime_type,
                              url: r.signedUrl,
                            });
                          } catch (err) {
                            addToast(err instanceof Error ? err.message : 'Unable to open certificate.', 'error');
                          }
                        }}
                        className="portal-btn-secondary py-1.5 text-[11px]"
                      >
                        <Download className="h-3 w-3" />
                        <span>
                          {att.file_name} ({Math.max(1, Math.round((att.size_bytes || 0) / 1024))} KB)
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1.5 block font-mono text-[10px] tracking-[0.16em] text-[#B89A62] uppercase">
                  Stage 2 Review Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Optional review notes for record..."
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  className="portal-textarea"
                />
              </div>

              <div className="flex flex-wrap gap-2 border-t border-[#263D59]/60 pt-4">
                <button
                  type="button"
                  onClick={() => void handleDecision(selectedApp, 'accepted')}
                  className="inline-flex items-center border border-[#16A34A]/70 bg-[#05130D] px-4 py-2 font-mono text-[11px] tracking-[0.13em] text-[#86EFAC] uppercase whitespace-nowrap shrink-0 transition-colors hover:border-[#86EFAC]"
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => void handleDecision(selectedApp, 'waitlisted')}
                  className="inline-flex items-center border border-[#D97706]/70 bg-[#161006] px-4 py-2 font-mono text-[11px] tracking-[0.13em] text-[#FCD34D] uppercase whitespace-nowrap shrink-0 transition-colors hover:border-[#FCD34D]"
                >
                  Waitlist
                </button>
                <button
                  type="button"
                  onClick={() => void handleDecision(selectedApp, 'rejected')}
                  className="portal-btn-danger"
                >
                  Reject
                </button>
                {['accepted', 'rejected', 'waitlisted'].includes(selectedApp.status) && (
                  <>
                    <button
                      type="button"
                      onClick={() => void sendDecisionEmail(selectedApp, 'resend')}
                      className="portal-btn-primary"
                    >
                      Send via Resend
                    </button>
                    <button
                      type="button"
                      onClick={() => void sendDecisionEmail(selectedApp, 'gmail_oauth')}
                      className="portal-btn-secondary"
                    >
                      Send via Gmail
                    </button>
                  </>
                )}
                {selectedApp.status === 'accepted' && !['delegate', 'chair'].includes(selectedApp.application_type) && (
                  <button
                    type="button"
                    onClick={() => void issueSingleInvite(selectedApp.id)}
                    className="portal-btn-primary"
                  >
                    Create Signup Link
                  </button>
                )}
              </div>

              {issuedInviteUrls[selectedApp.id] && (
                <p className="break-all border border-[#16A34A]/55 bg-[#05130D] p-3 font-mono text-[11px] text-[#86EFAC]">
                  {issuedInviteUrls[selectedApp.id]}
                </p>
              )}
            </div>
            </div>
          </div>,
          document.body
        )}

      {/* Override Modal */}
      {overrideTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[#02060E]/88 p-4 backdrop-blur-sm"
          onClick={() => setOverrideTarget(null)}
        >
          <form
            onSubmit={handleOverride}
            onClick={(e) => e.stopPropagation()}
            className="portal-modal-enter w-full max-w-md space-y-4 border border-[#D97706]/65 bg-[#061020] p-6 shadow-2xl shadow-black/60"
          >
            <div>
              <p className="font-mono text-[10px] tracking-[0.2em] text-[#FCD34D] uppercase">
                Audited Status Correction
              </p>
              <h3 className="mt-1 font-display text-2xl font-medium text-[#F3EDE0]">
                Super Admin Decision Override
              </h3>
            </div>
            <select
              value={overrideStatus}
              onChange={(e) => setOverrideStatus(e.target.value as ApplicationStatus)}
              className="portal-select"
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
              className="portal-textarea"
            />
            <div className="flex justify-end gap-2.5 border-t border-[#263D59]/60 pt-4">
              <button
                type="button"
                onClick={() => setOverrideTarget(null)}
                className="portal-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center border border-[#D97706]/70 bg-[#161006] px-4 py-2 font-mono text-[11px] tracking-[0.13em] text-[#FCD34D] uppercase whitespace-nowrap shrink-0 transition-colors hover:border-[#FCD34D]"
              >
                Confirm Override
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Stealth Spoof Modal */}
      {spoofTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[#02060E]/88 p-4 backdrop-blur-sm"
          onClick={() => setSpoofTarget(null)}
        >
          <form
            onSubmit={handleSpoof}
            onClick={(e) => e.stopPropagation()}
            className="portal-modal-enter w-full max-w-md space-y-4 border border-[#B89A62]/55 bg-[#061020] p-6 shadow-2xl shadow-black/60"
          >
            <div>
              <p className="font-mono text-[10px] tracking-[0.2em] text-[#B89A62] uppercase">
                Silent Governance Attribution
              </p>
              <h3 className="mt-1 font-display text-2xl font-medium text-[#F3EDE0]">
                Stealth Decision Attribution
              </h3>
            </div>
            <p className="font-sans text-xs leading-relaxed text-[#E8E1D2]/70">
              Updates decision attribution silently without sending any email notification.
            </p>
            <select
              value={spoofStatus}
              onChange={(e) => setSpoofStatus(e.target.value as ApplicationStatus)}
              className="portal-select"
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
                className="portal-select"
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
              className="portal-textarea"
            />
            <div className="flex justify-end gap-2.5 border-t border-[#263D59]/60 pt-4">
              <button
                type="button"
                onClick={() => setSpoofTarget(null)}
                className="portal-btn-secondary"
              >
                Cancel
              </button>
              <button type="submit" className="portal-btn-primary">
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
                    <Download className="h-3 w-3" />
                    <span>Download</span>
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
