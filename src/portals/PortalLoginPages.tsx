import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Database,
  KeyRound,
  Lock,
  QrCode,
  Shield,
  Users,
} from 'lucide-react';
import { useAuth } from '../client/AuthContext';
import { navigate } from '../client/router';
import type { PortalKey, UserProfile } from '../shared/types';
import { isSecurityAccount } from '../shared/permissions';
import { StatusLabel } from '../client/components/UiPrimitives';

function resolveDefaultRouteForUser(
  user: UserProfile,
  departments: Array<{
    id: string;
    slug: string;
    name: string;
    description: string;
    is_sectioned: boolean;
    has_public_intake: boolean;
    registration_open: boolean;
    updated_at: string;
  }>
): string {
  if (user.role === 'super_admin') return '/super-admin';
  if (user.role === 'admin') return '/admin';
  if (user.role === 'department_head') return '/head';
  if (user.role === 'executive_board') return '/eb';
  return '/staff';
}

export const PortalDirectoryPage: React.FC = () => {
  const { systemStatus, user, departments } = useAuth();

  const cards: Array<{
    index: string;
    title: string;
    path: string;
    role: string;
    desc: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      index: '01',
      title: 'Super Admin Control',
      path: '/super-admin-login',
      role: 'Root Governance',
      desc: 'Account governance, RBAC permissions, Override & Stealth attribution, Attendance Reset, and Super IT Test Mode.',
      icon: Shield,
    },
    {
      index: '02',
      title: 'Admin Secretariat',
      path: '/admin-login',
      role: 'Stage 2 & CMS',
      desc: 'Stage 2 application finalization, Emails & Templates, Website CMS, Committees, Inquiries, and QR Registry.',
      icon: Building2,
    },
    {
      index: '03',
      title: 'Department Head Portal',
      path: '/head-login',
      role: 'Directorate Scope',
      desc: 'Scoped review, Visual Org Chart & Roles, Custom Groups, Shift scheduling, and HR/PR/DCC specialized hubs.',
      icon: Users,
    },
    {
      index: '04',
      title: 'Executive Board Ops',
      path: '/eb-login',
      role: 'EB Command',
      desc: 'Co-Head, Design & Marketing workspaces, EB shifts & swaps, floor stations, and Event-Day incident log.',
      icon: KeyRound,
    },
    {
      index: '05',
      title: 'Staff Member Portal',
      path: '/staff-login',
      role: 'Credential & Duty',
      desc: 'Personal conference QR credential, assigned team groups, tasks, and shift schedules.',
      icon: Lock,
    },
  ];

  return (
    <div className="portal-app-shell portal-gateway min-h-screen px-4 py-10 text-[#E8E1D2] md:px-10 md:py-14">
      <div className="portal-panel-enter mx-auto max-w-6xl">
        <header className="flex flex-wrap items-end justify-between gap-6 border-b border-[#263D59]/65 pb-8">
          <div className="max-w-2xl">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.18em] text-[#B89A62] uppercase transition-colors hover:text-[#D5BD8B] whitespace-nowrap"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Return to Living Atlas</span>
            </button>
            <h1 className="mt-4 font-display text-4xl font-medium tracking-tight text-[#F3EDE0] md:text-5xl">
              LIS MUN Portal Directory
            </h1>
            <p className="mt-2.5 font-sans text-sm leading-relaxed text-[#E8E1D2]/65">
              Select your designated institutional workspace. Access routes and data views are verified against role-based permissions.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {user && (
              <button
                type="button"
                onClick={() => navigate(resolveDefaultRouteForUser(user, departments))}
                className="portal-btn-primary"
              >
                Continue as {user.full_name}
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate('/apply')}
              className="portal-btn-secondary"
            >
              Public Staff / Chair Intake
            </button>
          </div>
        </header>

        {/* Live Backend Configuration Ledger */}
        <div className="mt-7 grid divide-y divide-[#263D59]/50 border border-[#263D59]/65 bg-[#050E1C]/80 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="flex items-center justify-between gap-3 px-5 py-3.5">
            <span className="flex items-center gap-2 font-mono text-[11px] text-[#E8E1D2]/75">
              <Database className="h-3.5 w-3.5 text-[#B89A62]" />
              Neon PostgreSQL
            </span>
            <StatusLabel
              status={
                systemStatus?.dbConnected
                  ? 'Connected'
                  : systemStatus?.dbConfigured
                  ? 'Connecting'
                  : 'Secret Needed'
              }
              tone={systemStatus?.dbConnected ? 'green' : 'amber'}
            />
          </div>
          <div className="flex items-center justify-between gap-3 px-5 py-3.5">
            <span className="font-mono text-[11px] text-[#E8E1D2]/75">Resend Bulk Email</span>
            <StatusLabel
              status={systemStatus?.resendConfigured ? 'Configured' : 'Manual Gmail Ready'}
              tone={systemStatus?.resendConfigured ? 'green' : 'gold'}
            />
          </div>
          <div className="flex items-center justify-between gap-3 px-5 py-3.5">
            <span className="font-mono text-[11px] text-[#E8E1D2]/75">Shared Gmail OAuth2</span>
            <StatusLabel
              status={
                systemStatus?.gmailConnected
                  ? 'Connected'
                  : systemStatus?.gmailOAuthConfigured
                  ? 'Ready'
                  : 'OAuth Unconfigured'
              }
              tone={systemStatus?.gmailConnected ? 'green' : 'neutral'}
            />
          </div>
        </div>

        {systemStatus && !systemStatus.dbConfigured && (
          <div className="mt-5 border border-[#D97706]/50 bg-[#140F06] px-5 py-3.5 font-sans text-xs leading-relaxed text-[#FCD34D]">
            <strong>Neon DATABASE_URL Required:</strong> Add your Neon PostgreSQL connection string as{' '}
            <code className="font-mono">DATABASE_URL</code> in project Secrets to initialize schema migrations, accounts, and persistent conference records.
          </div>
        )}

        <div className="mt-8 grid divide-y divide-[#263D59]/55 border border-[#263D59]/65 bg-[#050E1C]/75 md:grid-cols-2 lg:grid-cols-3 lg:divide-x">
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <button
                key={c.path}
                type="button"
                onClick={() => navigate(c.path)}
                className="group flex flex-col justify-between border-b border-[#263D59]/45 p-7 text-left transition-colors hover:bg-[#071426]/90 lg:border-b-0"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] tracking-[0.2em] text-[#B89A62] uppercase">
                      {c.index} · {c.role}
                    </span>
                    <Icon className="h-4 w-4 text-[#D5BD8B]/75 transition-colors group-hover:text-[#D5BD8B]" />
                  </div>
                  <h2 className="mt-4 font-display text-2xl font-medium text-[#F3EDE0] transition-colors group-hover:text-[#E6D2A8]">
                    {c.title}
                  </h2>
                  <p className="mt-2.5 font-sans text-xs leading-relaxed text-[#E8E1D2]/65">
                    {c.desc}
                  </p>
                </div>
                <div className="mt-7 flex items-center justify-between border-t border-[#263D59]/40 pt-4 font-mono text-[11px] tracking-[0.16em] text-[#D5BD8B] uppercase">
                  <span>Enter Portal</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const PortalLoginPage: React.FC<{
  expectedPortal?: PortalKey;
  title: string;
  subtitle: string;
}> = ({ expectedPortal, title, subtitle }) => {
  const { systemStatus, signIn, claimSuperAdmin, departments } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [claimName, setClaimName] = useState('');
  const [claimPassword, setClaimPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { user } = await signIn({
        email,
        password,
        expectedPortal,
      });
      if (expectedPortal === 'super_admin') navigate('/super-admin');
      else if (expectedPortal === 'admin') navigate('/admin');
      else if (expectedPortal === 'head') navigate('/head');
      else if (expectedPortal === 'eb') navigate('/eb');
      else if (expectedPortal === 'security') navigate('/staff');
      else if (expectedPortal === 'staff') navigate(resolveDefaultRouteForUser(user, departments));
      else navigate(resolveDefaultRouteForUser(user, departments));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleFirstRunClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await claimSuperAdmin({ email, full_name: claimName, password: claimPassword });
      navigate('/super-admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Super Admin claim failed.');
    } finally {
      setLoading(false);
    }
  };

  const showFirstRunClaim = Boolean(systemStatus?.dbConnected && systemStatus?.firstRunSetupNeeded);

  return (
    <div
      data-portal-dept={expectedPortal === 'security' ? 'security' : 'secretariat'}
      className="portal-app-shell portal-gateway flex min-h-screen items-center justify-center px-4 py-10 text-[#E8E1D2]"
    >
      <div className="portal-modal-enter w-full max-w-4xl border border-[#263D59]/75 bg-[#050E1C]/92 shadow-2xl shadow-black/50 lg:grid lg:grid-cols-12">
        {/* Left Editorial Identity Column */}
        <div className="flex flex-col justify-between border-b border-[#263D59]/60 bg-[#040B16] p-8 lg:col-span-5 lg:border-r lg:border-b-0 lg:p-10">
          <div>
            <button
              type="button"
              onClick={() => navigate('/portal')}
              className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.16em] text-[#B89A62] uppercase transition-colors hover:text-[#D5BD8B] whitespace-nowrap"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>All Portals</span>
            </button>
            <p className="mt-8 font-mono text-[10px] tracking-[0.24em] text-[#B89A62] uppercase">
              LIS MUN Institutional Gateway
            </p>
            <h1 className="mt-2 font-display text-3xl font-medium tracking-tight text-[#F3EDE0] md:text-4xl">
              {title}
            </h1>
            <p className="mt-3 font-sans text-xs leading-relaxed text-[#E8E1D2]/65 md:text-[13px]">
              {subtitle}
            </p>
          </div>
          <div className="mt-8 border-t border-[#263D59]/50 pt-4 font-mono text-[10px] tracking-[0.16em] text-[#E8E1D2]/45 uppercase">
            Session isolated per portal boundary
          </div>
        </div>

        {/* Right Form Panel */}
        <div className="p-8 lg:col-span-7 lg:p-10">
          {systemStatus && !systemStatus.dbConfigured && (
            <div className="mb-5 border border-[#D97706]/55 bg-[#140F06] p-3.5 font-sans text-xs text-[#FCD34D]">
              Neon PostgreSQL <code className="font-mono">DATABASE_URL</code> is not configured yet. Set it in Secrets to enable authentication.
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mb-5 border border-[#DC2626]/55 bg-[#16080D] p-3.5 font-sans text-xs text-[#FCA5A5]"
            >
              {error}
            </div>
          )}

          {showFirstRunClaim ? (
            <form onSubmit={handleFirstRunClaim} className="space-y-4">
              <div className="border border-[#B89A62]/40 bg-[#030914] p-3.5 font-sans text-xs leading-relaxed text-[#D5BD8B]">
                First-Run Setup: No Super Admin exists yet in Neon. Claim the root Super Admin account below.
              </div>
              <div>
                <label className="block font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                  Full Name *
                </label>
                <input
                  required
                  value={claimName}
                  onChange={(e) => setClaimName(e.target.value)}
                  placeholder="Primary Super Admin"
                  className="portal-input mt-1.5"
                />
              </div>
              <div>
                <label className="block font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                  Super Admin Email *
                </label>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="superadmin@school.edu"
                  className="portal-input mt-1.5"
                />
              </div>
              <div>
                <label className="block font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                  Choose Password (10+ chars) *
                </label>
                <input
                  required
                  type="password"
                  minLength={10}
                  value={claimPassword}
                  onChange={(e) => setClaimPassword(e.target.value)}
                  className="portal-input mt-1.5"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="portal-btn-primary w-full py-3"
              >
                {loading ? 'Provisioning Root Account...' : 'Claim Root Super Admin'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                  Email Address
                </label>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@lismun.org"
                  className="portal-input mt-2"
                />
              </div>
              <div>
                <label className="block font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                  Password
                </label>
                <input
                  required
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter account password"
                  className="portal-input mt-2"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="portal-btn-primary w-full py-3 disabled:opacity-50"
              >
                {loading ? 'Authenticating...' : 'Sign In'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
