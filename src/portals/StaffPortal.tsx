import React, { useState } from 'react';
import {
  Bell,
  Building2,
  Calendar,
  ClipboardCheck,
  QrCode,
  Shield,
  Users,
} from 'lucide-react';
import { useAuth } from '../client/AuthContext';
import { DashboardShell, type ShellNavItem } from '../client/components/DashboardShell';
import {
  DepartmentWorkspaceView,
  GroupManagementView,
  NotificationsCenterView,
  OrgChartAndRolesView,
  ShiftManagementView,
} from './OperationalHubComponents';
import { LiveQrScannerWorkspace, MyQrPassView } from './ScannerAndPassPages';
import {
  canonicalDepartmentForStorage,
  isSecurityAccount,
} from '../shared/permissions';

export const StaffPortal: React.FC<{ routeDepartment?: string }> = ({
  routeDepartment,
}) => {
  const { effectiveActor, departments } = useAuth();
  const deptSlug = canonicalDepartmentForStorage(
    routeDepartment || effectiveActor?.department_slug || 'general'
  );
  const isSecurity =
    (effectiveActor ? isSecurityAccount(effectiveActor, departments) : false) ||
    deptSlug === 'security';
  const isSimplifiedOperational = ['volunteers', 'media_press', 'media', 'press'].includes(deptSlug);

  const [activeTab, setActiveTab] = useState(isSecurity ? 'scanner' : 'my_qr');

  const navItems: ShellNavItem[] = isSecurity
    ? [
        { id: 'scanner', label: 'Security QR Scanner', group: 'Security Desk', icon: Shield },
        { id: 'my_qr', label: 'My QR Credential', group: 'Security Desk', icon: QrCode },
        { id: 'shifts', label: 'My Shifts', group: 'Duty', icon: Calendar },
        { id: 'notifications', label: 'Notifications', group: 'Duty', icon: Bell },
      ]
    : isSimplifiedOperational
    ? [
        { id: 'my_qr', label: 'My QR Credential', group: 'Pass & Duty', icon: QrCode },
        { id: 'shifts', label: 'My Shifts', group: 'Pass & Duty', icon: Calendar },
        { id: 'roles', label: 'My Role & Tasks', group: 'Pass & Duty', icon: ClipboardCheck },
        { id: 'groups', label: 'My Squads', group: 'Pass & Duty', icon: Users },
        { id: 'notifications', label: 'Notifications', group: 'Pass & Duty', icon: Bell },
      ]
    : [
        { id: 'my_qr', label: 'My QR Credential', group: 'Overview', icon: QrCode },
        { id: 'workspace', label: 'Department Workspace', group: 'Workspace', icon: Building2 },
        { id: 'roles', label: 'My Tasks & Roles', group: 'Workspace', icon: ClipboardCheck },
        { id: 'groups', label: 'My Groups', group: 'Workspace', icon: Users },
        { id: 'shifts', label: 'My Shifts', group: 'Workspace', icon: Calendar },
        { id: 'notifications', label: 'Notifications', group: 'Updates', icon: Bell },
      ];

  return (
    <DashboardShell
      portalLabel={isSecurity ? 'Security Entrance Terminal' : `${deptSlug.toUpperCase()} Staff Portal`}
      breadcrumbSection={navItems.find((n) => n.id === activeTab)?.label || 'Credential'}
      navItems={navItems}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
    >
      {activeTab === 'scanner' && isSecurity && <LiveQrScannerWorkspace />}
      {activeTab === 'my_qr' && <MyQrPassView />}
      {activeTab === 'workspace' && <DepartmentWorkspaceView departmentSlug={deptSlug} />}
      {activeTab === 'roles' && <OrgChartAndRolesView departmentSlug={deptSlug} readOnly />}
      {activeTab === 'groups' && <GroupManagementView departmentSlug={deptSlug} readOnly />}
      {activeTab === 'shifts' && <ShiftManagementView departmentSlug={deptSlug} readOnly />}
      {activeTab === 'notifications' && <NotificationsCenterView />}
    </DashboardShell>
  );
};
