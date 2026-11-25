import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertOctagon,
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
  MetricLedger,
  PortalPageHeader,
  ProportionalDistributionBar,
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

  const openIncidents = (data?.incidents || []).filter((i) => i.status !== 'resolved');

  return (
    <DashboardShell
      portalLabel="Executive Board Ops"
      breadcrumbSection={navItems.find((n) => n.id === activeTab)?.label || 'Overview'}
      departmentTheme="eb"
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
              <PortalPageHeader
                kicker={`Executive Board · Rank: ${ebRank.replace(/_/g, ' ')} · Dept: ${effectiveActor?.department_slug || 'General'}`}
                title="Executive Board Command Center"
                subtitle="Coordinate floor stations, shift handovers, bulletins, and real-time conference incident resolution."
              />

              <MetricLedger
                items={[
                  { label: 'EB Tasks', value: data?.tasks.length ?? 0, accent: 'default' },
                  { label: 'EB Shifts', value: data?.shifts.length ?? 0, accent: 'default' },
                  { label: 'Active Stations', value: data?.stations.length ?? 0, accent: 'gold' },
                  { label: 'Open Incidents', value: openIncidents.length, accent: openIncidents.length > 0 ? 'red' : 'green' },
                ]}
              />

              <ProportionalDistributionBar
                title="EB Task Execution Breakdown"
                segments={[
                  { label: 'Completed', value: (data?.tasks || []).filter((t) => t.status === 'completed').length, color: '#86EFAC' },
                  { label: 'In Progress', value: (data?.tasks || []).filter((t) => t.status === 'in_progress').length, color: '#93C5FD' },
                  { label: 'To Do', value: (data?.tasks || []).filter((t) => t.status === 'todo').length, color: '#D5BD8B' },
                  { label: 'Blocked', value: (data?.tasks || []).filter((t) => t.status === 'blocked').length, color: '#FCA5A5' },
                ]}
              />
            </div>
          )}

          {activeTab === 'specialty' && (
            <div className="space-y-6">
              <PortalPageHeader
                kicker="Specialized Rank Workspace"
                title={roleStudioLabel}
                subtitle={
                  ebRank === 'designer'
                    ? 'Manage brand visual deliverables, placard & certificate templates, and signage briefs.'
                    : ebRank === 'marketing'
                    ? 'Track school outreach campaigns, social media rollout milestones, and delegation conversion targets.'
                    : 'Supervise department section coverage, approve shift swaps, and maintain station readiness.'
                }
              />

              <div className="grid divide-y divide-[#263D59]/55 border border-[#263D59]/65 bg-[#050E1C]/85 md:grid-cols-3 md:divide-x md:divide-y-0">
                <button
                  type="button"
                  onClick={() => setActiveTab('tasks')}
                  className="p-6 text-left transition-colors hover:bg-[#071426]"
                >
                  <p className="font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                    Active Deliverables
                  </p>
                  <p className="mt-2 font-display text-3xl tabular-nums text-[#F3EDE0]">
                    {data?.tasks.length ?? 0}
                  </p>
                  <p className="mt-1 font-sans text-xs text-[#E8E1D2]/60">
                    Open Tasks &amp; Checklists →
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('schedule')}
                  className="p-6 text-left transition-colors hover:bg-[#071426]"
                >
                  <p className="font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                    Pending Swap Requests
                  </p>
                  <p className="mt-2 font-display text-3xl tabular-nums text-[#FCD34D]">
                    {(data?.swaps || []).filter((s) => s.status === 'pending').length}
                  </p>
                  <p className="mt-1 font-sans text-xs text-[#E8E1D2]/60">
                    Review Shifts &amp; Swaps →
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('stations')}
                  className="p-6 text-left transition-colors hover:bg-[#071426]"
                >
                  <p className="font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                    Configured Stations
                  </p>
                  <p className="mt-2 font-display text-3xl tabular-nums text-[#D5BD8B]">
                    {data?.stations.length ?? 0}
                  </p>
                  <p className="mt-1 font-sans text-xs text-[#E8E1D2]/60">
                    Inspect Stations &amp; SOPs →
                  </p>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'tasks' && (
            <div className="space-y-6">
              <PortalPageHeader
                kicker="Execution & Discussions"
                title="EB Tasks & Checklists"
                subtitle="Coordinate Executive Board assignments cleanly isolated from Department Head shift rosters."
                actions={
                  <div className="flex border border-[#263D59] bg-[#040B18]">
                    <button
                      type="button"
                      onClick={() => setTaskViewMode('board')}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 font-mono text-[11px] uppercase whitespace-nowrap ${
                        taskViewMode === 'board' ? 'bg-[#071426] text-[#D5BD8B]' : 'text-[#E8E1D2]/60 hover:text-[#E8E1D2]'
                      }`}
                    >
                      <Layers className="h-3.5 w-3.5 shrink-0" />
                      <span>Board</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTaskViewMode('list')}
                      className={`inline-flex items-center gap-1.5 border-l border-[#263D59] px-3.5 py-2 font-mono text-[11px] uppercase whitespace-nowrap ${
                        taskViewMode === 'list' ? 'bg-[#071426] text-[#D5BD8B]' : 'text-[#E8E1D2]/60 hover:text-[#E8E1D2]'
                      }`}
                    >
                      <List className="h-3.5 w-3.5 shrink-0" />
                      <span>List</span>
                    </button>
                  </div>
                }
              />

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
                  className="grid gap-3 border border-[#263D59]/65 bg-[#050E1C]/80 p-5 sm:grid-cols-4"
                >
                  <input
                    required
                    placeholder="EB Task Title *"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    className="portal-input"
                  />
                  <input
                    placeholder="Assignee Full Name"
                    value={newTaskAssignee}
                    onChange={(e) => setNewTaskAssignee(e.target.value)}
                    className="portal-input"
                  />
                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value)}
                    className="portal-select"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                  <button type="submit" className="portal-btn-primary">
                    Assign EB Task
                  </button>
                </form>
              )}

              {(data?.tasks || []).length === 0 ? (
                <EmptyState
                  title="No EB Tasks"
                  description="Tasks created in eb_tasks appear here cleanly separated from Head shift tables."
                />
              ) : (
                <div className={taskViewMode === 'board' ? 'grid gap-4 md:grid-cols-3' : 'divide-y divide-[#263D59]/55 border border-[#263D59]/65 bg-[#050E1C]/85'}>
                  {(data?.tasks || []).map((t) => {
                    const taskComments = (data?.comments || []).filter((c) => c.task_id === t.id);
                    return (
                      <div
                        key={t.id}
                        className={`space-y-3 p-5 ${
                          taskViewMode === 'board' ? 'border border-[#263D59]/65 bg-[#050E1C]/85' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-sans text-sm font-medium text-[#F3EDE0]">{t.title}</p>
                          <select
                            value={t.status}
                            onChange={async (e) => {
                              await apiRequest(`/api/eb/tasks/${t.id}`, {
                                method: 'PATCH',
                                body: { status: e.target.value },
                              });
                              await loadWorkspace();
                            }}
                            className="portal-select w-32 py-1 font-mono text-[10px] text-[#D5BD8B]"
                          >
                            <option value="todo">To Do</option>
                            <option value="in_progress">In Progress</option>
                            <option value="blocked">Blocked</option>
                            <option value="completed">Completed</option>
                          </select>
                        </div>
                        <p className="font-mono text-[10px] text-[#E8E1D2]/55">
                          {t.assigned_to_name || 'Unassigned'} · {t.priority}
                        </p>
                        <div className="border-t border-[#263D59]/45 pt-3">
                          <div className="space-y-1">
                            {taskComments.map((c) => (
                              <p key={c.id} className="text-[11px] text-[#E8E1D2]/75">
                                <strong className="text-[#D5BD8B]">{c.author_name}:</strong> {c.body}
                              </p>
                            ))}
                          </div>
                          <div className="mt-2.5 flex gap-1.5">
                            <input
                              placeholder="Add comment..."
                              value={commentText[t.id] || ''}
                              onChange={(e) => setCommentText((p) => ({ ...p, [t.id]: e.target.value }))}
                              className="portal-input flex-1 py-1.5 text-[11px]"
                            />
                            <button
                              type="button"
                              aria-label="Post comment"
                              onClick={async () => {
                                if (!commentText[t.id]?.trim()) return;
                                await apiRequest(`/api/eb/tasks/${t.id}/comments`, {
                                  method: 'POST',
                                  body: { body: commentText[t.id] },
                                });
                                setCommentText((p) => ({ ...p, [t.id]: '' }));
                                await loadWorkspace();
                              }}
                              className="portal-btn-secondary px-2.5 py-1.5"
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
              <PortalPageHeader
                kicker="Duty Schedule & Handover"
                title="EB Schedule & Shift Swaps"
                subtitle="Publish Executive Board shift allocations and review requested duty swaps."
                actions={
                  <div className="flex border border-[#263D59] bg-[#040B18]">
                    <button
                      type="button"
                      onClick={() => setScheduleViewMode('calendar')}
                      className={`px-3.5 py-2 font-mono text-[11px] uppercase whitespace-nowrap ${
                        scheduleViewMode === 'calendar' ? 'bg-[#071426] text-[#D5BD8B]' : 'text-[#E8E1D2]/60 hover:text-[#E8E1D2]'
                      }`}
                    >
                      Calendar View
                    </button>
                    <button
                      type="button"
                      onClick={() => setScheduleViewMode('timeline')}
                      className={`border-l border-[#263D59] px-3.5 py-2 font-mono text-[11px] uppercase whitespace-nowrap ${
                        scheduleViewMode === 'timeline' ? 'bg-[#071426] text-[#D5BD8B]' : 'text-[#E8E1D2]/60 hover:text-[#E8E1D2]'
                      }`}
                    >
                      Timeline View
                    </button>
                  </div>
                }
              />

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
                  className="grid gap-3 border border-[#263D59]/65 bg-[#050E1C]/80 p-5 sm:grid-cols-5"
                >
                  <input
                    required
                    placeholder="EB Shift Title *"
                    value={newShiftTitle}
                    onChange={(e) => setNewShiftTitle(e.target.value)}
                    className="portal-input"
                  />
                  <input
                    placeholder="Station / Location"
                    value={newShiftLoc}
                    onChange={(e) => setNewShiftLoc(e.target.value)}
                    className="portal-input"
                  />
                  <input
                    required
                    type="datetime-local"
                    value={newShiftStart}
                    onChange={(e) => setNewShiftStart(e.target.value)}
                    className="portal-input font-mono text-xs"
                  />
                  <input
                    required
                    type="datetime-local"
                    value={newShiftEnd}
                    onChange={(e) => setNewShiftEnd(e.target.value)}
                    className="portal-input font-mono text-xs"
                  />
                  <button type="submit" className="portal-btn-primary">
                    Create Shift
                  </button>
                </form>
              )}

              {(data?.shifts || []).length === 0 ? (
                <EmptyState
                  title="No EB Shifts Scheduled"
                  description="Shifts published for Executive Board operations appear here."
                />
              ) : scheduleViewMode === 'calendar' ? (
                <div className="grid gap-4 md:grid-cols-3">
                  {Object.entries(scheduleByDate).map(([day, list]) => (
                    <div key={day} className="border border-[#263D59]/65 bg-[#050E1C]/80 p-5">
                      <p className="border-b border-[#263D59]/55 pb-2.5 font-mono text-[11px] tabular-nums text-[#B89A62] uppercase">
                        {day}
                      </p>
                      <div className="mt-3 divide-y divide-[#263D59]/45">
                        {list.map((s) => (
                          <div key={s.id} className="py-3 text-xs first:pt-0 last:pb-0">
                            <p className="font-medium text-[#F3EDE0]">{s.title}</p>
                            <p className="mt-1 font-mono text-[10px] tabular-nums text-[#D5BD8B]">
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
                <div className="divide-y divide-[#263D59]/55 border border-[#263D59]/65 bg-[#050E1C]/85">
                  {(data?.shifts || []).map((s) => (
                    <div key={s.id} className="grid gap-2 px-5 py-4 text-xs sm:grid-cols-12 sm:items-center">
                      <p className="font-mono text-[11px] tabular-nums text-[#D5BD8B] sm:col-span-4">
                        {new Date(s.starts_at).toLocaleString()} → {new Date(s.ends_at).toLocaleTimeString()}
                      </p>
                      <h3 className="font-display text-xl text-[#F3EDE0] sm:col-span-5">{s.title}</h3>
                      <p className="font-mono text-[11px] text-[#E8E1D2]/65 sm:col-span-3 sm:text-right">
                        {s.location || 'Main Floor'}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Shift Swap Form & Approvals */}
              <div className="space-y-4 border border-[#263D59]/65 bg-[#050E1C]/80 p-5">
                <h3 className="font-display text-xl text-[#D5BD8B]">Shift Swap Requests</h3>
                {(data?.shifts || []).length > 0 && (
                  <div className="flex flex-wrap gap-2.5">
                    <select
                      value={swapShiftId}
                      onChange={(e) => setSwapShiftId(e.target.value)}
                      className="portal-select w-56"
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
                      className="portal-input flex-1"
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
                      className="portal-btn-primary"
                    >
                      Request Swap
                    </button>
                  </div>
                )}
                {(data?.swaps || []).length > 0 && (
                  <div className="divide-y divide-[#263D59]/45 border border-[#263D59]/55 bg-[#030914]">
                    {(data?.swaps || []).map((sw) => (
                      <div
                        key={sw.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs"
                      >
                        <span>
                          <strong className="text-[#F3EDE0]">{sw.requester_name}</strong> ·{' '}
                          {sw.shift_title} — {sw.reason}
                        </span>
                        <div className="flex items-center gap-3">
                          <StatusLabel status={sw.status} />
                          {canManageDept && sw.status === 'pending' && (
                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                onClick={async () => {
                                  await apiRequest(`/api/eb/swaps/${sw.id}`, {
                                    method: 'PATCH',
                                    body: { status: 'approved' },
                                  });
                                  await loadWorkspace();
                                }}
                                className="border border-[#16A34A]/65 bg-[#05140E] px-2.5 py-1 font-mono text-[10px] text-[#86EFAC] uppercase hover:border-[#22C55E]"
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
                                className="portal-btn-danger py-1 px-2.5 text-[10px]"
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'stations' && (
            <div className="space-y-6">
              <PortalPageHeader
                kicker="Floor Positions & Procedures"
                title="Stations & Standard Operating Procedures"
                subtitle="Maintain station manuals and emergency protocol briefs across conference zones."
              />
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
                  className="grid gap-3 border border-[#263D59]/65 bg-[#050E1C]/80 p-5 sm:grid-cols-3"
                >
                  <input
                    required
                    placeholder="Station Name *"
                    value={newStationName}
                    onChange={(e) => setNewStationName(e.target.value)}
                    className="portal-input"
                  />
                  <input
                    placeholder="SOP Manual Summary"
                    value={newStationSop}
                    onChange={(e) => setNewStationSop(e.target.value)}
                    className="portal-input"
                  />
                  <button type="submit" className="portal-btn-primary">
                    Create Station
                  </button>
                </form>
              )}
              <div className="grid divide-y divide-[#263D59]/55 border border-[#263D59]/65 bg-[#050E1C]/85 md:grid-cols-2 md:divide-x">
                {(data?.stations || []).map((st) => (
                  <div key={st.id} className="p-6">
                    <h3 className="font-display text-2xl text-[#F3EDE0]">{st.name}</h3>
                    <p className="mt-2 font-sans text-xs leading-relaxed text-[#E8E1D2]/70">
                      {st.sop_manual}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'hierarchy' && (
            <div className="space-y-6">
              <PortalPageHeader
                kicker="Reporting Lines"
                title="Chain of Command"
                subtitle="Verified Secretariat, Directorate Head, and Executive Board reporting relationships."
              />
              {data?.hierarchy?.scoped ? (
                <div className="border border-[#B89A62]/45 bg-[#050E1C]/85 p-6">
                  <p className="font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                    Direct Reporting Department Head
                  </p>
                  {data.hierarchy.reportingHead ? (
                    <div className="mt-3 space-y-1">
                      <p className="font-display text-3xl text-[#F3EDE0]">
                        {data.hierarchy.reportingHead.full_name}
                      </p>
                      <p className="font-mono text-xs text-[#D5BD8B]">
                        {data.hierarchy.reportingHead.department_slug} ·{' '}
                        {data.hierarchy.reportingHead.email}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-2 font-sans text-xs text-[#E8E1D2]/65">
                      No direct Reporting Head bound yet.
                    </p>
                  )}
                </div>
              ) : (
                <div className="grid divide-y divide-[#263D59]/55 border border-[#263D59]/65 bg-[#050E1C]/85 md:grid-cols-3 md:divide-x md:divide-y-0">
                  <div className="p-5">
                    <p className="border-b border-[#263D59]/45 pb-2 font-mono text-[10px] tracking-[0.16em] text-[#B89A62] uppercase">
                      Secretariat Admins
                    </p>
                    <div className="mt-3 space-y-2">
                      {(data?.hierarchy?.admins || []).map((a) => (
                        <p key={a.user_id} className="text-xs text-[#F3EDE0]">
                          {a.full_name}
                        </p>
                      ))}
                    </div>
                  </div>
                  <div className="p-5">
                    <p className="border-b border-[#263D59]/45 pb-2 font-mono text-[10px] tracking-[0.16em] text-[#B89A62] uppercase">
                      Department Heads
                    </p>
                    <div className="mt-3 space-y-2">
                      {(data?.hierarchy?.heads || []).map((h) => (
                        <p key={h.user_id} className="text-xs text-[#F3EDE0]">
                          {h.full_name}{' '}
                          <span className="font-mono text-[10px] text-[#E8E1D2]/55">
                            ({h.department_slug})
                          </span>
                        </p>
                      ))}
                    </div>
                  </div>
                  <div className="p-5">
                    <p className="border-b border-[#263D59]/45 pb-2 font-mono text-[10px] tracking-[0.16em] text-[#B89A62] uppercase">
                      Executive Board
                    </p>
                    <div className="mt-3 space-y-2">
                      {(data?.hierarchy?.coHeads || []).map((c) => (
                        <p key={c.user_id} className="text-xs text-[#F3EDE0]">
                          {c.full_name}{' '}
                          <span className="font-mono text-[10px] text-[#E8E1D2]/55">
                            ({c.eb_rank})
                          </span>
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'announcements' && (
            <div className="space-y-6">
              <PortalPageHeader
                kicker="Executive Dispatches"
                title="Operational Bulletins"
                subtitle="Broadcast priority updates across the Executive Board and verify acknowledgments."
              />
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
                  className="grid gap-3 border border-[#263D59]/65 bg-[#050E1C]/80 p-5 sm:grid-cols-3"
                >
                  <input
                    required
                    placeholder="Bulletin Title"
                    value={newAnnTitle}
                    onChange={(e) => setNewAnnTitle(e.target.value)}
                    className="portal-input"
                  />
                  <input
                    required
                    placeholder="Details"
                    value={newAnnBody}
                    onChange={(e) => setNewAnnBody(e.target.value)}
                    className="portal-input"
                  />
                  <button type="submit" className="portal-btn-primary">
                    Post Bulletin
                  </button>
                </form>
              )}
              <div className="divide-y divide-[#263D59]/55 border border-[#263D59]/65 bg-[#050E1C]/85">
                {(data?.announcements || []).map((ann) => {
                  const acked = (data?.acknowledgedIds || []).includes(ann.id);
                  return (
                    <div
                      key={ann.id}
                      className="flex flex-wrap items-start justify-between gap-4 p-5"
                    >
                      <div>
                        <p className="font-display text-xl text-[#F3EDE0]">{ann.title}</p>
                        <p className="mt-1 font-sans text-xs leading-relaxed text-[#E8E1D2]/75">
                          {ann.body}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={acked}
                        onClick={async () => {
                          await apiRequest(`/api/eb/announcements/${ann.id}/ack`, { method: 'POST' });
                          await loadWorkspace();
                        }}
                        className="portal-btn-primary py-1.5 text-[10px] disabled:opacity-45"
                      >
                        {acked ? 'Acknowledged' : 'Acknowledge'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'event_day' && (
            <div className="space-y-6">
              <PortalPageHeader
                kicker="Floor Escalation & Resolution"
                title="Event-Day Live Incident Log"
                subtitle="Log real-time operational incidents across committees and halls until resolved."
              />
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
                className="grid gap-3 border border-[#DC2626]/45 bg-[#050E1C]/85 p-5 sm:grid-cols-4"
              >
                <input
                  required
                  placeholder="Incident Title *"
                  value={incTitle}
                  onChange={(e) => setIncTitle(e.target.value)}
                  className="portal-input"
                />
                <input
                  required
                  placeholder="Location"
                  value={incLoc}
                  onChange={(e) => setIncLoc(e.target.value)}
                  className="portal-input"
                />
                <select
                  value={incSev}
                  onChange={(e) => setIncSev(e.target.value)}
                  className="portal-select"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
                <button type="submit" className="portal-btn-danger">
                  Report Incident
                </button>
                <input
                  required
                  placeholder="Incident Description *"
                  value={incDesc}
                  onChange={(e) => setIncDesc(e.target.value)}
                  className="portal-input sm:col-span-4"
                />
              </form>

              <div className="divide-y divide-[#263D59]/55 border border-[#263D59]/65 bg-[#050E1C]/85">
                {(data?.incidents || []).map((inc) => (
                  <div
                    key={inc.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-3">
                        <StatusLabel
                          status={inc.severity}
                          tone={inc.severity === 'critical' ? 'red' : 'amber'}
                        />
                        <p className="font-medium text-[#F3EDE0]">{inc.title}</p>
                      </div>
                      <p className="mt-1 text-[#E8E1D2]/70">
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
                        className="inline-flex items-center border border-[#16A34A]/65 bg-[#05140E] px-3 py-1.5 font-mono text-[10px] text-[#86EFAC] uppercase hover:border-[#22C55E]"
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
