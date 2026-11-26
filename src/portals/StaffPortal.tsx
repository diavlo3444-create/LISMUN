import React, { useState } from 'react';
import {
  Bell,
  Building2,
  QrCode,
  Shield,
} from 'lucide-react';
import { useAuth } from '../client/AuthContext';
import { DashboardShell, type ShellNavItem } from '../client/components/DashboardShell';
import {
  NotificationsCenterView,
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
        { id: 'notifications', label: 'Notifications', group: 'Duty', icon: Bell },
      ]
    : isSimplifiedOperational
    ? [
        { id: 'my_qr', label: 'My QR Credential', group: 'Pass & Duty', icon: QrCode },
        { id: 'notifications', label: 'Notifications', group: 'Pass & Duty', icon: Bell },
      ]
    : [
        { id: 'my_qr', label: 'My QR Credential', group: 'Overview', icon: QrCode },
        { id: 'notifications', label: 'Notifications', group: 'Updates', icon: Bell },
      ];

  return (
    <DashboardShell
      portalLabel={isSecurity ? 'Security Entrance Terminal' : `${deptSlug.toUpperCase()} Staff Portal`}
      breadcrumbSection={navItems.find((n) => n.id === activeTab)?.label || 'Credential'}
      departmentTheme={isSecurity ? 'security' : deptSlug}
      navItems={navItems}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
    >
      {activeTab === 'scanner' && isSecurity && <LiveQrScannerWorkspace />}
      {activeTab === 'my_qr' && <MyQrPassView />}
      {activeTab === 'notifications' && <NotificationsCenterView />}
    </DashboardShell>
  );
};
