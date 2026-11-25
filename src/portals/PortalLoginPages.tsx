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
  departments: Array<{ id: string; slug: string; name: string; description: string; is_sectioned: boolean; has_public_intake: boolean; registration_open: boolean; updated_at: string }>
): string {
  if (user.role === 'super_admin') return '/super-admin';
  if (user.role === 'admin') return '/admin';
  if (user.role === 'department_head') return '/head';
  if (user.role === 'executive_board') return '/eb';
  if (isSecurityAccount(user, departments)) return '/security';
  return `/staff/${user.department_slug || 'general'}`;
}

export const PortalDirectoryPage: React.FC = () => {
  const { systemStatus, user, departments } = useAuth();

  const cards: Array<{
    title: string;
    path: string;
    role: string;
    desc: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      title: 'Super Admin Control',
      path: '/super-admin-login',
      role: 'super_admin',
      desc: 'Account governance, RBAC permissions, Override & Stealth Spoof, Attendance Reset, and Super IT Test Mode.',
      icon: Shield,
    },
    {
      title: 'Admin Secretariat',
      path: '/admin-login',
      role: 'admin',
      desc: 'Stage 2 application finalization, Emails & Templates, Website CMS, Committees, Inquiries, and QR Registry.',
      icon: Building2,
    },
    {
      title: 'Department Head Portal',
      path: '/head-login',
      role: 'department_head',
      desc: 'Scoped review, Visual Org Chart & Roles, Custom Groups, Modern Shifts, HR/PR/DCC specialized hubs.',
      icon: Users,
    },
    {
      title: 'Executive Board Ops',
      path: '/eb-login',
      role: 'executive_board',
      desc: 'Co-Head, Design & Marketing operations workspaces, EB shifts & swaps, stations, and Event-Day incident log.',
      icon: KeyRound,
    },
    {
      title: 'Security Scanner Desk',
      path: '/security-login',
      role: 'security',
      desc: 'Live camera QR Check-In / Check-Out terminal with duplicate lock and real-time multi-gate sync.',
      icon: QrCode,
    },
    {
      title: 'Staff Member Portal',
      path: '/staff-login',
      role: 'staff',
      desc: 'Personal conference QR credential, assigned team groups, tasks, and shift schedules.',
      icon: Lock,
    },
  ];

  return (
    <div className="min-h-screen bg-[#030914] px-4 py-10 text-[#E8E1D2] md:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#263D59]/70 pb-6">
          <div>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-2 font-mono text-xs tracking-[0.16em] text-[#B89A62] uppercase hover:text-[#D5BD8B]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Return to Living Atlas</span>
            </button>
            <h1 className="mt-3 font-display text-4xl font-medium text-[#E8E1D2] md:text-5xl">
              LIS MUN Management Infrastructure
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {user && (
              <button
                type="button"
                onClick={() => navigate(resolveDefaultRouteForUser(user, departments))}
                className="border border-[#D5BD8B] bg-[#071426] px-4 py-2 font-mono text-xs tracking-[0.14em] text-[#D5BD8B] uppercase"
              >
                Continue as {user.full_name}
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate('/apply')}
              className="border border-[#263D59] bg-[#071426] px-4 py-2 font-mono text-xs tracking-[0.14em] text-[#E8E1D2] uppercase hover:border-[#B89A62]"
            >
              Public Staff / Chair Intake
            </button>
          </div>
        </div>

        {/* Live Backend Configuration Status */}
        <div className="mt-6 grid gap-3 border border-[#263D59]/70 bg-[#071426]/65 p-4 sm:grid-cols-3">
          <div className="flex items-center justify-between gap-2 border-b border-[#263D59]/50 pb-2 sm:border-r sm:border-b-0 sm:pr-4 sm:pb-0">
            <span className="flex items-center gap-2 font-mono text-[11px] text-[#E8E1D2]/80">
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
          <div className="flex items-center justify-between gap-2 border-b border-[#263D59]/50 pb-2 sm:border-r sm:border-b-0 sm:pr-4 sm:pb-0">
            <span className="font-mono text-[11px] text-[#E8E1D2]/80">Resend Bulk Email</span>
            <StatusLabel
              status={systemStatus?.resendConfigured ? 'Configured' : 'Manual Gmail Ready'}
              tone={systemStatus?.resendConfigured ? 'green' : 'gold'}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[11px] text-[#E8E1D2]/80">Shared Gmail OAuth2</span>
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
          <div className="mt-5 border border-[#D97706]/60 bg-[#1B1409] p-4 font-sans text-xs leading-relaxed text-[#FCD34D]">
            <strong>Neon DATABASE_URL Required:</strong> Add your Neon PostgreSQL connection string as <code className="font-mono">DATABASE_URL</code> in project Secrets to initialize schema migrations, accounts, and persistent conference records.
          </div>
        )}

        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <button
                key={c.path}
                type="button"
                onClick={() => navigate(c.path)}
                className="group flex flex-col justify-between border border-[#263D59]/80 bg-[#071426] p-6 text-left transition-colors hover:border-[#B89A62]"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <Icon className="h-5 w-5 text-[#D5BD8B]" />
                    <span className="font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                      {c.path}
                    </span>
                  </div>
                  <h2 className="mt-4 font-display text-2xl font-medium text-[#E8E1D2]">
                    {c.title}
                  </h2>
                  <p className="mt-2 font-sans text-xs leading-relaxed text-[#E8E1D2]/70">
                    {c.desc}
                  </p>
                </div>
                <div className="mt-6 flex items-center gap-2 font-mono text-[11px] tracking-[0.16em] text-[#D5BD8B] uppercase">
                  <span>Enter Portal</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
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
      else if (expectedPortal === 'security') navigate('/security');
      else if (expectedPortal === 'staff') navigate(`/staff/${user.department_slug || 'general'}`);
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
    <div className="flex min-h-screen items-center justify-center bg-[#030914] p-4 text-[#E8E1D2]">
      <div className="w-full max-w-md border border-[#B89A62]/45 bg-[#071426] p-8">
        <button
          type="button"
          onClick={() => navigate('/portal')}
          className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.16em] text-[#B89A62] uppercase hover:text-[#D5BD8B]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>All Portals</span>
        </button>

        <h1 className="mt-5 font-display text-3xl font-medium text-[#E8E1D2]">{title}</h1>
        <p className="mt-1.5 font-sans text-xs text-[#E8E1D2]/70">{subtitle}</p>

        {systemStatus && !systemStatus.dbConfigured && (
          <div className="mt-5 border border-[#D97706]/60 bg-[#1B1409] p-3.5 font-sans text-xs text-[#FCD34D]">
            Neon PostgreSQL <code className="font-mono">DATABASE_URL</code> is not configured yet. Set it in Secrets to enable authentication.
          </div>
        )}

        {error && (
          <div className="mt-5 border border-[#DC2626]/60 bg-[#1B0B10] p-3.5 font-sans text-xs text-[#FCA5A5]">
            {error}
          </div>
        )}

        {showFirstRunClaim ? (
          <form onSubmit={handleFirstRunClaim} className="mt-6 space-y-4">
            <div className="border border-[#B89A62]/40 bg-[#030914] p-3 font-sans text-xs text-[#D5BD8B]">
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
                className="mt-1.5 w-full border border-[#263D59] bg-[#030914] px-3 py-2.5 text-sm text-[#E8E1D2]"
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
                className="mt-1.5 w-full border border-[#263D59] bg-[#030914] px-3 py-2.5 text-sm text-[#E8E1D2]"
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
                className="mt-1.5 w-full border border-[#263D59] bg-[#030914] px-3 py-2.5 text-sm text-[#E8E1D2]"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full border border-[#B89A62] bg-[#030914] py-3 font-mono text-xs tracking-[0.18em] text-[#D5BD8B] uppercase"
            >
              {loading ? 'Provisioning Root Account...' : 'Claim Root Super Admin'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <label className="block font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                Email Address
              </label>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 w-full border border-[#263D59] bg-[#030914] px-3 py-2.5 text-sm text-[#E8E1D2]"
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
                className="mt-1.5 w-full border border-[#263D59] bg-[#030914] px-3 py-2.5 text-sm text-[#E8E1D2]"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full border border-[#B89A62] bg-[#030914] py-3 font-mono text-xs tracking-[0.18em] text-[#D5BD8B] uppercase disabled:opacity-50"
            >
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
