import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  Calendar,
  Copy,
  List,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import { apiRequest } from '../client/api';
import { useAuth } from '../client/AuthContext';
import {
  EmptyState,
  LoadingSkeleton,
  PortalPageHeader,
  StatusLabel,
  useToast,
} from '../client/components/UiPrimitives';

interface RosterMember {
  id: string;
  name: string;
  email: string;
  role?: string;
  application_type?: string;
  section?: string | null;
  position?: string | null;
}

interface DeptPosition {
  id: string;
  department: string;
  section: string | null;
  title: string;
  parent_position_id: string | null;
  member_user_id: string | null;
  member_name: string | null;
  member_email: string | null;
  notes: string | null;
}

interface DeptTask {
  id: string;
  position_id: string | null;
  assignee_name: string | null;
  assignee_email: string | null;
  title: string;
  description: string;
  priority: string;
  status: string;
  location: string | null;
  deadline: string | null;
}

export const OrgChartAndRolesView: React.FC<{
  departmentSlug?: string;
  readOnly?: boolean;
}> = ({ departmentSlug, readOnly = false }) => {
  const { addToast } = useToast();
  const [viewMode, setViewMode] = useState<'tree' | 'list'>('tree');
  const [loading, setLoading] = useState(true);
  const [positions, setPositions] = useState<DeptPosition[]>([]);
  const [tasks, setTasks] = useState<DeptTask[]>([]);
  const [logs, setLogs] = useState<
    Array<{ id: string; actor_name: string; action: string; created_at: string }>
  >([]);
  const [roster, setRoster] = useState<RosterMember[]>([]);

  const [posTitle, setPosTitle] = useState('');
  const [parentId, setParentId] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskAssigneeEmail, setTaskAssigneeEmail] = useState('');
  const [taskPriority, setTaskPriority] = useState('medium');

  const q = departmentSlug ? `?department=${encodeURIComponent(departmentSlug)}` : '';

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const rolesRes = await apiRequest<{
        positions: DeptPosition[];
        tasks: DeptTask[];
        logs: Array<{ id: string; actor_name: string; action: string; created_at: string }>;
      }>(`/api/departments/roles${q}`);
      setPositions(rolesRes.positions || []);
      setTasks(rolesRes.tasks || []);
      setLogs(rolesRes.logs || []);

      if (!readOnly) {
        const ros = await apiRequest<{
          acceptedApplicants: RosterMember[];
          activeMembers: RosterMember[];
        }>(`/api/departments/roster${q}`).catch(() => ({
          acceptedApplicants: [],
          activeMembers: [],
        }));
        const merged = [...(ros.activeMembers || []), ...(ros.acceptedApplicants || [])];
        setRoster(merged);
      }
    } catch {
      // Ignore if unseeded
    } finally {
      setLoading(false);
    }
  }, [q, readOnly]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const createPosition = async (e: React.FormEvent) => {
    e.preventDefault();
    const member = roster.find((m) => m.email.toLowerCase() === memberEmail.toLowerCase());
    try {
      await apiRequest('/api/departments/roles/positions', {
        method: 'POST',
        body: {
          department: departmentSlug,
          title: posTitle,
          parent_position_id: parentId || null,
          member_name: member?.name || null,
          member_email: member?.email || memberEmail || null,
        },
      });
      setPosTitle('');
      setParentId('');
      setMemberEmail('');
      addToast('Org position created.', 'success');
      await loadData();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Unable to create position.', 'error');
    }
  };

  const deletePosition = async (id: string) => {
    try {
      await apiRequest(`/api/departments/roles/positions/${id}`, { method: 'DELETE' });
      addToast('Position removed.', 'info');
      await loadData();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Delete failed.', 'error');
    }
  };

  const createTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const member = roster.find((m) => m.email.toLowerCase() === taskAssigneeEmail.toLowerCase());
    try {
      await apiRequest('/api/departments/roles/tasks', {
        method: 'POST',
        body: {
          department: departmentSlug,
          title: taskTitle,
          priority: taskPriority,
          assignee_name: member?.name || null,
          assignee_email: member?.email || taskAssigneeEmail || null,
        },
      });
      setTaskTitle('');
      addToast('Task assigned.', 'success');
      await loadData();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Unable to assign task.', 'error');
    }
  };

  const updateTaskStatus = async (id: string, status: string) => {
    try {
      await apiRequest(`/api/departments/roles/tasks/${id}`, {
        method: 'PATCH',
        body: { status },
      });
      await loadData();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Update failed.', 'error');
    }
  };

  const renderTreeNodes = (parent: string | null, depth = 0): React.ReactNode => {
    const children = positions.filter((p) => (p.parent_position_id || null) === parent);
    if (children.length === 0) return null;
    return (
      <div className={depth > 0 ? 'ml-6 border-l border-[#263D59]/75 pl-5 space-y-2.5' : 'space-y-3'}>
        {children.map((node) => (
          <div key={node.id} className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-3 border border-[#263D59]/65 bg-[#040B18] px-4 py-3 transition-colors hover:border-[#B89A62]/45">
              <div>
                <p className="font-sans text-sm font-medium text-[#E6D2A8]">{node.title}</p>
                <p className="mt-0.5 font-mono text-[11px] text-[#E8E1D2]/65">
                  {node.member_name || node.member_email || 'Vacant seat'}
                </p>
              </div>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => void deletePosition(node.id)}
                  className="text-[#FCA5A5]/70 transition-colors hover:text-[#FCA5A5]"
                  aria-label="Delete position"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {renderTreeNodes(node.id, depth + 1)}
          </div>
        ))}
      </div>
    );
  };

  if (loading) return <LoadingSkeleton rows={4} />;

  return (
    <div className="space-y-6">
      <PortalPageHeader
        kicker="Command Structure & Assignments"
        title={readOnly ? 'My Department Role & Tasks' : 'Visual Org Chart, Roles & Tasks'}
        subtitle="Define reporting seats across the directorate and coordinate operational deliverables."
        actions={
          <div className="flex border border-[#263D59] bg-[#040B18]">
            <button
              type="button"
              onClick={() => setViewMode('tree')}
              className={`px-3.5 py-2 font-mono text-[11px] uppercase whitespace-nowrap transition-colors ${
                viewMode === 'tree' ? 'bg-[#071426] text-[#D5BD8B]' : 'text-[#E8E1D2]/60 hover:text-[#E8E1D2]'
              }`}
            >
              Org Chart
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`border-l border-[#263D59] px-3.5 py-2 font-mono text-[11px] uppercase whitespace-nowrap transition-colors ${
                viewMode === 'list' ? 'bg-[#071426] text-[#D5BD8B]' : 'text-[#E8E1D2]/60 hover:text-[#E8E1D2]'
              }`}
            >
              List View
            </button>
          </div>
        }
      />

      {!readOnly && (
        <div className="grid divide-y divide-[#263D59]/60 border border-[#263D59]/65 bg-[#050E1C]/80 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          <form onSubmit={createPosition} className="space-y-3.5 p-5">
            <p className="font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
              Add Role Seat
            </p>
            <input
              required
              placeholder="Role Title (e.g. Gate Lead)"
              value={posTitle}
              onChange={(e) => setPosTitle(e.target.value)}
              className="portal-input"
            />
            <div className="grid gap-2.5 sm:grid-cols-2">
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className="portal-select"
              >
                <option value="">Top-Level Seat</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    Reports to: {p.title}
                  </option>
                ))}
              </select>
              <select
                value={memberEmail}
                onChange={(e) => setMemberEmail(e.target.value)}
                className="portal-select"
              >
                <option value="">Assign Member (Optional)</option>
                {roster.map((m) => (
                  <option key={`${m.id}-${m.email}`} value={m.email}>
                    {m.name} ({m.email})
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="portal-btn-primary">
              Add Position
            </button>
          </form>

          <form onSubmit={createTask} className="space-y-3.5 p-5">
            <p className="font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
              Assign Department Task
            </p>
            <input
              required
              placeholder="Task Title *"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              className="portal-input"
            />
            <div className="grid gap-2.5 sm:grid-cols-2">
              <select
                value={taskAssigneeEmail}
                onChange={(e) => setTaskAssigneeEmail(e.target.value)}
                className="portal-select"
              >
                <option value="">Select Assignee</option>
                {roster.map((m) => (
                  <option key={`t-${m.id}-${m.email}`} value={m.email}>
                    {m.name}
                  </option>
                ))}
              </select>
              <select
                value={taskPriority}
                onChange={(e) => setTaskPriority(e.target.value)}
                className="portal-select"
              >
                <option value="low">Low Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="high">High Priority</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <button type="submit" className="portal-btn-primary">
              Assign Task
            </button>
          </form>
        </div>
      )}

      <div className="border border-[#263D59]/65 bg-[#050E1C]/80 p-5">
        <p className="mb-4 font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
          Hierarchy ({positions.length})
        </p>
        {positions.length === 0 ? (
          <EmptyState
            title="No Roles Defined"
            description="Add top-level or nested positions above."
          />
        ) : viewMode === 'tree' ? (
          renderTreeNodes(null)
        ) : (
          <div className="divide-y divide-[#263D59]/45 border border-[#263D59]/55 bg-[#030914]">
            {positions.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between px-4 py-3 text-xs transition-colors hover:bg-[#071426]/65"
              >
                <span>
                  <strong className="text-[#D5BD8B]">{p.title}</strong>
                  <span className="mx-2 text-[#263D59]">·</span>
                  <span className="text-[#E8E1D2]/75">
                    {p.member_name || p.member_email || 'Vacant'}
                  </span>
                </span>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => void deletePosition(p.id)}
                    className="font-mono text-[10px] text-[#FCA5A5]/75 uppercase hover:text-[#FCA5A5]"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border border-[#263D59]/65 bg-[#050E1C]/80">
        <div className="border-b border-[#263D59]/55 px-5 py-3.5">
          <p className="font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
            Department Tasks ({tasks.length})
          </p>
        </div>
        {tasks.length === 0 ? (
          <p className="px-5 py-6 font-sans text-xs text-[#E8E1D2]/55">No tasks assigned yet.</p>
        ) : (
          <div className="divide-y divide-[#263D59]/45">
            {tasks.map((t) => (
              <div
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-xs transition-colors hover:bg-[#071426]/55"
              >
                <div>
                  <p className="font-medium text-[#F3EDE0]">{t.title}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-[#E8E1D2]/55">
                    {t.assignee_name || t.assignee_email || 'Unassigned'} · {t.priority}
                  </p>
                </div>
                <select
                  value={t.status}
                  onChange={(e) => void updateTaskStatus(t.id, e.target.value)}
                  className="portal-select w-40 py-1.5 font-mono text-[11px] text-[#D5BD8B]"
                >
                  <option value="not_started">Not Started</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            ))}
          </div>
        )}
      </div>

      {logs.length > 0 && (
        <div className="border border-[#263D59]/60 bg-[#050E1C]/75 p-5">
          <p className="mb-2.5 font-mono text-[10px] tracking-[0.16em] text-[#B89A62] uppercase">
            Task Activity Logs
          </p>
          <div className="max-h-36 space-y-1.5 overflow-y-auto font-mono text-[11px] tabular-nums text-[#E8E1D2]/65">
            {logs.map((l) => (
              <div key={l.id}>
                {new Date(l.created_at).toLocaleTimeString()} · {l.actor_name} · {l.action}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

interface TeamGroupRow {
  id: string;
  name: string;
  description: string;
  members: Array<{
    id: string;
    member_name: string;
    member_email: string;
    role_label: string;
  }>;
}

export const GroupManagementView: React.FC<{
  departmentSlug?: string;
  readOnly?: boolean;
}> = ({ departmentSlug, readOnly = false }) => {
  const { addToast } = useToast();
  const [groups, setGroups] = useState<TeamGroupRow[]>([]);
  const [roster, setRoster] = useState<RosterMember[]>([]);
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [loading, setLoading] = useState(true);

  const q = departmentSlug ? `?department=${encodeURIComponent(departmentSlug)}` : '';

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const gRes = await apiRequest<{ groups: TeamGroupRow[] }>(`/api/departments/groups${q}`);
      setGroups(gRes.groups || []);
      if (!readOnly) {
        const rRes = await apiRequest<{
          acceptedApplicants: RosterMember[];
          activeMembers: RosterMember[];
        }>(`/api/departments/roster${q}`).catch(() => ({
          acceptedApplicants: [],
          activeMembers: [],
        }));
        setRoster([...(rRes.activeMembers || []), ...(rRes.acceptedApplicants || [])]);
      }
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [q, readOnly]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    const members = roster
      .filter((m) => selectedEmails.includes(m.email))
      .map((m) => ({
        member_user_id: m.role ? m.id : null,
        member_application_id: m.application_type ? m.id : null,
        member_name: m.name,
        member_email: m.email,
        role_label: m.role || m.position || 'member',
      }));
    try {
      await apiRequest('/api/departments/groups', {
        method: 'POST',
        body: {
          department: departmentSlug,
          name: groupName,
          description: groupDesc,
          members,
        },
      });
      setGroupName('');
      setGroupDesc('');
      setSelectedEmails([]);
      addToast('Team group created.', 'success');
      await loadData();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Unable to create group.', 'error');
    }
  };

  const deleteGroup = async (id: string) => {
    try {
      await apiRequest(`/api/departments/groups/${id}`, { method: 'DELETE' });
      addToast('Group deleted.', 'info');
      await loadData();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Delete failed.', 'error');
    }
  };

  if (loading) return <LoadingSkeleton rows={3} />;

  return (
    <div className="space-y-6">
      <PortalPageHeader
        kicker="Squads & Rapid Rosters"
        title={readOnly ? 'My Custom Groups' : 'Custom Team Groups'}
        subtitle="Assemble specialized operational units for single-click shift deployment."
      />

      {!readOnly && (
        <form
          onSubmit={handleCreateGroup}
          className="space-y-4 border border-[#263D59]/65 bg-[#050E1C]/80 p-5"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              required
              placeholder="Group Name (e.g. Gate A Squad)"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="portal-input"
            />
            <input
              placeholder="Description"
              value={groupDesc}
              onChange={(e) => setGroupDesc(e.target.value)}
              className="portal-input"
            />
          </div>
          {roster.length > 0 && (
            <div>
              <p className="mb-2 font-mono text-[10px] tracking-[0.16em] text-[#B89A62] uppercase">
                Select Members ({selectedEmails.length} selected)
              </p>
              <div className="grid max-h-36 gap-1.5 overflow-y-auto border border-[#263D59]/55 bg-[#030914] p-3 sm:grid-cols-2">
                {roster.map((m) => {
                  const checked = selectedEmails.includes(m.email);
                  return (
                    <label key={`grp-${m.id}-${m.email}`} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setSelectedEmails((prev) =>
                            e.target.checked
                              ? [...prev, m.email]
                              : prev.filter((x) => x !== m.email)
                          )
                        }
                      />
                      <span className="truncate">{m.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          <button type="submit" className="portal-btn-primary">
            <Plus className="h-3.5 w-3.5 shrink-0" />
            <span>Create Group</span>
          </button>
        </form>
      )}

      {groups.length === 0 ? (
        <EmptyState
          title="No Groups Found"
          description="Create custom team squads for rapid shift assignment."
        />
      ) : (
        <div className="grid divide-y divide-[#263D59]/55 border border-[#263D59]/65 bg-[#050E1C]/80 md:grid-cols-2 md:divide-x">
          {groups.map((g) => (
            <div key={g.id} className="p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 font-display text-2xl text-[#F3EDE0]">
                    <Users className="h-4 w-4 text-[#B89A62]" />
                    <span>{g.name}</span>
                  </h3>
                  <p className="mt-1 font-sans text-xs text-[#E8E1D2]/60">{g.description}</p>
                </div>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => void deleteGroup(g.id)}
                    className="text-[#FCA5A5]/70 transition-colors hover:text-[#FCA5A5]"
                    aria-label="Delete group"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-[#263D59]/45 pt-3 font-mono text-[11px] text-[#D5BD8B]">
                {(g.members || []).length === 0 ? (
                  <span className="text-[#E8E1D2]/45">No members assigned</span>
                ) : (
                  g.members.map((m, i) => (
                    <React.Fragment key={m.id}>
                      {i > 0 && <span className="text-[#263D59]">·</span>}
                      <span>{m.member_name}</span>
                    </React.Fragment>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

interface ShiftRow {
  id: string;
  department: string;
  title: string;
  description: string;
  location: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  status: string;
  assignments: Array<{
    id: string;
    assignee_name: string;
    assignee_email: string;
    attendance_status: string;
    is_supervisor: boolean;
  }>;
}

export const ShiftManagementView: React.FC<{
  departmentSlug?: string;
  readOnly?: boolean;
}> = ({ departmentSlug, readOnly = false }) => {
  const { addToast } = useToast();
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('calendar');
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [groups, setGroups] = useState<TeamGroupRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [assignGroupId, setAssignGroupId] = useState<Record<string, string>>({});

  const q = departmentSlug ? `?department=${encodeURIComponent(departmentSlug)}` : '';

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, gRes] = await Promise.all([
        apiRequest<{ shifts: ShiftRow[] }>(`/api/departments/shifts${q}`),
        readOnly
          ? Promise.resolve({ groups: [] })
          : apiRequest<{ groups: TeamGroupRow[] }>(`/api/departments/groups${q}`).catch(() => ({
              groups: [],
            })),
      ]);
      setShifts(sRes.shifts || []);
      setGroups(gRes.groups || []);
    } catch {
      setShifts([]);
    } finally {
      setLoading(false);
    }
  }, [q, readOnly]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const createShift = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/departments/shifts', {
        method: 'POST',
        body: {
          department: departmentSlug,
          title,
          location,
          starts_at: new Date(startsAt).toISOString(),
          ends_at: new Date(endsAt).toISOString(),
        },
      });
      setTitle('');
      setLocation('');
      addToast('Shift created.', 'success');
      await loadData();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Unable to create shift.', 'error');
    }
  };

  const assignGroup = async (shiftId: string) => {
    const gid = assignGroupId[shiftId];
    if (!gid) return;
    try {
      const res = await apiRequest<{ added: number }>(`/api/departments/shifts/${shiftId}/assign-group`, {
        method: 'POST',
        body: { group_id: gid },
      });
      addToast(`Assigned ${res.added} group member(s) (overlap conflicts skipped).`, 'success');
      await loadData();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Assign failed.', 'error');
    }
  };

  const duplicateShift = async (s: ShiftRow) => {
    try {
      await apiRequest(`/api/departments/shifts/${s.id}/duplicate`, {
        method: 'POST',
        body: { copy_assignments: true },
      });
      addToast('Shift duplicated as draft.', 'success');
      await loadData();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Duplicate failed.', 'error');
    }
  };

  const updateAttendance = async (assignmentId: string, attendance_status: string) => {
    try {
      await apiRequest(`/api/departments/shifts/assignments/${assignmentId}`, {
        method: 'PATCH',
        body: { attendance_status },
      });
      await loadData();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Status update failed.', 'error');
    }
  };

  if (loading) return <LoadingSkeleton rows={4} />;

  const shiftsByDay = shifts.reduce<Record<string, ShiftRow[]>>((acc, s) => {
    const key = new Date(s.starts_at).toLocaleDateString();
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <PortalPageHeader
        kicker="Operational Deployment"
        title={readOnly ? 'My Shift Schedule' : 'Shift & Roster Management'}
        subtitle="Coordinate daily conference schedules with automated conflict detection and attendance states."
        actions={
          <div className="flex border border-[#263D59] bg-[#040B18]">
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 font-mono text-[11px] uppercase whitespace-nowrap transition-colors ${
                viewMode === 'calendar' ? 'bg-[#071426] text-[#D5BD8B]' : 'text-[#E8E1D2]/60 hover:text-[#E8E1D2]'
              }`}
            >
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              <span>Calendar</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`inline-flex items-center gap-1.5 border-l border-[#263D59] px-3.5 py-2 font-mono text-[11px] uppercase whitespace-nowrap transition-colors ${
                viewMode === 'list' ? 'bg-[#071426] text-[#D5BD8B]' : 'text-[#E8E1D2]/60 hover:text-[#E8E1D2]'
              }`}
            >
              <List className="h-3.5 w-3.5 shrink-0" />
              <span>List</span>
            </button>
          </div>
        }
      />

      {!readOnly && (
        <form
          onSubmit={createShift}
          className="grid gap-3 border border-[#263D59]/65 bg-[#050E1C]/80 p-5 sm:grid-cols-2 lg:grid-cols-5"
        >
          <input
            required
            placeholder="Shift Title *"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="portal-input"
          />
          <input
            placeholder="Station / Gate"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="portal-input"
          />
          <input
            required
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className="portal-input font-mono text-xs"
          />
          <input
            required
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className="portal-input font-mono text-xs"
          />
          <button type="submit" className="portal-btn-primary">
            Create Shift
          </button>
        </form>
      )}

      {shifts.length === 0 ? (
        <EmptyState
          title="No Shifts Scheduled"
          description="Create operational shifts and assign groups with overlap detection."
        />
      ) : viewMode === 'calendar' ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Object.entries(shiftsByDay).map(([day, dayShifts]) => (
            <div key={day} className="border border-[#263D59]/65 bg-[#050E1C]/80 p-5">
              <p className="border-b border-[#263D59]/55 pb-2.5 font-mono text-[11px] tracking-[0.14em] text-[#B89A62] uppercase tabular-nums">
                {day}
              </p>
              <div className="mt-3 divide-y divide-[#263D59]/45">
                {dayShifts.map((s) => (
                  <div key={s.id} className="py-3 text-xs first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-[#F3EDE0]">{s.title}</p>
                      <StatusLabel status={s.status} />
                    </div>
                    <p className="mt-1 font-mono text-[10px] tabular-nums text-[#D5BD8B]">
                      {new Date(s.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} –{' '}
                      {new Date(s.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ·{' '}
                      {s.location || 'TBD'}
                    </p>
                    <p className="mt-1 font-mono text-[10px] tabular-nums text-[#E8E1D2]/55">
                      Assigned: {(s.assignments || []).length}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="divide-y divide-[#263D59]/55 border border-[#263D59]/65 bg-[#050E1C]/80">
          {shifts.map((s) => (
            <div key={s.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="font-display text-xl text-[#F3EDE0]">{s.title}</h3>
                    <StatusLabel status={s.status} />
                  </div>
                  <p className="mt-1 font-mono text-xs tabular-nums text-[#D5BD8B]">
                    {new Date(s.starts_at).toLocaleString()} → {new Date(s.ends_at).toLocaleTimeString()} ·{' '}
                    {s.location || 'General'}
                  </p>
                </div>

                {!readOnly && (
                  <div className="flex flex-wrap items-center gap-2">
                    {groups.length > 0 && (
                      <div className="flex gap-1.5">
                        <select
                          value={assignGroupId[s.id] || ''}
                          onChange={(e) =>
                            setAssignGroupId((p) => ({ ...p, [s.id]: e.target.value }))
                          }
                          className="portal-select w-44 py-1.5 text-xs"
                        >
                          <option value="">Assign Group...</option>
                          {groups.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => void assignGroup(s.id)}
                          className="portal-btn-primary py-1.5 text-[10px]"
                        >
                          Add
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => void duplicateShift(s)}
                      className="portal-btn-secondary py-1.5 text-[10px]"
                    >
                      <Copy className="h-3 w-3 shrink-0" />
                      <span>Duplicate</span>
                    </button>
                  </div>
                )}
              </div>

              {(s.assignments || []).length > 0 && (
                <div className="mt-4 grid gap-2 border-t border-[#263D59]/45 pt-3.5 sm:grid-cols-2">
                  {s.assignments.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between border border-[#263D59]/50 bg-[#030914] px-3.5 py-2 text-xs"
                    >
                      <span className="text-[#E8E1D2]">{a.assignee_name}</span>
                      {readOnly ? (
                        <StatusLabel status={a.attendance_status} />
                      ) : (
                        <select
                          value={a.attendance_status}
                          onChange={(e) => void updateAttendance(a.id, e.target.value)}
                          className="portal-select w-32 py-1 font-mono text-[10px] text-[#D5BD8B]"
                        >
                          <option value="assigned">Assigned</option>
                          <option value="checked_in">Checked In</option>
                          <option value="late">Late</option>
                          <option value="absent">Absent</option>
                          <option value="completed">Completed</option>
                        </select>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

interface DeptRecordRow {
  id: string;
  department: string;
  category: string;
  title: string;
  status: string;
  priority: string;
  updated_at: string;
}

export const DepartmentWorkspaceView: React.FC<{
  departmentSlug?: string;
  categories?: string[];
}> = ({
  departmentSlug,
  categories = ['task', 'venue', 'equipment', 'run_of_show', 'speaker', 'budget', 'announcement'],
}) => {
  const { addToast } = useToast();
  const [records, setRecords] = useState<DeptRecordRow[]>([]);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(categories[0]);
  const [priority, setPriority] = useState('medium');
  const [loading, setLoading] = useState(true);

  const q = departmentSlug ? `?department=${encodeURIComponent(departmentSlug)}` : '';

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ records: DeptRecordRow[] }>(`/api/departments/records${q}`);
      setRecords(res.records || []);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/departments/records', {
        method: 'POST',
        body: { department: departmentSlug, category, title, priority },
      });
      setTitle('');
      addToast('Workspace record added.', 'success');
      await loadRecords();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Unable to save record.', 'error');
    }
  };

  const toggleStatus = async (r: DeptRecordRow) => {
    const next = r.status === 'done' ? 'open' : 'done';
    await apiRequest(`/api/departments/records/${r.id}`, {
      method: 'PATCH',
      body: { status: next },
    });
    await loadRecords();
  };

  const deleteRec = async (id: string) => {
    await apiRequest(`/api/departments/records/${id}`, { method: 'DELETE' });
    await loadRecords();
  };

  if (loading) return <LoadingSkeleton rows={4} />;

  return (
    <div className="space-y-6">
      <PortalPageHeader
        kicker="Directorate Operations Ledger"
        title="Department Operational Workspace"
        subtitle="Maintain equipment manifests, venue readiness, run-of-show items, and internal deliverables."
      />

      <form
        onSubmit={handleCreate}
        className="grid gap-3 border border-[#263D59]/65 bg-[#050E1C]/80 p-5 sm:grid-cols-4"
      >
        <input
          required
          placeholder="Record Title / Item *"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="portal-input sm:col-span-2"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="portal-select"
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="portal-select flex-1"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <button type="submit" className="portal-btn-primary">
            Add
          </button>
        </div>
      </form>

      {records.length === 0 ? (
        <EmptyState
          title="Workspace Empty"
          description="Add departmental items, venues, equipment, or run-of-show milestones."
        />
      ) : (
        <div className="divide-y divide-[#263D59]/50 border border-[#263D59]/65 bg-[#050E1C]/85">
          {records.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-xs transition-colors hover:bg-[#071426]/65"
            >
              <div>
                <div className="flex items-center gap-3">
                  <StatusLabel status={r.category} tone="gold" />
                  <p className="font-medium text-[#F3EDE0]">{r.title}</p>
                </div>
                <p className="mt-1 font-mono text-[10px] text-[#E8E1D2]/50">
                  Dept: {r.department} · Priority: {r.priority}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void toggleStatus(r)}
                  className="portal-btn-secondary py-1 text-[10px]"
                >
                  <StatusLabel status={r.status} />
                </button>
                <button
                  type="button"
                  onClick={() => void deleteRec(r.id)}
                  className="text-[#FCA5A5]/70 transition-colors hover:text-[#FCA5A5]"
                  aria-label="Delete record"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const InquiriesManagerView: React.FC = () => {
  const { effectiveActor } = useAuth();
  const { addToast } = useToast();
  const [inquiries, setInquiries] = useState<
    Array<{
      id: string;
      full_name: string;
      email: string;
      subject: string;
      message: string;
      status: string;
      admin_notes: string | null;
      created_at: string;
    }>
  >([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = effectiveActor?.role === 'super_admin' || effectiveActor?.role === 'admin';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ inquiries: typeof inquiries }>('/api/departments/inquiries');
      setInquiries(res.inquiries || []);
    } catch {
      setInquiries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updateStatus = async (id: string, status: string) => {
    await apiRequest(`/api/departments/inquiries/${id}`, {
      method: 'PATCH',
      body: { status },
    });
    addToast('Inquiry status updated.', 'success');
    await load();
  };

  const deleteInquiry = async (id: string) => {
    await apiRequest(`/api/departments/inquiries/${id}`, { method: 'DELETE' });
    addToast('Inquiry deleted.', 'info');
    await load();
  };

  if (loading) return <LoadingSkeleton rows={3} />;

  return (
    <div className="space-y-6">
      <PortalPageHeader
        kicker="Public Correspondence"
        title="Public Inquiries Inbox"
        subtitle="Track and resolve incoming questions submitted through the public registration portal."
      />
      {inquiries.length === 0 ? (
        <EmptyState
          title="Inbox Empty"
          description="Public questions submitted on /apply will appear here."
        />
      ) : (
        <div className="divide-y divide-[#263D59]/55 border border-[#263D59]/65 bg-[#050E1C]/85">
          {inquiries.map((inq) => (
            <div key={inq.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-2xl">
                  <p className="font-display text-xl text-[#F3EDE0]">{inq.subject}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-[#D5BD8B]">
                    {inq.full_name} &lt;{inq.email}&gt;
                  </p>
                  <p className="mt-2.5 font-sans text-xs leading-relaxed text-[#E8E1D2]/75">
                    {inq.message}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={inq.status}
                    onChange={(e) => void updateStatus(inq.id, e.target.value)}
                    className="portal-select w-36 py-1.5 font-mono text-xs text-[#D5BD8B]"
                  >
                    <option value="new">New</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="archived">Archived</option>
                  </select>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => void deleteInquiry(inq.id)}
                      className="portal-btn-danger py-1.5 text-[10px]"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const SponsorsManagerView: React.FC = () => {
  const { addToast } = useToast();
  const [sponsors, setSponsors] = useState<
    Array<{ id: string; name: string; tier: string; website_url: string | null; published: boolean }>
  >([]);
  const [name, setName] = useState('');
  const [tier, setTier] = useState('Platinum Partner');
  const [websiteUrl, setWebsiteUrl] = useState('');

  const load = async () => {
    const res = await apiRequest<{ sponsors: typeof sponsors }>('/api/cms/sponsors').catch(() => ({
      sponsors: [],
    }));
    setSponsors(res.sponsors || []);
  };

  useEffect(() => {
    void load();
  }, []);

  const addSponsor = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiRequest('/api/cms/sponsors', {
      method: 'POST',
      body: { name, tier, website_url: websiteUrl || null, published: true },
    });
    setName('');
    setWebsiteUrl('');
    addToast('Sponsor saved.', 'success');
    await load();
  };

  return (
    <div className="space-y-6">
      <PortalPageHeader
        kicker="External Partnerships"
        title="PR Sponsors & Partners"
        subtitle="Manage institutional sponsors and patron tiers synced with the public conference catalog."
      />
      <form
        onSubmit={addSponsor}
        className="grid gap-3 border border-[#263D59]/65 bg-[#050E1C]/80 p-5 sm:grid-cols-4"
      >
        <input
          required
          placeholder="Sponsor Name *"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="portal-input"
        />
        <input
          placeholder="Tier (e.g. Patron)"
          value={tier}
          onChange={(e) => setTier(e.target.value)}
          className="portal-input"
        />
        <input
          type="url"
          placeholder="https://sponsor-site.org"
          value={websiteUrl}
          onChange={(e) => setWebsiteUrl(e.target.value)}
          className="portal-input"
        />
        <button type="submit" className="portal-btn-primary">
          Save Sponsor
        </button>
      </form>
      <div className="grid divide-y divide-[#263D59]/50 border border-[#263D59]/65 bg-[#050E1C]/85 sm:grid-cols-2 sm:divide-x">
        {sponsors.map((s) => (
          <div key={s.id} className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="font-display text-xl text-[#F3EDE0]">{s.name}</p>
              <p className="font-mono text-[11px] text-[#D5BD8B]">{s.tier}</p>
            </div>
            <button
              type="button"
              onClick={async () => {
                await apiRequest(`/api/cms/sponsors/${s.id}`, { method: 'DELETE' });
                await load();
              }}
              className="text-[#FCA5A5]/70 transition-colors hover:text-[#FCA5A5]"
              aria-label="Delete sponsor"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export const CommitteesManagerView: React.FC = () => {
  const { addToast } = useToast();
  const [committees, setCommittees] = useState<
    Array<{
      id: string;
      chamber: string;
      name: string;
      abbreviation: string;
      difficulty: string;
      chair_name: string;
      capacity: number;
      published: boolean;
    }>
  >([]);
  const [name, setName] = useState('');
  const [abbr, setAbbr] = useState('');
  const [chamber, setChamber] = useState('General Assembly');
  const [difficulty, setDifficulty] = useState('Intermediate');
  const [regOpen, setRegOpen] = useState(true);
  const [earlyOpen, setEarlyOpen] = useState('');
  const [earlyClose, setEarlyClose] = useState('');

  const load = async () => {
    const [cRes, oRes] = await Promise.all([
      apiRequest<{ committees: typeof committees }>('/api/cms/committees').catch(() => ({
        committees: [],
      })),
      apiRequest<{ settings: Record<string, unknown> }>('/api/public/overview').catch(() => ({
        settings: {},
      })),
    ]);
    setCommittees(cRes.committees || []);
    const settingsObj: Record<string, unknown> = oRes.settings || {};
    setRegOpen(settingsObj.registration_open !== false);
    setEarlyOpen(String(settingsObj.early_bird_opens || ''));
    setEarlyClose(String(settingsObj.early_bird_closes || ''));
  };

  useEffect(() => {
    void load();
  }, []);

  const saveCommittee = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiRequest('/api/cms/committees', {
      method: 'POST',
      body: { name, abbreviation: abbr, chamber, difficulty, published: true },
    });
    setName('');
    setAbbr('');
    addToast('Committee saved & published to Living Atlas.', 'success');
    await load();
  };

  const saveDelegateWindows = async () => {
    await apiRequest('/api/cms/settings', {
      method: 'PUT',
      body: {
        settings: {
          registration_open: regOpen,
          early_bird_opens: earlyOpen,
          early_bird_closes: earlyClose,
        },
      },
    });
    addToast('Delegate registration window updated.', 'success');
  };

  return (
    <div className="space-y-6">
      <PortalPageHeader
        kicker="Delegate Council Management"
        title="Committees & Registration Windows"
        subtitle="Publish councils to the Living Atlas and govern early-bird admission schedule windows."
      />

      <div className="border border-[#263D59]/65 bg-[#050E1C]/80 p-5">
        <h3 className="font-display text-2xl text-[#F3EDE0]">Delegate Registration Windows</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <label className="flex items-center gap-2 text-xs text-[#E8E1D2]">
            <input
              type="checkbox"
              checked={regOpen}
              onChange={(e) => setRegOpen(e.target.checked)}
            />
            <span>Registration Open</span>
          </label>
          <input
            type="datetime-local"
            value={earlyOpen}
            onChange={(e) => setEarlyOpen(e.target.value)}
            aria-label="Early bird opens"
            className="portal-input font-mono text-xs"
          />
          <input
            type="datetime-local"
            value={earlyClose}
            onChange={(e) => setEarlyClose(e.target.value)}
            aria-label="Early bird closes"
            className="portal-input font-mono text-xs"
          />
          <button
            type="button"
            onClick={() => void saveDelegateWindows()}
            className="portal-btn-primary"
          >
            Save Schedule
          </button>
        </div>
      </div>

      <form
        onSubmit={saveCommittee}
        className="grid gap-3 border border-[#263D59]/65 bg-[#050E1C]/80 p-5 sm:grid-cols-6"
      >
        <input
          required
          placeholder="Committee Name *"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="portal-input sm:col-span-2"
        />
        <input
          required
          placeholder="Abbr (e.g. UNSC)"
          value={abbr}
          onChange={(e) => setAbbr(e.target.value)}
          className="portal-input"
        />
        <select
          value={chamber}
          onChange={(e) => setChamber(e.target.value)}
          className="portal-select"
        >
          <option value="General Assembly">General Assembly</option>
          <option value="Security Council">Security Council</option>
          <option value="Specialized Council">Specialized Council</option>
          <option value="Crisis">Crisis</option>
        </select>
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
          className="portal-select"
        >
          <option value="Beginner">Beginner</option>
          <option value="Intermediate">Intermediate</option>
          <option value="Advanced">Advanced</option>
          <option value="Crisis">Crisis</option>
        </select>
        <button type="submit" className="portal-btn-primary">
          Publish Committee
        </button>
      </form>

      <div className="grid divide-y divide-[#263D59]/50 border border-[#263D59]/65 bg-[#050E1C]/85 sm:grid-cols-2 sm:divide-x">
        {committees.map((c) => (
          <div key={c.id} className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="font-mono text-[10px] tracking-[0.14em] text-[#B89A62] uppercase">
                {c.abbreviation} · {c.difficulty}
              </p>
              <p className="mt-0.5 font-display text-xl text-[#F3EDE0]">{c.name}</p>
            </div>
            <button
              type="button"
              onClick={async () => {
                await apiRequest(`/api/cms/committees/${c.id}`, { method: 'DELETE' });
                await load();
              }}
              className="text-[#FCA5A5]/70 transition-colors hover:text-[#FCA5A5]"
              aria-label="Delete committee"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export const NotificationsCenterView: React.FC = () => {
  const [items, setItems] = useState<
    Array<{ id: string; category: string; title: string; body: string; is_read: boolean; created_at: string }>
  >([]);

  const load = async () => {
    const res = await apiRequest<{ notifications: typeof items }>('/api/cms/notifications').catch(
      () => ({ notifications: [] })
    );
    setItems(res.notifications || []);
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-6">
      <PortalPageHeader
        kicker="Dispatches & Alerts"
        title="Notifications Center"
        subtitle="Conference-wide announcements, administrative bulletins, and departmental updates."
      />
      {items.length === 0 ? (
        <EmptyState
          title="No Notifications"
          description="System announcements and alerts will appear here."
        />
      ) : (
        <div className="divide-y divide-[#263D59]/55 border border-[#263D59]/65 bg-[#050E1C]/85">
          {items.map((n) => (
            <div
              key={n.id}
              className={`flex items-start justify-between gap-4 p-5 transition-colors ${
                n.is_read ? 'opacity-75' : 'bg-[#071426]/65'
              }`}
            >
              <div>
                <div className="flex items-center gap-2.5">
                  <Bell className="h-3.5 w-3.5 text-[#B89A62]" />
                  <p className="font-mono text-[10px] tracking-[0.16em] text-[#B89A62] uppercase">
                    {n.category}
                  </p>
                </div>
                <p className="mt-1 font-sans text-sm font-medium text-[#F3EDE0]">{n.title}</p>
                <p className="mt-1 font-sans text-xs leading-relaxed text-[#E8E1D2]/70">{n.body}</p>
              </div>
              {!n.is_read && (
                <button
                  type="button"
                  onClick={async () => {
                    await apiRequest(`/api/cms/notifications/${n.id}/read`, { method: 'PATCH' });
                    await load();
                  }}
                  className="portal-btn-secondary py-1.5 text-[10px]"
                >
                  Mark Read
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
