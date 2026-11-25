import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, ShieldCheck } from 'lucide-react';
import { apiRequest } from '../client/api';
import { navigate } from '../client/router';

type SetupStatus = {
  dbConfigured: boolean;
  dbConnected: boolean;
  firstRunSetupNeeded: boolean;
  primarySuperAdminEmailConfigured: boolean;
};

export const SuperAdminSetupPage: React.FC = () => {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [statusError, setStatusError] = useState('');
  const [fullName, setFullName] = useState('LIS MUN Super Admin');
  const [email, setEmail] = useState('diavlo3444@gmail.com');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(false);

  useEffect(() => {
    let active = true;
    apiRequest<SetupStatus>('/api/system/status', { skipAuth: true })
      .then((result) => {
        if (active) setStatus(result);
      })
      .catch((err) => {
        if (active) setStatusError(err instanceof Error ? err.message : 'Could not verify setup status.');
      });
    return () => {
      active = false;
    };
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    if (password.length < 10 || password.length > 128) {
      setError('Use a password between 10 and 128 characters.');
      return;
    }
    setBusy(true);
    try {
      await apiRequest('/api/auth/claim-super-admin', {
        method: 'POST',
        skipAuth: true,
        body: { email: email.trim().toLowerCase(), full_name: fullName.trim(), password },
      });
      setCreated(true);
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Super Admin setup failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="portal-app-shell portal-gateway relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12 text-[#E8E1D2]">
      <div className="pointer-events-none absolute inset-0 atlas-engraving-grid opacity-30" />
      <div className="portal-modal-enter relative w-full max-w-lg border border-[#263D59]/75 bg-[#050E1C]/95 p-7 shadow-2xl shadow-black/50 sm:p-10">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase hover:text-[#D5BD8B] whitespace-nowrap"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Return to Atlas</span>
        </button>

        <div className="mt-7 flex items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center border border-[#B89A62]/45 bg-[#030914] text-[#D5BD8B]">
            {created ? <CheckCircle2 className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
          </div>
          <div>
            <p className="font-mono text-[10px] tracking-[0.22em] text-[#B89A62] uppercase">
              LIS MUN · Initialization
            </p>
            <h1 className="font-display text-3xl font-medium text-[#F3EDE0] sm:text-4xl">
              Super Admin Setup
            </h1>
          </div>
        </div>

        <p className="mt-3 font-sans text-xs leading-6 text-[#E8E1D2]/65 md:text-sm">
          Create the first system owner account. This page works only while no active Super Admin exists.
        </p>

        {created ? (
          <section className="mt-7 border border-[#16A34A]/50 bg-[#05140E] p-5">
            <p className="font-mono text-xs tracking-wider text-[#86EFAC] uppercase">
              Account created
            </p>
            <p className="mt-2 font-sans text-sm text-[#E8E1D2]/80">
              Your Super Admin account is ready. Sign in using the email and password you just entered.
            </p>
            <button
              type="button"
              onClick={() => navigate('/super-admin-login')}
              className="portal-btn-primary mt-5 w-full py-3"
            >
              Go to Super Admin Login
            </button>
          </section>
        ) : (
          <>
            {statusError && (
              <p className="mt-6 border border-[#DC2626]/55 bg-[#16080D] p-3 text-xs text-[#FCA5A5]">
                {statusError}
              </p>
            )}
            {status && (!status.dbConfigured || !status.dbConnected) && (
              <p className="mt-6 border border-[#D97706]/55 bg-[#140F06] p-3 text-xs text-[#FCD34D]">
                The database is not ready. Check the deployment and try again.
              </p>
            )}
            {status && status.dbConnected && !status.firstRunSetupNeeded && (
              <p className="mt-6 border border-[#D97706]/55 bg-[#140F06] p-3 text-xs text-[#FCD34D]">
                Initial setup has already been claimed. Use the Super Admin login page instead.
              </p>
            )}
            {status && status.dbConnected && status.firstRunSetupNeeded && (
              <p className="mt-6 border border-[#B89A62]/35 bg-[#030914] p-3 text-xs text-[#D5BD8B]">
                {status.primarySuperAdminEmailConfigured
                  ? 'The server has a designated initial Super Admin email.'
                  : 'Warning: PRIMARY_SUPER_ADMIN_EMAIL is not configured. The first successful claim will become the system owner.'}
              </p>
            )}
            <form onSubmit={submit} className="mt-6 space-y-4 border-t border-[#263D59]/55 pt-6">
              {error && (
                <p role="alert" className="border border-[#DC2626]/55 bg-[#16080D] p-3 text-xs text-[#FCA5A5]">
                  {error}
                </p>
              )}
              <label className="block">
                <span className="font-mono text-[10px] tracking-[0.16em] text-[#B89A62] uppercase">
                  Full name
                </span>
                <input
                  required
                  minLength={2}
                  maxLength={120}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="portal-input mt-1.5"
                />
              </label>
              <label className="block">
                <span className="font-mono text-[10px] tracking-[0.16em] text-[#B89A62] uppercase">
                  Account email
                </span>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="portal-input mt-1.5"
                />
              </label>
              <label className="block">
                <span className="font-mono text-[10px] tracking-[0.16em] text-[#B89A62] uppercase">
                  Password · 10–128 characters
                </span>
                <input
                  required
                  type="password"
                  minLength={10}
                  maxLength={128}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="portal-input mt-1.5"
                />
              </label>
              <label className="block">
                <span className="font-mono text-[10px] tracking-[0.16em] text-[#B89A62] uppercase">
                  Confirm password
                </span>
                <input
                  required
                  type="password"
                  minLength={10}
                  maxLength={128}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="portal-input mt-1.5"
                />
              </label>
              <button
                type="submit"
                disabled={busy || !status?.dbConnected || !status.firstRunSetupNeeded}
                className="portal-btn-primary w-full py-3 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? 'Creating Super Admin…' : 'Create Initial Super Admin'}
              </button>
            </form>
          </>
        )}

        <p className="mt-7 border-t border-[#263D59]/55 pt-4 text-[11px] leading-5 text-[#E8E1D2]/45">
          Setup is one-time only. Choose a unique password that you have not shared or used on another account.
        </p>
      </div>
    </main>
  );
};
