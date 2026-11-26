import React, { useMemo, useState } from 'react';
import {
  Edit3,
  FlaskConical,
  KeyRound,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { apiRequest } from '../client/api';
import { useAuth } from '../client/AuthContext';
import { useToast, StatusLabel } from '../client/components/UiPrimitives';
import {
  ALL_PERMISSION_KEYS,
  SUPER_ADMIN_ONLY_KEYS,
  isSectionedDepartment,
  resolveUserPermissions,
} from '../shared/permissions';
import type {
  DepartmentRecord,
  GenderSection,
  PermissionKey,
  UserProfile,
  UserRole,
} from '../shared/types';

interface AccountManagementPanelProps {
  accounts: UserProfile[];
  departments: DepartmentRecord[];
  isSuperAdmin: boolean;
  onReload: () => Promise<void>;
  onSetupLink: (url: string) => void;
}

type EditableRole = Exclude<UserRole, 'super_admin'>;

interface AccountDraft {
  fullName: string;
  email: string;
  role: EditableRole;
  departmentSlug: string;
  gender: GenderSection | '';
  title: string;
  ebRank: 'head' | 'co_head' | 'member' | 'designer' | 'marketing';
  isActive: boolean;
  permissions: Partial<Record<PermissionKey, boolean>>;
}

const ROLE_LABELS: Record<EditableRole, string> = {
  admin: 'Admin',
  department_head: 'Department Head',
  executive_board: 'Executive Board',
  staff: 'Staff Member',
};

const LOCKED_HEAD_KEYS = new Set<PermissionKey>([
  'applications.review',
  'applications.override',
  'applications.spoof',
  'applications.delete',
  'applications.view_confidential',
  'qr.reset_all',
]);

const PERMISSION_GROUPS: Array<{ title: string; prefixes: string[] }> = [
  { title: 'Overview & Reporting', prefixes: ['overview', 'analytics', 'reports'] },
  { title: 'Applications', prefixes: ['applications'] },
  { title: 'Departments & Operations', prefixes: ['departments', 'roles', 'groups', 'shifts', 'eb'] },
  { title: 'QR & Attendance', prefixes: ['qr'] },
  { title: 'Content & Website', prefixes: ['cms'] },
  { title: 'Communications', prefixes: ['emails', 'inquiries', 'forms'] },
  { title: 'Accounts & Governance', prefixes: ['accounts', 'permissions', 'testing'] },
];

function roleBaseline(
  account: UserProfile,
  role: EditableRole,
  departmentSlug: string,
  gender: GenderSection | null,
  departments: DepartmentRecord[]
): Record<PermissionKey, boolean> {
  return resolveUserPermissions(
    {
      ...account,
      role,
      department_slug: departmentSlug || null,
      department_id: departments.find((d) => d.slug === departmentSlug)?.id ?? null,
      gender,
      division: gender,
      permissions: {},
      is_active: true,
    },
    departments
  );
}

function permissionLabel(key: PermissionKey): string {
  return key
    .replace('.', ' · ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export const AccountManagementPanel: React.FC<AccountManagementPanelProps> = ({
  accounts,
  departments,
  isSuperAdmin,
  onReload,
  onSetupLink,
}) => {
  const { launchAndEnterAccountTestMode, testSession } = useAuth();
  const { addToast } = useToast();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<UserProfile | null>(null);
  const [draft, setDraft] = useState<AccountDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');

  const filteredAccounts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return accounts;
    return accounts.filter((account) =>
      [
        account.full_name,
        account.email,
        account.role,
        account.title,
        account.department_slug || '',
      ].join(' ').toLowerCase().includes(query)
    );
  }, [accounts, search]);

  const startEdit = (account: UserProfile) => {
    if (account.role === 'super_admin' || account.is_primary_super_admin) return;
    const permissions = resolveUserPermissions({ ...account, is_active: true }, departments);
    setEditing(account);
    setDraft({
      fullName: account.full_name,
      email: account.email,
      role: account.role as EditableRole,
      departmentSlug: account.department_slug || '',
      gender: account.gender || account.division || '',
      title: account.title || '',
      ebRank: account.eb_rank || 'member',
      isActive: account.is_active,
      permissions: { ...permissions },
    });
  };

  const closeEditor = () => {
    if (saving) return;
    setEditing(null);
    setDraft(null);
  };

  const updateDraft = (patch: Partial<AccountDraft>) => {
    setDraft((current) => current ? { ...current, ...patch } : current);
  };

  const changeRole = (role: EditableRole) => {
    if (!editing || !draft) return;
    const departmentSlug = role === 'admin' ? '' : draft.departmentSlug;
    const baseline = roleBaseline(
      editing,
      role,
      departmentSlug,
      draft.gender || null,
      departments
    );
    updateDraft({
      role,
      departmentSlug,
      permissions: { ...baseline },
      ebRank: role === 'executive_board' ? draft.ebRank : 'member',
    });
  };

  const restricted = (key: PermissionKey): boolean => {
    if (!draft) return true;
    if (SUPER_ADMIN_ONLY_KEYS.has(key)) return true;
    if (
      (draft.role === 'department_head' || draft.role === 'executive_board') &&
      LOCKED_HEAD_KEYS.has(key)
    ) return true;
    if (
      (draft.role === 'department_head' || draft.role === 'executive_board') &&
      !['media_press', 'security', 'volunteers'].includes(draft.departmentSlug) &&
      (key === 'applications.view' || key === 'applications.recommend')
    ) return true;
    return false;
  };

  const saveAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing || !draft) return;
    if (!draft.fullName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) {
      addToast('Enter a valid name and email address.', 'error');
      return;
    }
    if (draft.role !== 'admin' && !draft.departmentSlug) {
      addToast('Select a department for this account role.', 'error');
      return;
    }
    if (
      (draft.role === 'department_head' || draft.role === 'executive_board') &&
      isSectionedDepartment(draft.departmentSlug) &&
      !draft.gender
    ) {
      addToast('Select a male or female section for this department head.', 'error');
      return;
    }

    const cleanPermissions: Partial<Record<PermissionKey, boolean>> = {};
    for (const key of ALL_PERMISSION_KEYS) {
      if (!SUPER_ADMIN_ONLY_KEYS.has(key)) {
        cleanPermissions[key] = Boolean(draft.permissions[key]);
      }
    }
    const ebPermissions = {
      ...(editing.eb_permissions || {}),
      manage_department:
        draft.role === 'executive_board'
          ? draft.ebRank === 'head' || draft.ebRank === 'co_head' || Boolean(cleanPermissions['departments.manage_records'])
          : Boolean(editing.eb_permissions?.manage_department),
      manage_committees: Boolean(cleanPermissions['cms.committees']),
      scan_qr: Boolean(cleanPermissions['qr.scan']),
    };

    setSaving(true);
    try {
      await apiRequest('/api/super-admin/accounts/' + editing.user_id, {
        method: 'PATCH',
        body: {
          full_name: draft.fullName.trim(),
          email: draft.email.trim().toLowerCase(),
          role: draft.role,
          department_slug: draft.role === 'admin' ? null : draft.departmentSlug,
          gender: draft.gender || null,
          division: draft.gender || null,
          title: draft.title.trim(),
          is_active: draft.isActive,
          eb_rank: draft.role === 'executive_board' ? draft.ebRank : null,
          eb_permissions: ebPermissions,
          permissions: cleanPermissions,
        },
      });
      addToast('Account and permissions updated.', 'success');
      setEditing(null);
      setDraft(null);
      await onReload();
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Could not update this account.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (account: UserProfile) => {
    if (account.role === 'super_admin' || account.is_primary_super_admin) return;
    setBusyId(account.user_id);
    try {
      await apiRequest('/api/super-admin/accounts/' + account.user_id, {
        method: 'PATCH',
        body: { is_active: !account.is_active },
      });
      addToast(account.is_active ? 'Account suspended.' : 'Account reactivated.', 'success');
      await onReload();
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Account status update failed.', 'error');
    } finally {
      setBusyId('');
    }
  };

  const generateSetupLink = async (account: UserProfile) => {
    setBusyId(account.user_id);
    try {
      const result = await apiRequest<{ setupLink?: string }>(
        '/api/super-admin/accounts/' + account.user_id + '/reset-password',
        { method: 'POST', body: { send_setup_link: true } }
      );
      if (result.setupLink) {
        onSetupLink(window.location.origin + result.setupLink);
        addToast('Password setup link generated.', 'success');
      } else {
        addToast('The server did not return a setup link.', 'error');
      }
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Could not generate setup link.', 'error');
    } finally {
      setBusyId('');
    }
  };

  const deleteAccount = async (account: UserProfile) => {
    if (account.role === 'super_admin' || account.is_primary_super_admin) return;
    const confirmed = window.confirm(
      'Permanently delete ' + account.full_name + ' (' + account.email + ')? Related conference records will be preserved where possible.'
    );
    if (!confirmed) return;
    setBusyId(account.user_id);
    try {
      await apiRequest('/api/super-admin/accounts/' + account.user_id, { method: 'DELETE' });
      addToast('Account deleted.', 'success');
      await onReload();
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Account deletion failed.', 'error');
    } finally {
      setBusyId('');
    }
  };

  const signInAs = async (account: UserProfile) => {
    if (!account.is_active || !['department_head', 'executive_board'].includes(account.role)) return;
    try {
      await launchAndEnterAccountTestMode(account.user_id);
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Could not start Sign In As preview.', 'error');
    }
  };

  const activeCount = accounts.filter((account) => account.is_active).length;

  return (
    <>
      <section className="portal-surface space-y-4 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] tracking-[0.18em] text-[#83b5ed] uppercase">
              Identity & Access
            </p>
            <h3 className="mt-1 font-display text-2xl font-medium text-[#edf3fb]">
              Account Management
            </h3>
            <p className="mt-1 text-sm text-[#b8c8dc]/70">
              {accounts.length} accounts · {activeCount} active · individual permissions and access controls
            </p>
          </div>
          <label className="relative block w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9bb0c8]/55" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Find a person, email, or department"
              className="portal-input pl-9"
            />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left font-sans text-xs">
            <thead className="border-b border-[#263D59]/75 bg-[#040B18]/90 font-mono text-[10px] tracking-[0.16em] text-[#B89A62] uppercase">
              <tr>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3">Role & Department</th>
                <th className="px-4 py-3">Status</th>
                {isSuperAdmin && <th className="px-4 py-3 text-right">Account Controls</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#263D59]/45">
              {filteredAccounts.map((account) => {
                const protectedAccount = account.role === 'super_admin' || account.is_primary_super_admin;
                const canPreview = account.is_active &&
                  (account.role === 'department_head' || account.role === 'executive_board') &&
                  Boolean(account.department_slug);
                const busy = busyId === account.user_id;
                return (
                  <tr key={account.user_id} className="transition-colors hover:bg-[#040B18]/70">
                    <td className="px-4 py-3">
                      <p className="font-medium text-[#F3EDE0]">{account.full_name}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-[#E8E1D2]/58">{account.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusLabel status={account.role} tone="gold" />
                        {account.department_slug && (
                          <span className="font-mono text-[11px] text-[#E8E1D2]/70">
                            {account.department_slug}{account.gender ? ' (' + account.gender + ')' : ''}
                          </span>
                        )}
                      </div>
                      {account.title && <p className="mt-1 text-[10px] text-[#E8E1D2]/45">{account.title}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <StatusLabel status={account.is_active ? 'Active' : 'Suspended'} tone={account.is_active ? 'green' : 'red'} />
                    </td>
                    {isSuperAdmin && (
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {canPreview && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void signInAs(account)}
                              className="portal-btn-primary inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px]"
                            >
                              <FlaskConical className="h-3 w-3" />
                              Sign In As
                            </button>
                          )}
                          {!protectedAccount && (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => startEdit(account)}
                                className="portal-btn-secondary inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px]"
                              >
                                <Edit3 className="h-3 w-3" />
                                Edit & Permissions
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void generateSetupLink(account)}
                                className="portal-btn-secondary inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px]"
                              >
                                <KeyRound className="h-3 w-3" />
                                Setup Link
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void toggleActive(account)}
                                className="portal-btn-secondary px-2.5 py-1 text-[10px]"
                              >
                                {account.is_active ? 'Suspend' : 'Reactivate'}
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void deleteAccount(account)}
                                className="portal-btn-danger inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px]"
                              >
                                <Trash2 className="h-3 w-3" />
                                Delete
                              </button>
                            </>
                          )}
                          {protectedAccount && (
                            <span className="inline-flex items-center gap-1 font-mono text-[10px] text-[#9bb0c8]/55">
                              <ShieldCheck className="h-3 w-3" /> Protected
                            </span>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              {filteredAccounts.length === 0 && (
                <tr>
                  <td colSpan={isSuperAdmin ? 4 : 3} className="px-4 py-10 text-center font-mono text-xs text-[#b8c8dc]/60">
                    No matching accounts.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editing && draft && (
        <div
          className="fixed inset-0 z-[120] overflow-y-auto bg-[#02060E]/90 p-3 backdrop-blur-sm sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={'Edit account: ' + editing.full_name}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeEditor();
          }}
        >
          <form
            onSubmit={(event) => void saveAccount(event)}
            className="mx-auto my-4 w-full max-w-5xl border border-[#35506f] bg-[#071426] p-5 shadow-2xl shadow-black/70 sm:p-7"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#263D59]/70 pb-4">
              <div>
                <p className="font-mono text-[10px] tracking-[0.2em] text-[#B89A62] uppercase">
                  Super Admin · Identity & Permissions
                </p>
                <h2 className="mt-1 font-display text-2xl text-[#F3EDE0]">
                  Edit {editing.full_name}
                </h2>
                <p className="mt-1 font-mono text-[11px] text-[#9bb0c8]/60">
                  User ID: {editing.user_id}
                </p>
              </div>
              <button type="button" onClick={closeEditor} aria-label="Close editor" className="text-[#9bb0c8] hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-xs text-[#b8c8dc]">
                Full name
                <input required value={draft.fullName} onChange={(event) => updateDraft({ fullName: event.target.value })} className="portal-input mt-1.5" />
              </label>
              <label className="text-xs text-[#b8c8dc]">
                Email address
                <input required type="email" value={draft.email} onChange={(event) => updateDraft({ email: event.target.value })} className="portal-input mt-1.5" />
              </label>
              <label className="text-xs text-[#b8c8dc]">
                Account role
                <select value={draft.role} onChange={(event) => changeRole(event.target.value as EditableRole)} className="portal-select mt-1.5">
                  <option value="admin">Admin</option>
                  <option value="department_head">Department Head</option>
                  <option value="executive_board">Executive Board</option>
                  <option value="staff">Staff Member</option>
                </select>
              </label>
              <label className="text-xs text-[#b8c8dc]">
                Department
                <select
                  value={draft.departmentSlug}
                  disabled={draft.role === 'admin'}
                  onChange={(event) => updateDraft({ departmentSlug: event.target.value })}
                  className="portal-select mt-1.5 disabled:opacity-45"
                >
                  <option value="">Select department</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.slug}>{department.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-[#b8c8dc]">
                Division
                <select value={draft.gender} onChange={(event) => updateDraft({ gender: event.target.value as GenderSection | '' })} className="portal-select mt-1.5">
                  <option value="">Unrestricted / not assigned</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </label>
              <label className="text-xs text-[#b8c8dc]">
                Title / position
                <input value={draft.title} onChange={(event) => updateDraft({ title: event.target.value })} className="portal-input mt-1.5" />
              </label>
              {draft.role === 'executive_board' && (
                <label className="text-xs text-[#b8c8dc]">
                  Executive Board rank
                  <select value={draft.ebRank} onChange={(event) => updateDraft({ ebRank: event.target.value as AccountDraft['ebRank'] })} className="portal-select mt-1.5">
                    <option value="head">Head</option>
                    <option value="co_head">Co-Head</option>
                    <option value="member">Member</option>
                    <option value="designer">Designer</option>
                    <option value="marketing">Marketing</option>
                  </select>
                </label>
              )}
              <label className="flex items-center gap-2 pt-6 text-xs text-[#E8E1D2]">
                <input type="checkbox" checked={draft.isActive} onChange={(event) => updateDraft({ isActive: event.target.checked })} className="h-4 w-4 accent-[#83b5ed]" />
                Account active (can sign in)
              </label>
            </div>

            <div className="mt-6 border-t border-[#263D59]/65 pt-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="font-display text-xl text-[#edf3fb]">Individual Permission Overrides</h3>
                  <p className="mt-1 text-xs text-[#9bb0c8]/65">
                    These settings apply to this account only. Super Admin-only controls are never delegable.
                  </p>
                </div>
                <span className="font-mono text-[10px] text-[#B89A62]">
                  {ALL_PERMISSION_KEYS.filter((key) => !SUPER_ADMIN_ONLY_KEYS.has(key) && draft.permissions[key]).length} GRANTED
                </span>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {PERMISSION_GROUPS.map((group) => {
                  const keys = ALL_PERMISSION_KEYS.filter((key) =>
                    group.prefixes.includes(key.split('.')[0]) && !SUPER_ADMIN_ONLY_KEYS.has(key)
                  );
                  if (!keys.length) return null;
                  return (
                    <section key={group.title} className="border border-[#263D59]/70 bg-[#030C19]/65 p-4">
                      <h4 className="mb-3 font-mono text-[10px] tracking-[0.16em] text-[#D5BD8B] uppercase">{group.title}</h4>
                      <div className="space-y-2.5">
                        {keys.map((key) => {
                          const locked = restricted(key);
                          return (
                            <label key={key} className={'flex items-start justify-between gap-3 text-xs ' + (locked ? 'opacity-45' : 'text-[#DCE7F5]')}>
                              <span className="leading-5">{permissionLabel(key)}</span>
                              <input
                                type="checkbox"
                                checked={Boolean(draft.permissions[key])}
                                disabled={locked}
                                onChange={(event) => updateDraft({
                                  permissions: { ...draft.permissions, [key]: event.target.checked },
                                })}
                                className="mt-0.5 h-4 w-4 shrink-0 accent-[#83b5ed] disabled:cursor-not-allowed"
                              />
                            </label>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
              <p className="mt-3 text-[11px] leading-5 text-[#9bb0c8]/55">
                Some permissions are enforced by role and department rules. Those controls are displayed but locked so the editor cannot promise access the server will reject.
              </p>
            </div>

            {testSession && (
              <p className="mt-4 border border-amber-400/30 bg-amber-950/20 p-3 text-xs text-amber-100">
                Exit the active test session before saving account changes.
              </p>
            )}

            <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-[#263D59]/65 pt-4">
              <button type="button" onClick={closeEditor} disabled={saving} className="portal-btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={saving || Boolean(testSession)} className="portal-btn-primary min-w-32">
                {saving ? 'Saving…' : 'Save Account'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
};
