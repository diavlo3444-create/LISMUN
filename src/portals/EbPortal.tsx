import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertOctagon,
  Bell,
  Building2,
  Calendar,
  CheckSquare,
  Compass,
  Layers,
  List,
  Megaphone,
  MessageSquare,
  Palette,
  QrCode,
  ShieldAlert,
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
import { LiveQrScannerWorkspace, MyQrPassView } from './ScannerAndPassPages';
import { hasPermission } from '../shared/permissions';

interface EbWorkspaceData {
  stations: Array<{
    id: string;
    department: string;
    name: string;
    location: string;
    sop_manual: string;
    required_equipment: string[];
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    opening_checklist: Array<{ label: string; done: boolean }>;
    closing_checklist: Array<{ label: string; done: boolean }>;
  }>;
  shifts: Array<{
    id: string;
    department: string;
    title: string;
    location: string;
    starts_at: string;
    ends_at: string;
    is_published: boolean;
    break_schedule: string | null;
  }>;
  assignments: Array<{
    id: string;
    eb_shift_id: string;
    user_id: string;
    assignee_name: string;
    role_label: string;
  }>;
  swaps: Array<{
    id: string;
    eb_shift_id: string;
    shift_title: string;
    requester_name: string;
    reason: string;
    status: string;
  }>;
  tasks: Array<{
    id: string;
    department: string;
    title: string;
    description: string;
    priority: string;
    status: string;
    assigned_to_name: string | null;
    checklist: Array<{ label: string; done: boolean }>;
  }>;
  comments: Array<{
    id: string;
    task_id: string;
    author_name: string;
    body: string;
    created_at: string;
  }>;
  announcements: Array<{
    id: string;
    title: string;
    body: string;
    severity: string;
    created_by_name: string;
    created_at: string;
  }>;
  acknowledgedIds: string[];
  incidents: Array<{
    id: string;
    department: string;
    title: string;
    description: string;
    severity: string;
    location: string;
    status: string;
    reported_by_name: string;
    created_at: string;
  }>;
  hierarchy: {
    scoped: boolean;
    reportingHead?: {
      user_id: string;
      full_name: string;
      email: string;
      department_slug: string;
      title: string;
      phone: string | null;
    } | null;
    heads?: Array<{ user_id: string; full_name: string; department_slug: string }>;
    coHeads?: Array<{ user_id: string; full_name: string; department_slug: string; eb_rank: string }>;
    admins?: Array<{ user_id: string; full_name: string; role: string }>;
  };
}

export const EbPortal: React.FC = () => {
  const { effectiveActor, departments } = useAuth();
  const { addToast } = useToast();

  const canScan = hasPermission(effectiveActor, 'qr.scan', departments);
  const canManageDept =
    effectiveActor?.role === 'super_admin' ||
    effectiveActor?.role === 'admin' ||
    effectiveActor?.role === 'department_head' ||
    effectiveActor?.eb_rank === 'co_head' ||
    Boolean(effectiveActor?.eb_permissions?.manage_department);

  const ebRank = effectiveActor?.eb_rank || 'co_head';
  const [activeTab, setActiveTab] = useState('overview');
  const [data, setData] = useState<EbWorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);

  // Sub-views UI state
  const [taskViewMode, setTaskViewMode] = useState<'board' | 'list'>('board');
  const [scheduleViewMode, setScheduleViewMode] = useState<'calendar' | 'timeline'>('calendar');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState('medium');
  const [newTaskAssignee, setNewTaskAssignee] = useState('');
  const [commentText, setCommentText] = useState<Record<string, string>>({});

  const [newShiftTitle, setNewShiftTitle] = useState('');
  const [newShiftLoc, setNewShiftLoc] = useState('');
  const [newShiftStart, setNewShiftStart] = useState('');
  const [newShiftEnd, setNewShiftEnd] = useState('');
  const [swapShiftId, setSwapShiftId] = useState('');
  const [swapReason, setSwapReason] = useState('');

  const [newStationName, setNewStationName] = useState('');
  const [newStationSop, setNewStationSop] = useState('');
  const [newAnnTitle, setNewAnnTitle] = useState('');
  const [newAnnBody, setNewAnnBody] = useState('');
  const [incTitle, setIncTitle] = useState('');
  const [incDesc, setIncDesc] = useState('');
  const [incLoc, setIncLoc] = useState('');
  const [incSev, setIncSev] = useState('medium');

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    try {
      const ws = await apiRequest<EbWorkspaceData>('/api/eb/workspace');
      setData(ws);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const roleStudioLabel =
    ebRank === 'designer'
      ? 'Design Studio'
      : ebRank === 'marketing'
      ? 'Marketing Campaigns'
      : 'Co-Head Command';

  const navItems: ShellNavItem[] = [
    { id: 'overview', label: 'EB Overview', group: 'Workspace', icon: Compass },
    { id: 'specialty', label: roleStudioLabel, group: 'Workspace', icon: Palette },
    { id: 'tasks', label: 'Tasks & Checklists', group: 'Operations', icon: CheckSquare },
    { id: 'schedule', label: 'Shifts & Swaps', group: 'Operations', icon: Calendar },
    { id: 'stations', label: 'Stations & SOPs', group: 'Operations', icon: Building2 },
    { id: 'hierarchy', label: 'Hierarchy', group: 'Coordination', icon: Users },
    { id: 'announcements', label: 'Announcements', group: 'Coordination', icon: Megaphone },
    { id: 'event_day', label: 'Event-Day Incidents', group: 'Coordination', icon: AlertOctagon },
    { id: 'my_qr', label: 'My QR Credential', group: 'Credential', icon: QrCode },
    // Scanner ONLY renders for Security / Admin (bug fix from WEST MUN)
    ...(canScan
      ? [{ id: 'scanner', label: 'Security QR Scanner', group: 'Security', icon: ShieldAlert }]
      : []),
  ];

  const scheduleByDate = (data?.shifts || []).reduce<Record<string, EbWorkspaceData['shifts']>>(
    (acc, sh) => {
      const d = new Date(sh.starts_at).toLocaleDateString();
      if (!acc[d]) acc[d] = [];
      acc[d].push(sh);
      return acc;
    },
    {}
  );

  return (
    <DashboardShell
      portalLabel="Executive Board Ops"
      breadcrumbSection={navItems.find((n) => n.id === activeTab)?.label || 'Overview'}
      navItems={navItems}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
    >
      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : (
        <>
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-3xl text-[#E8E1D2]">
                  Executive Board Command Center
                </h1>
                <p className="mt-1 font-mono text-xs text-[#B89A62] uppercase">
                  Rank: {ebRank.replace(/_/g, ' ')} · Department: {effectiveActor?.department_slug || 'General'}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="border border-[#263D59]/80 bg-[#071426] p-5">
                  <p className="font-mono text-[10px] text-[#B89A62] uppercase">EB Tasks</p>
                  <p className="mt-2 font-display text-4xl tabular-nums text-[#E8E1D2]">
                    {data?.tasks.length ?? 0}
                  </p>
                </div>
                <div className="border border-[#263D59]/80 bg-[#071426] p-5">
                  <p className="font-mono text-[10px] text-[#B89A62] uppercase">EB Shifts</p>
                  <p className="mt-2 font-display text-4xl tabular-nums text-[#E8E1D2]">
                    {data?.shifts.length ?? 0}
                  </p>
                </div>
                <div className="border border-[#263D59]/80 bg-[#071426] p-5">
                  <p className="font-mono text-[10px] text-[#B89A62] uppercase">Active Stations</p>
                  <p className="mt-2 font-display text-4xl tabular-nums text-[#D5BD8B]">
                    {data?.stations.length ?? 0}
                  </p>
                </div>
                <div className="border border-[#263D59]/80 bg-[#071426] p-5">
                  <p className="font-mono text-[10px] text-[#B89A62] uppercase">Open Incidents</p>
                  <p className="mt-2 font-display text-4xl tabular-nums text-[#FCA5A5]">
                    {(data?.incidents || []).filter((i) => i.status !== 'resolved').length}
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'specialty' && (
            <div className="space-y-4 border border-[#263D59]/80 bg-[#071426] p-6">
              <p className="font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                Specialized Rank Workspace
              </p>
              <h2 className="font-display text-3xl text-[#E8E1D2]">{roleStudioLabel}</h2>
              <p className="font-sans text-xs leading-relaxed text-[#E8E1D2]/75">
                {ebRank === 'designer'
                  ? 'Manage brand visual deliverables, placard & certificate templates, and signage briefs.'
                  : ebRank === 'marketing'
                  ? 'Track school outreach campaigns, social media rollout milestones, and delegation conversion targets.'
                  : 'Supervise department section coverage, approve shift swaps, and maintain station readiness.'}
              </p>
            </div>
          )}

          {activeTab === 'tasks' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-2xl text-[#E8E1D2]">EB Tasks &amp; Discussions</h2>
                <div className="flex border border-[#263D59]">
                  <button
                    type="button"
                    onClick={() => setTaskViewMode('board')}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 font-mono text-[11px] uppercase ${
                      taskViewMode === 'board' ? 'bg-[#071426] text-[#D5BD8B]' : 'text-[#E8E1D2]/65'
                    }`}
                  >
                    <Layers className="h-3.5 w-3.5" />
                    <span>Board</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTaskViewMode('list')}
                    className={`inline-flex items-center gap-1 border-l border-[#263D59] px-3 py-1.5 font-mono text-[11px] uppercase ${
                      taskViewMode === 'list' ? 'bg-[#071426] text-[#D5BD8B]' : 'text-[#E8E1D2]/65'
                    }`}
                  >
                    <List className="h-3.5 w-3.5" />
                    <span>List</span>
                  </button>
                </div>
              </div>

              {canManageDept && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await apiRequest('/api/eb/tasks', {
                      method: 'POST',
                      body: {
                        title: newTaskTitle,
                        priority: newTaskPriority,
                        assigned_to_name: newTaskAssignee || null,
                      },
                    });
                    setNewTaskTitle('');
                    setNewTaskAssignee('');
                    addToast('EB task created.', 'success');
                    await loadWorkspace();
                  }}
                  className="grid gap-3 border border-[#263D59]/80 bg-[#071426] p-4 sm:grid-cols-4"
                >
                  <input
                    required
                    placeholder="EB Task Title *"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    className="border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                  />
                  <input
                    placeholder="Assignee Full Name"
                    value={newTaskAssignee}
                    onChange={(e) => setNewTaskAssignee(e.target.value)}
                    className="border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                  />
                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value)}
                    className="border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                  <button
                    type="submit"
                    className="border border-[#B89A62] bg-[#030914] px-4 py-2 font-mono text-xs text-[#D5BD8B] uppercase"
                  >
                    Assign EB Task
                  </button>
                </form>
              )}

              {(data?.tasks || []).length === 0 ? (
                <EmptyState title="No EB Tasks" description="Tasks created in eb_tasks appear here cleanly separated from Head shift tables." />
              ) : (
                <div className={taskViewMode === 'board' ? 'grid gap-4 md:grid-cols-3' : 'space-y-3'}>
                  {(data?.tasks || []).map((t) => {
                    const taskComments = (data?.comments || []).filter((c) => c.task_id === t.id);
                    return (
                      <div key={t.id} className="border border-[#263D59]/80 bg-[#071426] p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-sans text-sm font-medium text-[#E8E1D2]">{t.title}</p>
                          <select
                            value={t.status}
                            onChange={async (e) => {
                              await apiRequest(`/api/eb/tasks/${t.id}`, {
                                method: 'PATCH',
                                body: { status: e.target.value },
                              });
                              await loadWorkspace();
                            }}
                            className="border border-[#263D59] bg-[#030914] px-2 py-0.5 font-mono text-[10px] text-[#D5BD8B]"
                          >
                            <option value="todo">To Do</option>
                            <option value="in_progress">In Progress</option>
                            <option value="blocked">Blocked</option>
                            <option value="completed">Completed</option>
                          </select>
                        </div>
                        <p className="font-mono text-[10px] text-[#E8E1D2]/60">
                          {t.assigned_to_name || 'Unassigned'} · {t.priority}
                        </p>
                        <div className="border-t border-[#263D59]/50 pt-2">
                          {taskComments.map((c) => (
                            <p key={c.id} className="text-[11px] text-[#E8E1D2]/75">
                              <strong className="text-[#D5BD8B]">{c.author_name}:</strong> {c.body}
                            </p>
                          ))}
                          <div className="mt-2 flex gap-1.5">
                            <input
                              placeholder="Add comment..."
                              value={commentText[t.id] || ''}
                              onChange={(e) => setCommentText((p) => ({ ...p, [t.id]: e.target.value }))}
                              className="flex-1 border border-[#263D59] bg-[#030914] px-2 py-1 text-[11px] text-[#E8E1D2]"
                            />
                            <button
                              type="button"
                              onClick={async () => {
                                if (!commentText[t.id]?.trim()) return;
                                await apiRequest(`/api/eb/tasks/${t.id}/comments`, {
                                  method: 'POST',
                                  body: { body: commentText[t.id] },
                                });
                                setCommentText((p) => ({ ...p, [t.id]: '' }));
                                await loadWorkspace();
                              }}
                              className="border border-[#263D59] px-2 py-1 font-mono text-[10px] text-[#D5BD8B] uppercase"
                            >
                              <MessageSquare className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'schedule' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-2xl text-[#E8E1D2]">
                  EB Schedule &amp; Shift Swaps
                </h2>
                <div className="flex border border-[#263D59]">
                  <button
                    type="button"
                    onClick={() => setScheduleViewMode('calendar')}
                    className={`px-3 py-1.5 font-mono text-[11px] uppercase ${
                      scheduleViewMode === 'calendar' ? 'bg-[#071426] text-[#D5BD8B]' : 'text-[#E8E1D2]/65'
                    }`}
                  >
                    Calendar View
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleViewMode('timeline')}
                    className={`border-l border-[#263D59] px-3 py-1.5 font-mono text-[11px] uppercase ${
                      scheduleViewMode === 'timeline' ? 'bg-[#071426] text-[#D5BD8B]' : 'text-[#E8E1D2]/65'
                    }`}
                  >
                    Timeline View
                  </button>
                </div>
              </div>

              {canManageDept && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await apiRequest('/api/eb/shifts', {
                      method: 'POST',
                      body: {
                        title: newShiftTitle,
                        location: newShiftLoc,
                        starts_at: new Date(newShiftStart).toISOString(),
                        ends_at: new Date(newShiftEnd).toISOString(),
                      },
                    });
                    setNewShiftTitle('');
                    addToast('EB shift published.', 'success');
                    await loadWorkspace();
                  }}
                  className="grid gap-3 border border-[#263D59]/80 bg-[#071426] p-4 sm:grid-cols-5"
                >
                  <input
                    required
                    placeholder="EB Shift Title *"
                    value={newShiftTitle}
                    onChange={(e) => setNewShiftTitle(e.target.value)}
                    className="border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                  />
                  <input
                    placeholder="Station / Location"
                    value={newShiftLoc}
                    onChange={(e) => setNewShiftLoc(e.target.value)}
                    className="border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                  />
                  <input
                    required
                    type="datetime-local"
                    value={newShiftStart}
                    onChange={(e) => setNewShiftStart(e.target.value)}
                    className="border border-[#263D59] bg-[#030914] px-2 py-2 font-mono text-xs text-[#E8E1D2]"
                  />
                  <input
                    required
                    type="datetime-local"
                    value={newShiftEnd}
                    onChange={(e) => setNewShiftEnd(e.target.value)}
                    className="border border-[#263D59] bg-[#030914] px-2 py-2 font-mono text-xs text-[#E8E1D2]"
                  />
                  <button
                    type="submit"
                    className="border border-[#B89A62] bg-[#030914] px-4 py-2 font-mono text-xs text-[#D5BD8B] uppercase"
                  >
                    Create Shift
                  </button>
                </form>
              )}

              {/* Distinct Calendar vs Timeline Renderers */}
              {(data?.shifts || []).length === 0 ? (
                <EmptyState title="No EB Shifts Scheduled" description="Shifts published for Executive Board operations appear here." />
              ) : scheduleViewMode === 'calendar' ? (
                <div className="grid gap-4 md:grid-cols-3">
                  {Object.entries(scheduleByDate).map(([day, list]) => (
                    <div key={day} className="border border-[#263D59]/80 bg-[#071426] p-4">
                      <p className="border-b border-[#263D59]/60 pb-2 font-mono text-xs text-[#B89A62] uppercase">
                        {day}
                      </p>
                      <div className="mt-3 space-y-2">
                        {list.map((s) => (
                          <div key={s.id} className="border border-[#263D59]/60 bg-[#030914] p-3 text-xs">
                            <p className="font-medium text-[#E8E1D2]">{s.title}</p>
                            <p className="mt-1 font-mono text-[10px] text-[#D5BD8B]">
                              {new Date(s.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} –{' '}
                              {new Date(s.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3 border-l-2 border-[#B89A62]/60 pl-5">
                  {(data?.shifts || []).map((s) => (
                    <div key={s.id} className="border border-[#263D59]/80 bg-[#071426] p-4 text-xs">
                      <p className="font-mono text-[10px] text-[#D5BD8B]">
                        {new Date(s.starts_at).toLocaleString()} → {new Date(s.ends_at).toLocaleTimeString()}
                      </p>
                      <h3 className="mt-1 font-display text-xl text-[#E8E1D2]">{s.title}</h3>
                      <p className="font-sans text-[#E8E1D2]/70">{s.location || 'Main Floor'}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Shift Swap Form & Approvals */}
              <div className="border border-[#263D59]/80 bg-[#071426] p-5 space-y-4">
                <h3 className="font-display text-xl text-[#D5BD8B]">Shift Swap Requests</h3>
                {(data?.shifts || []).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={swapShiftId}
                      onChange={(e) => setSwapShiftId(e.target.value)}
                      className="border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                    >
                      <option value="">Select Shift to Swap</option>
                      {(data?.shifts || []).map((s) => (
                        <option key={`sw-${s.id}`} value={s.id}>
                          {s.title}
                        </option>
                      ))}
                    </select>
                    <input
                      placeholder="Swap reason..."
                      value={swapReason}
                      onChange={(e) => setSwapReason(e.target.value)}
                      className="flex-1 border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        if (!swapShiftId || swapReason.trim().length < 3) return;
                        await apiRequest('/api/eb/swaps', {
                          method: 'POST',
                          body: { eb_shift_id: swapShiftId, reason: swapReason },
                        });
                        setSwapReason('');
                        addToast('Swap requested.', 'success');
                        await loadWorkspace();
                      }}
                      className="border border-[#B89A62] px-4 py-2 font-mono text-xs text-[#D5BD8B] uppercase"
                    >
                      Request Swap
                    </button>
                  </div>
                )}
                {(data?.swaps || []).map((sw) => (
                  <div key={sw.id} className="flex flex-wrap items-center justify-between gap-2 border border-[#263D59]/60 bg-[#030914] p-3 text-xs">
                    <span>
                      <strong>{sw.requester_name}</strong> · {sw.shift_title} — {sw.reason}
                    </span>
                    <div className="flex items-center gap-2">
                      <StatusLabel status={sw.status} />
                      {canManageDept && sw.status === 'pending' && (
                        <>
                          <button
                            type="button"
                            onClick={async () => {
                              await apiRequest(`/api/eb/swaps/${sw.id}`, {
                                method: 'PATCH',
                                body: { status: 'approved' },
                              });
                              await loadWorkspace();
                            }}
                            className="border border-[#16A34A] px-2 py-0.5 font-mono text-[10px] text-[#86EFAC] uppercase"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await apiRequest(`/api/eb/swaps/${sw.id}`, {
                                method: 'PATCH',
                                body: { status: 'rejected' },
                              });
                              await loadWorkspace();
                            }}
                            className="border border-[#DC2626] px-2 py-0.5 font-mono text-[10px] text-[#FCA5A5] uppercase"
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'stations' && (
            <div className="space-y-5">
              <h2 className="font-display text-2xl text-[#E8E1D2]">Stations &amp; Standard Operating Procedures</h2>
              {canManageDept && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await apiRequest('/api/eb/stations', {
                      method: 'POST',
                      body: { name: newStationName, sop_manual: newStationSop },
                    });
                    setNewStationName('');
                    setNewStationSop('');
                    addToast('Station added.', 'success');
                    await loadWorkspace();
                  }}
                  className="grid gap-3 border border-[#263D59]/80 bg-[#071426] p-4 sm:grid-cols-3"
                >
                  <input
                    required
                    placeholder="Station Name *"
                    value={newStationName}
                    onChange={(e) => setNewStationName(e.target.value)}
                    className="border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                  />
                  <input
                    placeholder="SOP Manual Summary"
                    value={newStationSop}
                    onChange={(e) => setNewStationSop(e.target.value)}
                    className="border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                  />
                  <button
                    type="submit"
                    className="border border-[#B89A62] bg-[#030914] px-4 py-2 font-mono text-xs text-[#D5BD8B] uppercase"
                  >
                    Create Station
                  </button>
                </form>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                {(data?.stations || []).map((st) => (
                  <div key={st.id} className="border border-[#263D59]/80 bg-[#071426] p-5">
                    <h3 className="font-display text-xl text-[#E8E1D2]">{st.name}</h3>
                    <p className="mt-2 font-sans text-xs text-[#E8E1D2]/75">{st.sop_manual}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'hierarchy' && (
            <div className="space-y-4">
              <h2 className="font-display text-2xl text-[#E8E1D2]">Chain of Command</h2>
              {data?.hierarchy?.scoped ? (
                <div className="border border-[#B89A62]/50 bg-[#071426] p-6">
                  <p className="font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                    Direct Reporting Department Head
                  </p>
                  {data.hierarchy.reportingHead ? (
                    <div className="mt-3 space-y-1">
                      <p className="font-display text-2xl text-[#E8E1D2]">
                        {data.hierarchy.reportingHead.full_name}
                      </p>
                      <p className="font-mono text-xs text-[#D5BD8B]">
                        {data.hierarchy.reportingHead.department_slug} · {data.hierarchy.reportingHead.email}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-2 font-sans text-xs text-[#E8E1D2]/65">
                      No direct Reporting Head bound yet.
                    </p>
                  )}
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="border border-[#263D59]/80 bg-[#071426] p-4">
                    <p className="font-mono text-[10px] text-[#B89A62] uppercase">Secretariat Admins</p>
                    {(data?.hierarchy?.admins || []).map((a) => (
                      <p key={a.user_id} className="mt-2 text-xs text-[#E8E1D2]">{a.full_name}</p>
                    ))}
                  </div>
                  <div className="border border-[#263D59]/80 bg-[#071426] p-4">
                    <p className="font-mono text-[10px] text-[#B89A62] uppercase">Department Heads</p>
                    {(data?.hierarchy?.heads || []).map((h) => (
                      <p key={h.user_id} className="mt-2 text-xs text-[#E8E1D2]">
                        {h.full_name} ({h.department_slug})
                      </p>
                    ))}
                  </div>
                  <div className="border border-[#263D59]/80 bg-[#071426] p-4">
                    <p className="font-mono text-[10px] text-[#B89A62] uppercase">Executive Board</p>
                    {(data?.hierarchy?.coHeads || []).map((c) => (
                      <p key={c.user_id} className="mt-2 text-xs text-[#E8E1D2]">
                        {c.full_name} ({c.eb_rank})
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'announcements' && (
            <div className="space-y-4">
              <h2 className="font-display text-2xl text-[#E8E1D2]">Operational Bulletins</h2>
              {canManageDept && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await apiRequest('/api/eb/announcements', {
                      method: 'POST',
                      body: { title: newAnnTitle, body: newAnnBody },
                    });
                    setNewAnnTitle('');
                    setNewAnnBody('');
                    await loadWorkspace();
                  }}
                  className="grid gap-3 border border-[#263D59]/80 bg-[#071426] p-4 sm:grid-cols-3"
                >
                  <input
                    required
                    placeholder="Bulletin Title"
                    value={newAnnTitle}
                    onChange={(e) => setNewAnnTitle(e.target.value)}
                    className="border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                  />
                  <input
                    required
                    placeholder="Details"
                    value={newAnnBody}
                    onChange={(e) => setNewAnnBody(e.target.value)}
                    className="border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                  />
                  <button type="submit" className="border border-[#B89A62] px-4 py-2 font-mono text-xs text-[#D5BD8B] uppercase">
                    Post Bulletin
                  </button>
                </form>
              )}
              {(data?.announcements || []).map((ann) => {
                const acked = (data?.acknowledgedIds || []).includes(ann.id);
                return (
                  <div key={ann.id} className="flex items-start justify-between gap-4 border border-[#263D59]/80 bg-[#071426] p-4">
                    <div>
                      <p className="font-display text-xl text-[#E8E1D2]">{ann.title}</p>
                      <p className="mt-1 font-sans text-xs text-[#E8E1D2]/75">{ann.body}</p>
                    </div>
                    <button
                      type="button"
                      disabled={acked}
                      onClick={async () => {
                        await apiRequest(`/api/eb/announcements/${ann.id}/ack`, { method: 'POST' });
                        await loadWorkspace();
                      }}
                      className="border border-[#B89A62] px-3 py-1 font-mono text-[10px] text-[#D5BD8B] uppercase disabled:opacity-50"
                    >
                      {acked ? 'Acknowledged' : 'Acknowledge'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'event_day' && (
            <div className="space-y-5">
              <h2 className="font-display text-2xl text-[#E8E1D2]">Event-Day Live Incident Log</h2>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await apiRequest('/api/eb/incidents', {
                    method: 'POST',
                    body: { title: incTitle, description: incDesc, location: incLoc, severity: incSev },
                  });
                  setIncTitle('');
                  setIncDesc('');
                  setIncLoc('');
                  addToast('Incident logged.', 'success');
                  await loadWorkspace();
                }}
                className="grid gap-3 border border-[#DC2626]/50 bg-[#071426] p-4 sm:grid-cols-4"
              >
                <input
                  required
                  placeholder="Incident Title *"
                  value={incTitle}
                  onChange={(e) => setIncTitle(e.target.value)}
                  className="border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                />
                <input
                  required
                  placeholder="Location"
                  value={incLoc}
                  onChange={(e) => setIncLoc(e.target.value)}
                  className="border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                />
                <select
                  value={incSev}
                  onChange={(e) => setIncSev(e.target.value)}
                  className="border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2]"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
                <button type="submit" className="border border-[#DC2626] bg-[#1B0B10] px-4 py-2 font-mono text-xs text-[#FCA5A5] uppercase">
                  Report Incident
                </button>
                <input
                  required
                  placeholder="Incident Description *"
                  value={incDesc}
                  onChange={(e) => setIncDesc(e.target.value)}
                  className="border border-[#263D59] bg-[#030914] px-3 py-2 text-xs text-[#E8E1D2] sm:col-span-4"
                />
              </form>

              <div className="space-y-3">
                {(data?.incidents || []).map((inc) => (
                  <div key={inc.id} className="flex flex-wrap items-center justify-between gap-3 border border-[#263D59]/80 bg-[#071426] p-4 text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <StatusLabel status={inc.severity} tone={inc.severity === 'critical' ? 'red' : 'amber'} />
                        <p className="font-medium text-[#E8E1D2]">{inc.title}</p>
                      </div>
                      <p className="mt-1 text-[#E8E1D2]/75">
                        {inc.description} · Location: {inc.location}
                      </p>
                    </div>
                    {inc.status !== 'resolved' ? (
                      <button
                        type="button"
                        onClick={async () => {
                          await apiRequest(`/api/eb/incidents/${inc.id}/resolve`, {
                            method: 'PATCH',
                            body: { resolution_note: 'Resolved on floor' },
                          });
                          await loadWorkspace();
                        }}
                        className="border border-[#16A34A] px-3 py-1 font-mono text-[10px] text-[#86EFAC] uppercase"
                      >
                        Resolve
                      </button>
                    ) : (
                      <StatusLabel status="Resolved" tone="green" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'my_qr' && <MyQrPassView />}
          {activeTab === 'scanner' && canScan && <LiveQrScannerWorkspace />}
        </>
      )}
    </DashboardShell>
  );
};
