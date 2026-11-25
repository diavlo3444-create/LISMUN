import React, { Suspense, lazy, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import { navigate, usePathname } from './router';
import {
  LoadingSkeleton,
  PortalErrorBoundary,
  ToastProvider,
} from './components/UiPrimitives';
import App from '../App';

const PublicApplicationPage = lazy(() =>
  import('./components/PublicApplicationPage').then((m) => ({
    default: m.PublicApplicationPage,
  }))
);
const PortalDirectoryPage = lazy(() =>
  import('../portals/PortalLoginPages').then((m) => ({
    default: m.PortalDirectoryPage,
  }))
);
const PortalLoginPage = lazy(() =>
  import('../portals/PortalLoginPages').then((m) => ({
    default: m.PortalLoginPage,
  }))
);
const TeamMemberSignupPage = lazy(() =>
  import('../portals/OnboardingPages').then((m) => ({
    default: m.TeamMemberSignupPage,
  }))
);
const EbSignupPage = lazy(() =>
  import('../portals/OnboardingPages').then((m) => ({
    default: m.EbSignupPage,
  }))
);
const HeadSetupPage = lazy(() =>
  import('../portals/OnboardingPages').then((m) => ({
    default: m.HeadSetupPage,
  }))
);
const LegalDocumentPage = lazy(() =>
  import('../portals/OnboardingPages').then((m) => ({
    default: m.LegalDocumentPage,
  }))
);
const MyQrPassView = lazy(() =>
  import('../portals/ScannerAndPassPages').then((m) => ({
    default: m.MyQrPassView,
  }))
);
const LiveQrScannerWorkspace = lazy(() =>
  import('../portals/ScannerAndPassPages').then((m) => ({
    default: m.LiveQrScannerWorkspace,
  }))
);
const AdminPortal = lazy(() =>
  import('../portals/AdminPortal').then((m) => ({
    default: m.AdminPortal,
  }))
);
const HeadPortal = lazy(() =>
  import('../portals/HeadPortal').then((m) => ({
    default: m.HeadPortal,
  }))
);
const EbPortal = lazy(() =>
  import('../portals/EbPortal').then((m) => ({
    default: m.EbPortal,
  }))
);
const StaffPortal = lazy(() =>
  import('../portals/StaffPortal').then((m) => ({
    default: m.StaffPortal,
  }))
);

const PortalGuard: React.FC<{
  loginPath: string;
  allowedRoles: string[];
  children: React.ReactNode;
}> = ({ loginPath, allowedRoles, children }) => {
  const { ready, effectiveActor, consumeTestTicket } = useAuth();
  const [consuming, setConsuming] = useState(false);

  useEffect(() => {
    const ticket = new URLSearchParams(window.location.search).get('test_ticket');
    if (ready && effectiveActor?.role === 'super_admin' && ticket && !consuming) {
      setConsuming(true);
      void consumeTestTicket(ticket).finally(() => {
        setConsuming(false);
        window.history.replaceState({}, '', window.location.pathname);
      });
    }
  }, [ready, effectiveActor, consumeTestTicket, consuming]);

  if (!ready || consuming) {
    return (
      <div className="min-h-screen bg-[#030914] p-8">
        <LoadingSkeleton rows={5} />
      </div>
    );
  }

  if (!effectiveActor) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#030914] p-6 text-center text-[#E8E1D2]">
        <p className="font-mono text-xs tracking-[0.2em] text-[#B89A62] uppercase">
          Authentication Required
        </p>
        <h1 className="mt-3 font-display text-3xl text-[#E8E1D2]">
          Portal Session Not Active
        </h1>
        <p className="mt-2 max-w-md font-sans text-xs text-[#E8E1D2]/70">
          Sign in through the dedicated portal gateway to access conference operations.
        </p>
        <button
          type="button"
          onClick={() => navigate(loginPath)}
          className="mt-6 border border-[#B89A62] bg-[#071426] px-6 py-2.5 font-mono text-xs text-[#D5BD8B] uppercase"
        >
          Go to Portal Login
        </button>
      </div>
    );
  }

  if (!allowedRoles.includes(effectiveActor.role)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#030914] p-6 text-center text-[#E8E1D2]">
        <p className="font-mono text-xs tracking-[0.2em] text-[#FCA5A5] uppercase">
          Access Restricted
        </p>
        <h1 className="mt-3 font-display text-3xl text-[#E8E1D2]">
          Role Outside Portal Scope
        </h1>
        <button
          type="button"
          onClick={() => navigate('/portal')}
          className="mt-6 border border-[#B89A62] bg-[#071426] px-6 py-2.5 font-mono text-xs text-[#D5BD8B] uppercase"
        >
          Return to Portal Directory
        </button>
      </div>
    );
  }

  return <>{children}</>;
};

const RouteRenderer: React.FC = () => {
  const pathname = usePathname();

  // Preserved Living Atlas Public Conference Website
  if (pathname === '/' || pathname === '/preview') {
    return <App />;
  }

  return (
    <PortalErrorBoundary resetKey={pathname}>
      <Suspense
        fallback={
          <div className="min-h-screen bg-[#030914] p-8">
            <LoadingSkeleton rows={5} />
          </div>
        }
      >
        {pathname === '/apply' ? (
          <PublicApplicationPage />
        ) : pathname === '/portal' ? (
          <PortalDirectoryPage />
        ) : pathname === '/login' ? (
          <PortalLoginPage
            title="Unified Staff & Secretariat Sign In"
            subtitle="Authenticate once to automatically route to your LIS MUN portal."
          />
        ) : pathname === '/super-admin-login' ? (
          <PortalLoginPage
            expectedPortal="super_admin"
            title="Super Admin Control"
            subtitle="System governance, account RBAC matrix, overrides, stealth attribution, and Super IT Test Mode."
          />
        ) : pathname === '/admin-login' ? (
          <PortalLoginPage
            expectedPortal="admin"
            title="Admin Secretariat Login"
            subtitle="Stage 2 admissions decisions, emails, website CMS, and attendance monitoring."
          />
        ) : pathname === '/head-login' ? (
          <PortalLoginPage
            expectedPortal="head"
            title="Department Head Login"
            subtitle="Department & gender-scoped screening, Org Chart, Custom Groups, and Shifts."
          />
        ) : pathname === '/eb-login' ? (
          <PortalLoginPage
            expectedPortal="eb"
            title="Executive Board Login"
            subtitle="Co-Head command, Design & Marketing studios, EB shifts, stations, and Event-Day logs."
          />
        ) : pathname === '/security-login' ? (
          <PortalLoginPage
            expectedPortal="security"
            title="Security Scanner Desk Login"
            subtitle="Live entrance QR Check-In / Check-Out terminal."
          />
        ) : pathname === '/staff-login' ? (
          <PortalLoginPage
            expectedPortal="staff"
            title="Staff Member Login"
            subtitle="Personal conference QR credential, tasks, groups, and shift schedule."
          />
        ) : pathname === '/team-signup' || pathname === '/signup' ? (
          <TeamMemberSignupPage />
        ) : pathname === '/eb-signup' ? (
          <EbSignupPage />
        ) : pathname === '/head-setup' ? (
          <HeadSetupPage />
        ) : pathname === '/privacy' ? (
          <LegalDocumentPage doc="privacy" />
        ) : pathname === '/terms' ? (
          <LegalDocumentPage doc="terms" />
        ) : pathname.startsWith('/super-admin') ? (
          <PortalGuard loginPath="/super-admin-login" allowedRoles={['super_admin']}>
            <AdminPortal isSuperAdminRoute />
          </PortalGuard>
        ) : pathname.startsWith('/admin') ? (
          <PortalGuard loginPath="/admin-login" allowedRoles={['super_admin', 'admin']}>
            <AdminPortal isSuperAdminRoute={false} />
          </PortalGuard>
        ) : pathname.startsWith('/head') ? (
          <PortalGuard
            loginPath="/head-login"
            allowedRoles={['super_admin', 'admin', 'department_head']}
          >
            <HeadPortal />
          </PortalGuard>
        ) : pathname.startsWith('/eb') ? (
          <PortalGuard
            loginPath="/eb-login"
            allowedRoles={['super_admin', 'admin', 'department_head', 'executive_board']}
          >
            <EbPortal />
          </PortalGuard>
        ) : pathname === '/pass' ? (
          <PortalGuard
            loginPath="/login"
            allowedRoles={['super_admin', 'admin', 'department_head', 'executive_board', 'staff']}
          >
            <div className="min-h-screen bg-[#030914] p-6">
              <MyQrPassView />
            </div>
          </PortalGuard>
        ) : pathname === '/scanner' || pathname === '/security' ? (
          <PortalGuard
            loginPath="/security-login"
            allowedRoles={['super_admin', 'admin', 'department_head', 'executive_board', 'staff']}
          >
            <StaffPortal routeDepartment="security" />
          </PortalGuard>
        ) : pathname === '/volunteer' ? (
          <PortalGuard
            loginPath="/staff-login"
            allowedRoles={['super_admin', 'admin', 'department_head', 'executive_board', 'staff']}
          >
            <StaffPortal routeDepartment="volunteers" />
          </PortalGuard>
        ) : pathname === '/media' ? (
          <PortalGuard
            loginPath="/staff-login"
            allowedRoles={['super_admin', 'admin', 'department_head', 'executive_board', 'staff']}
          >
            <StaffPortal routeDepartment="media_press" />
          </PortalGuard>
        ) : pathname.startsWith('/staff') || pathname === '/team-members' ? (
          <PortalGuard
            loginPath="/staff-login"
            allowedRoles={['super_admin', 'admin', 'department_head', 'executive_board', 'staff']}
          >
            <StaffPortal routeDepartment={pathname.split('/')[2]} />
          </PortalGuard>
        ) : pathname === '/scanner-desk' ? (
          <PortalGuard
            loginPath="/security-login"
            allowedRoles={['super_admin', 'admin', 'department_head', 'executive_board', 'staff']}
          >
            <div className="min-h-screen bg-[#030914] p-6">
              <LiveQrScannerWorkspace />
            </div>
          </PortalGuard>
        ) : (
          <App />
        )}
      </Suspense>
    </PortalErrorBoundary>
  );
};

export const AppRouter: React.FC = () => (
  <AuthProvider>
    <ToastProvider>
      <RouteRenderer />
    </ToastProvider>
  </AuthProvider>
);
