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
      .then((result) => { if (active) setStatus(result); })
      .catch((err) => { if (active) setStatusError(err instanceof Error ? err.message : 'Could not verify setup status.'); });
    return () => { active = false; };
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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#030914] px-4 py-12 text-[#E8E1D2]">
      <div className="pointer-events-none absolute inset-0 atlas-engraving-grid opacity-40" />
      <div className="relative w-full max-w-lg border border-[#B89A62]/40 bg-[#071426]/95 p-7 shadow-2xl shadow-black/40 sm:p-10">
        <button type="button" onClick={() => navigate('/')} className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
          <ArrowLeft className="h-3.5 w-3.5" /> Return to Atlas
        </button>
        <div className="mt-8 flex h-12 w-12 items-center justify-center border border-[#B89A62]/45 bg-[#030914] text-[#D5BD8B]">
          {created ? <CheckCircle2 className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
        </div>
        <p className="mt-6 font-mono text-[10px] tracking-[0.24em] text-[#B89A62] uppercase">LIS MUN · Initialisation</p>
        <h1 className="mt-2 font-display text-4xl">Super Admin Setup</h1>
        <p className="mt-3 text-sm leading-6 text-[#E8E1D2]/65">
          Create the first system owner account. This page works only while no active Super Admin exists.
        </p>

        {created ? (
          <section className="mt-8 border border-emerald-700/50 bg-emerald-950/30 p-5">
            <p className="font-mono text-xs tracking-wider text-emerald-300 uppercase">Account created</p>
            <p className="mt-2 text-sm text-[#E8E1D2]/80">Your Super Admin account is ready. Sign in using the email and password you just entered.</p>
            <button type="button" onClick={() => navigate('/super-admin-login')} className="mt-5 w-full border border-[#B89A62] bg-[#030914] px-4 py-3 font-mono text-xs tracking-widest text-[#D5BD8B] uppercase">
              Go to Super Admin Login
            </button>
          </section>
        ) : (
          <>
            {statusError && <p className="mt-6 border border-red-800/60 bg-red-950/30 p-3 text-xs text-red-200">{statusError}</p>}
            {status && (!status.dbConfigured || !status.dbConnected) && (
              <p className="mt-6 border border-amber-700/60 bg-amber-950/30 p-3 text-xs text-amber-200">The database is not ready. Check the deployment and try again.</p>
            )}
            {status && status.dbConnected && !status.firstRunSetupNeeded && (
              <p className="mt-6 border border-amber-700/60 bg-amber-950/30 p-3 text-xs text-amber-200">Initial setup has already been claimed. Use the Super Admin login page instead.</p>
            )}
            {status && status.dbConnected && status.firstRunSetupNeeded && (
              <p className="mt-6 border border-[#B89A62]/30 bg-[#030914] p-3 text-xs text-[#D5BD8B]">
                {status.primarySuperAdminEmailConfigured
                  ? 'The server has a designated initial Super Admin email.'
                  : 'Warning: PRIMARY_SUPER_ADMIN_EMAIL is not configured. The first successful claim will become the system owner.'}
              </p>
            )}
            <form onSubmit={submit} className="mt-7 space-y-4">
              {error && <p role="alert" className="border border-red-800/60 bg-red-950/30 p-3 text-xs text-red-200">{error}</p>}
              <label className="block">
                <span className="font-mono text-[10px] tracking-[0.16em] text-[#B89A62] uppercase">Full name</span>
                <input required minLength={2} maxLength={120} value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-2 w-full border border-[#263D59] bg-[#030914] px-3 py-3 text-sm outline-none focus:border-[#B89A62]" />
              </label>
              <label className="block">
                <span className="font-mono text-[10px] tracking-[0.16em] text-[#B89A62] uppercase">Account email</span>
                <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 w-full border border-[#263D59] bg-[#030914] px-3 py-3 text-sm outline-none focus:border-[#B89A62]" />
              </label>
              <label className="block">
                <span className="font-mono text-[10px] tracking-[0.16em] text-[#B89A62] uppercase">Password · 10–128 characters</span>
                <input required type="password" minLength={10} maxLength={128} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 w-full border border-[#263D59] bg-[#030914] px-3 py-3 text-sm outline-none focus:border-[#B89A62]" />
              </label>
              <label className="block">
                <span className="font-mono text-[10px] tracking-[0.16em] text-[#B89A62] uppercase">Confirm password</span>
                <input required type="password" minLength={10} maxLength={128} autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="mt-2 w-full border border-[#263D59] bg-[#030914] px-3 py-3 text-sm outline-none focus:border-[#B89A62]" />
              </label>
              <button type="submit" disabled={busy || !status?.dbConnected || !status.firstRunSetupNeeded} className="atlas-btn-gold w-full bg-[#030914] px-4 py-3.5 font-mono text-xs tracking-[0.18em] text-[#D5BD8B] uppercase disabled:cursor-not-allowed disabled:opacity-40">
                {busy ? 'Creating Super Admin…' : 'Create Initial Super Admin'}
              </button>
            </form>
          </>
        )}
        <p className="mt-7 border-t border-[#263D59]/70 pt-4 text-[11px] leading-5 text-[#E8E1D2]/45">
          Setup is one-time only. Choose a unique password that you have not shared in chat or used on another account.
        </p>
      </div>
    </main>
  );
};
