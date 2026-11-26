import React, { Suspense, lazy, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import { navigate, usePathname } from './router';
import {
  LoadingSkeleton,
  PortalErrorBoundary,
  ToastProvider,
  useToast,
} from './components/UiPrimitives';
import App from '../App';

const SuperAdminSetupPage = lazy(() =>
  import('../portals/SuperAdminSetupPage').then((m) => ({ default: m.SuperAdminSetupPage }))
);
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
  const { ready, user, effectiveActor, consumeTestTicket } = useAuth();
  const { addToast } = useToast();
  const [consuming, setConsuming] = useState(false);

  useEffect(() => {
    const ticket = new URLSearchParams(window.location.search).get('test_ticket');
    if (ready && user?.role === 'super_admin' && ticket && !consuming) {
      setConsuming(true);
      void consumeTestTicket(ticket)
        .catch((err) => {
          addToast(
            err instanceof Error ? err.message : 'Preview ticket is invalid or expired.',
            'error'
          );
        })
        .finally(() => {
          setConsuming(false);
          window.history.replaceState({}, '', window.location.pathname);
        });
    }
  }, [ready, user, consumeTestTicket, consuming, addToast]);

  if (!ready || consuming) {
    return (
      <div className="portal-app-shell min-h-screen p-8">
        <div className="mx-auto max-w-4xl">
          <LoadingSkeleton rows={5} />
        </div>
      </div>
    );
  }

  if (!effectiveActor) {
    return (
      <div className="portal-app-shell portal-gateway flex min-h-screen items-center justify-center p-6 text-[#E8E1D2]">
        <div className="portal-modal-enter w-full max-w-md border border-[#263D59]/75 bg-[#050E1C]/92 p-8 text-center shadow-2xl shadow-black/50">
          <p className="font-mono text-[10px] tracking-[0.22em] text-[#B89A62] uppercase">
            Authentication Required
          </p>
          <h1 className="mt-2 font-display text-3xl text-[#F3EDE0]">
            Portal Session Not Active
          </h1>
          <p className="mt-2.5 font-sans text-xs leading-relaxed text-[#E8E1D2]/65">
            Sign in through the dedicated portal gateway to access conference operations.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => navigate(loginPath)}
              className="portal-btn-primary"
            >
              Go to Portal Login
            </button>
            <button
              type="button"
              onClick={() => navigate('/portal')}
              className="portal-btn-secondary"
            >
              Portal Directory
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!allowedRoles.includes(effectiveActor.role)) {
    return (
      <div className="portal-app-shell portal-gateway flex min-h-screen items-center justify-center p-6 text-[#E8E1D2]">
        <div className="portal-modal-enter w-full max-w-md border border-[#DC2626]/45 bg-[#050E1C]/92 p-8 text-center shadow-2xl shadow-black/50">
          <p className="font-mono text-[10px] tracking-[0.22em] text-[#FCA5A5] uppercase">
            Access Restricted
          </p>
          <h1 className="mt-2 font-display text-3xl text-[#F3EDE0]">
            Role Outside Portal Scope
          </h1>
          <button
            type="button"
            onClick={() => navigate('/portal')}
            className="portal-btn-primary mt-6"
          >
            Return to Portal Directory
          </button>
        </div>
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
        {pathname === '/setup' ? (
          <SuperAdminSetupPage />
        ) : pathname === '/apply' ? (
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
        ) : pathname === '/security-login' || pathname === '/staff-login' ? (
          <PortalLoginPage
            expectedPortal="staff"
            title="Staff Portal"
            subtitle="Sign in once. Your account determines your department and the workspace you can access."
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
            loginPath="/staff-login"
            allowedRoles={['super_admin', 'admin', 'department_head', 'executive_board', 'staff']}
          >
            <StaffPortal />
          </PortalGuard>
        ) : pathname === '/volunteer' ? (
          <PortalGuard
            loginPath="/staff-login"
            allowedRoles={['super_admin', 'admin', 'department_head', 'executive_board', 'staff']}
          >
            <StaffPortal />
          </PortalGuard>
        ) : pathname === '/media' ? (
          <PortalGuard
            loginPath="/staff-login"
            allowedRoles={['super_admin', 'admin', 'department_head', 'executive_board', 'staff']}
          >
            <StaffPortal />
          </PortalGuard>
        ) : pathname.startsWith('/staff') || pathname === '/team-members' ? (
          <PortalGuard
            loginPath="/staff-login"
            allowedRoles={['super_admin', 'admin', 'department_head', 'executive_board', 'staff']}
          >
            <StaffPortal />
          </PortalGuard>
        ) : pathname === '/scanner-desk' ? (
          <PortalGuard
            loginPath="/staff-login"
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
