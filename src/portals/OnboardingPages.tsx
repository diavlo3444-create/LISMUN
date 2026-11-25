import React, { useEffect, useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { apiRequest } from '../client/api';
import { navigate } from '../client/router';

export const TeamMemberSignupPage: React.FC = () => {
  const [token, setToken] = useState(() => {
    const q = new URLSearchParams(window.location.search).get('token');
    if (q) return q;
    const h = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token');
    return h || '';
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ role: string; departmentSlug: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const resp = await apiRequest<{ role: string; departmentSlug: string }>(
        '/api/invites/hr/claim',
        {
          method: 'POST',
          skipAuth: true,
          body: { token: token.trim(), email, password },
        }
      );
      setDone(resp);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#030914] p-4 text-[#E8E1D2]">
      <div className="w-full max-w-md border border-[#B89A62]/45 bg-[#071426] p-8">
        <button
          type="button"
          onClick={() => navigate('/portal')}
          className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.16em] text-[#B89A62] uppercase"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Portal Directory</span>
        </button>
        <h1 className="mt-4 font-display text-3xl text-[#E8E1D2]">
          Accepted Staff Onboarding
        </h1>
        <p className="mt-1.5 font-sans text-xs text-[#E8E1D2]/70">
          Claim your non-expiring personal LIS MUN onboarding link to activate your portal and QR pass.
        </p>

        {done ? (
          <div className="mt-6 space-y-4 border border-[#16A34A]/60 bg-[#081A12] p-5">
            <div className="flex items-center gap-2 text-[#86EFAC]">
              <Check className="h-4 w-4" />
              <span className="font-mono text-xs uppercase">Account Activated</span>
            </div>
            <p className="font-sans text-xs text-[#E8E1D2]/85">
              Assigned role: <strong className="font-mono">{done.role}</strong> ({done.departmentSlug}).
            </p>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="w-full border border-[#B89A62] bg-[#030914] py-2.5 font-mono text-xs tracking-[0.16em] text-[#D5BD8B] uppercase"
            >
              Proceed to Sign In
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {error && (
              <div className="border border-[#DC2626]/60 bg-[#1B0B10] p-3 text-xs text-[#FCA5A5]">
                {error}
              </div>
            )}
            <div>
              <label className="block font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                Invite Token (64 hex)
              </label>
              <input
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="mt-1 w-full border border-[#263D59] bg-[#030914] px-3 py-2 font-mono text-xs text-[#E8E1D2]"
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                Application Email
              </label>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full border border-[#263D59] bg-[#030914] px-3 py-2 text-sm text-[#E8E1D2]"
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
                Password (10–128 chars)
              </label>
              <input
                required
                type="password"
                minLength={10}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full border border-[#263D59] bg-[#030914] px-3 py-2 text-sm text-[#E8E1D2]"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full border border-[#B89A62] bg-[#030914] py-3 font-mono text-xs tracking-[0.18em] text-[#D5BD8B] uppercase"
            >
              {loading ? 'Activating Account...' : 'Activate Account'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export const EbSignupPage: React.FC = () => {
  const [inviteParam] = useState(() =>
    new URLSearchParams(window.location.search).get('invite') || ''
  );
  const [hashToken] = useState(() =>
    new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token') || ''
  );

  const mode = inviteParam
    ? 'personal_invite'
    : hashToken
    ? 'reusable_link'
    : 'allowlist';

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [ebRole, setEbRole] = useState<'co_head' | 'designer' | 'marketing'>('co_head');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [reportingHeadId, setReportingHeadId] = useState('');
  const [activeHeads, setActiveHeads] = useState<
    Array<{ user_id: string; full_name: string; department_slug: string; gender: string | null }>
  >([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (mode === 'reusable_link') {
      apiRequest<{
        heads: Array<{
          user_id: string;
          full_name: string;
          department_slug: string;
          gender: string | null;
        }>;
      }>('/api/invites/eb/active-heads', { skipAuth: true })
        .then((res) => setActiveHeads(res.heads || []))
        .catch(() => {});
    }
  }, [mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiRequest('/api/invites/eb/signup', {
        method: 'POST',
        skipAuth: true,
        body: {
          mode,
          token: inviteParam || hashToken,
          email,
          full_name: fullName,
          password,
          phone,
          eb_role: ebRole,
          gender,
          reporting_head_id: reportingHeadId,
        },
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'EB registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#030914] p-4 text-[#E8E1D2]">
      <div className="w-full max-w-md border border-[#B89A62]/45 bg-[#071426] p-8">
        <h1 className="font-display text-3xl text-[#E8E1D2]">Executive Board Signup</h1>
        <p className="mt-1 font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
          Mode: {mode.replace(/_/g, ' ')}
        </p>

        {done ? (
          <div className="mt-6 space-y-4 border border-[#16A34A]/60 bg-[#081A12] p-5">
            <p className="font-sans text-sm text-[#86EFAC]">
              Executive Board credentials and QR pass created.
            </p>
            <button
              type="button"
              onClick={() => navigate('/eb-login')}
              className="w-full border border-[#B89A62] bg-[#030914] py-2.5 font-mono text-xs text-[#D5BD8B] uppercase"
            >
              Sign In to EB Portal
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
            {error && (
              <div className="border border-[#DC2626]/60 bg-[#1B0B10] p-3 text-xs text-[#FCA5A5]">
                {error}
              </div>
            )}
            <input
              required
              type="email"
              placeholder="EB Email Address *"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-[#263D59] bg-[#030914] px-3 py-2.5 text-sm text-[#E8E1D2]"
            />
            {mode !== 'allowlist' && (
              <input
                required
                placeholder="Full Name *"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full border border-[#263D59] bg-[#030914] px-3 py-2.5 text-sm text-[#E8E1D2]"
              />
            )}
            {mode === 'reusable_link' && (
              <>
                <select
                  value={ebRole}
                  onChange={(e) => setEbRole(e.target.value as 'co_head' | 'designer' | 'marketing')}
                  className="w-full border border-[#263D59] bg-[#030914] px-3 py-2.5 text-sm text-[#E8E1D2]"
                >
                  <option value="co_head">Co-Head</option>
                  <option value="designer">Designer</option>
                  <option value="marketing">Marketing</option>
                </select>
                {ebRole === 'co_head' && (
                  <select
                    required
                    value={reportingHeadId}
                    onChange={(e) => setReportingHeadId(e.target.value)}
                    className="w-full border border-[#263D59] bg-[#030914] px-3 py-2.5 text-sm text-[#E8E1D2]"
                  >
                    <option value="">Select Reporting Department Head *</option>
                    {activeHeads.map((h) => (
                      <option key={h.user_id} value={h.user_id}>
                        {h.full_name} — {h.department_slug} {h.gender ? `(${h.gender})` : ''}
                      </option>
                    ))}
                  </select>
                )}
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as 'male' | 'female')}
                  className="w-full border border-[#263D59] bg-[#030914] px-3 py-2.5 text-sm text-[#E8E1D2]"
                >
                  <option value="male">Male Division</option>
                  <option value="female">Female Division</option>
                </select>
                <input
                  required
                  placeholder="Unique Mobile Phone (7–15 digits) *"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full border border-[#263D59] bg-[#030914] px-3 py-2.5 font-mono text-sm text-[#E8E1D2]"
                />
              </>
            )}
            <input
              required
              type="password"
              minLength={10}
              placeholder="Password (10–128 chars) *"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-[#263D59] bg-[#030914] px-3 py-2.5 text-sm text-[#E8E1D2]"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full border border-[#B89A62] bg-[#030914] py-3 font-mono text-xs tracking-[0.18em] text-[#D5BD8B] uppercase"
            >
              {loading ? 'Provisioning EB Account...' : 'Complete EB Signup'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export const HeadSetupPage: React.FC = () => {
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') || '');
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await apiRequest('/api/auth/head-setup', {
        method: 'POST',
        skipAuth: true,
        body: { token, password },
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed.');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#030914] p-4 text-[#E8E1D2]">
      <div className="w-full max-w-md border border-[#B89A62]/45 bg-[#071426] p-8">
        <h1 className="font-display text-3xl text-[#E8E1D2]">Account Password Setup</h1>
        {done ? (
          <div className="mt-5 space-y-4">
            <p className="text-sm text-[#86EFAC]">Password configured successfully.</p>
            <button
              type="button"
              onClick={() => navigate('/head-login')}
              className="w-full border border-[#B89A62] bg-[#030914] py-2.5 font-mono text-xs text-[#D5BD8B] uppercase"
            >
              Go to Head Login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {error && <p className="text-xs text-[#FCA5A5]">{error}</p>}
            <input
              required
              type="password"
              minLength={10}
              placeholder="New Password (10+ characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-[#263D59] bg-[#030914] px-3 py-2.5 text-sm text-[#E8E1D2]"
            />
            <button
              type="submit"
              className="w-full border border-[#B89A62] bg-[#030914] py-3 font-mono text-xs text-[#D5BD8B] uppercase"
            >
              Set Password &amp; Activate
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export const LegalDocumentPage: React.FC<{ doc: 'privacy' | 'terms' }> = ({ doc }) => (
  <div className="min-h-screen bg-[#030914] px-4 py-12 text-[#E8E1D2] md:px-10">
    <div className="mx-auto max-w-3xl border border-[#263D59]/80 bg-[#071426] p-8">
      <button
        type="button"
        onClick={() => navigate('/')}
        className="inline-flex items-center gap-2 font-mono text-xs tracking-[0.16em] text-[#B89A62] uppercase"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>Return to Atlas</span>
      </button>
      <h1 className="mt-4 font-display text-4xl text-[#E8E1D2]">
        {doc === 'privacy' ? 'Privacy Policy & Medical Data Protection' : 'Terms & Conference Code of Conduct'}
      </h1>
      <div className="mt-6 space-y-4 font-sans text-sm leading-relaxed text-[#E8E1D2]/80">
        {doc === 'privacy' ? (
          <>
            <p>
              Leadership International School MUN collects delegate, chair, and staff application records exclusively for conference administration, security credentialing, and emergency safety.
            </p>
            <p>
              Medical and accessibility disclosures are stored in an isolated confidential partition accessible strictly to authorized Secretariat Administrators, and are never shared with Department Heads, HR reviewers, or external parties.
            </p>
            <p>
              Private portfolio uploads are protected behind time-limited server-signed links and are never indexed publicly.
            </p>
          </>
        ) : (
          <>
            <p>
              By submitting an application or claiming a conference credential for Leadership International School MUN, participants agree to uphold diplomatic decorum, chain-of-command safety directives, and institutional conduct standards.
            </p>
            <p>
              Digital QR passes are personal and non-transferable. Security personnel retain authority to verify identity and revoke access in cases of credential misuse or policy violations.
            </p>
          </>
        )}
      </div>
    </div>
  </div>
);
