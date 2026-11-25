import React, { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, CameraOff, CheckCircle2, RefreshCw, ShieldAlert } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { apiRequest, getAuthTokens } from '../client/api';
import { useAuth } from '../client/AuthContext';
import {
  ConfirmDialog,
  EmptyState,
  LoadingSkeleton,
  MetricLedger,
  PortalPageHeader,
  StatusLabel,
} from '../client/components/UiPrimitives';
import type { QrPassRecord, QrScanLog } from '../shared/types';
import { hasPermission } from '../shared/permissions';

export const MyQrPassView: React.FC = () => {
  const [pass, setPass] = useState<QrPassRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<{ pass: QrPassRecord }>('/api/qr/my-pass')
      .then((res) => setPass(res.pass))
      .catch(() => setPass(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton rows={3} />;
  if (!pass) {
    return (
      <EmptyState
        title="QR Pass Unavailable"
        description="Your active conference QR credential will appear here once Neon PostgreSQL is connected."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PortalPageHeader
        kicker="Official Conference Credential"
        title="Digital Identification Pass"
        subtitle="Non-transferable cryptographic token verified at venue entrance checkpoints."
      />

      <div className="mx-auto max-w-2xl border border-[#B89A62]/40 bg-[#050E1C]/90 md:grid md:grid-cols-12">
        <div className="flex flex-col items-center justify-center border-b border-[#263D59]/55 bg-[#030914]/80 p-8 md:col-span-5 md:border-r md:border-b-0">
          <div className="border border-[#B89A62]/70 bg-white p-3.5">
            <QRCodeSVG value={pass.token_value || pass.pass_code} size={188} />
          </div>
          <p className="mt-3 font-mono text-xs tracking-[0.14em] text-[#D5BD8B] tabular-nums">
            {pass.pass_code}
          </p>
        </div>

        <div className="flex flex-col justify-between p-7 md:col-span-7">
          <div>
            <p className="font-mono text-[10px] tracking-[0.2em] text-[#B89A62] uppercase">
              Authorized Delegate &amp; Personnel Pass
            </p>
            <h2 className="mt-2 font-display text-3xl text-[#F3EDE0]">{pass.full_name}</h2>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-[#263D59]/50 py-3">
              <StatusLabel status={pass.department_slug} tone="gold" />
              <StatusLabel status={pass.role_label} tone="neutral" />
              <StatusLabel
                status={pass.inside ? 'Inside Venue' : 'Outside Venue'}
                tone={pass.inside ? 'green' : 'neutral'}
              />
            </div>
          </div>

          <dl className="mt-6 grid grid-cols-2 divide-x divide-[#263D59]/50 border border-[#263D59]/55 bg-[#030914]/70">
            <div className="px-4 py-3">
              <dt className="font-mono text-[10px] tracking-[0.16em] text-[#E8E1D2]/50 uppercase">
                Check-Ins
              </dt>
              <dd className="mt-1 font-display text-2xl tabular-nums text-[#F3EDE0]">
                {pass.scan_count}
              </dd>
            </div>
            <div className="px-4 py-3">
              <dt className="font-mono text-[10px] tracking-[0.16em] text-[#E8E1D2]/50 uppercase">
                Check-Outs
              </dt>
              <dd className="mt-1 font-display text-2xl tabular-nums text-[#F3EDE0]">
                {pass.checkout_count}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
};

export const DepartmentQrSectionView: React.FC<{ departmentSlug?: string }> = ({
  departmentSlug,
}) => {
  const [passes, setPasses] = useState<QrPassRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const q = departmentSlug ? `?department=${encodeURIComponent(departmentSlug)}` : '';
    apiRequest<{ passes: QrPassRecord[] }>(`/api/qr/department-passes${q}`)
      .then((res) => setPasses(res.passes || []))
      .catch(() => setPasses([]))
      .finally(() => setLoading(false));
  }, [departmentSlug]);

  if (loading) return <LoadingSkeleton rows={4} />;

  const filtered = passes.filter(
    (p) =>
      p.full_name.toLowerCase().includes(query.toLowerCase()) ||
      p.pass_code.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <PortalPageHeader
        kicker="Section Credential Roster"
        title="Department QR Passes"
        subtitle="Active cryptographic credentials issued to members inside your operational scope."
        actions={
          <input
            placeholder="Filter by name or code..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="portal-input w-64"
          />
        }
      />

      {filtered.length === 0 ? (
        <EmptyState
          title="No Active Passes Found"
          description="Accepted applicants and onboarded team members in this department automatically receive QR credentials."
        />
      ) : (
        <div className="grid divide-y divide-[#263D59]/50 border border-[#263D59]/65 bg-[#050E1C]/80 sm:grid-cols-2 sm:divide-x lg:grid-cols-3">
          {filtered.map((p) => (
            <div key={p.id} className="flex items-center gap-4 p-5">
              <div className="shrink-0 border border-[#B89A62]/50 bg-white p-2">
                <QRCodeSVG value={p.token_value || p.pass_code} size={92} />
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="truncate font-sans text-sm font-medium text-[#F3EDE0]">{p.full_name}</p>
                <p className="font-mono text-[11px] tabular-nums text-[#D5BD8B]">{p.pass_code}</p>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <StatusLabel status={p.role_label} tone="gold" />
                  <StatusLabel status={p.inside ? 'Inside' : 'Outside'} tone={p.inside ? 'green' : 'neutral'} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const LiveQrScannerWorkspace: React.FC = () => {
  const { effectiveActor, departments } = useAuth();
  const canScan = hasPermission(effectiveActor, 'qr.scan', departments);

  const [direction, setDirection] = useState<'checkin' | 'checkout'>('checkin');
  const [gate, setGate] = useState('Main Gate A');
  const [manualInput, setManualInput] = useState('');
  const [cameraOn, setCameraOn] = useState(false);
  const [passes, setPasses] = useState<QrPassRecord[]>([]);
  const [scans, setScans] = useState<QrScanLog[]>([]);
  const [lastBanner, setLastBanner] = useState<{
    tone: 'success' | 'warning' | 'error';
    title: string;
    detail: string;
  } | null>(null);
  const [repeatConfirmToken, setRepeatConfirmToken] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastDecodedRef = useRef<{ token: string; at: number }>({ token: '', at: 0 });

  const fetchRegistry = useCallback(async () => {
    try {
      const res = await apiRequest<{ passes: QrPassRecord[]; scans: QrScanLog[] }>(
        '/api/qr/registry'
      );
      setPasses(res.passes || []);
      setScans(res.scans || []);
    } catch {
      // Ignore polling error if unconfigured
    }
  }, []);

  useEffect(() => {
    if (!canScan) return;
    void fetchRegistry();
    const timer = window.setInterval(() => void fetchRegistry(), 4000);
    const bc = new BroadcastChannel('lismun-qr-attendance-sync');
    bc.onmessage = () => void fetchRegistry();

    const onFocus = () => void fetchRegistry();
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);

    return () => {
      window.clearInterval(timer);
      bc.close();
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
    };
  }, [canScan, fetchRegistry]);

  const submitScan = useCallback(
    async (qrToken: string, confirmRepeat = false) => {
      const trimmed = qrToken.trim();
      if (!trimmed) return;
      try {
        const res = await apiRequest<{
          ok: boolean;
          duplicate?: boolean;
          requiresConfirmation?: boolean;
          scan_outcome: string;
          message: string;
        }>('/api/qr/scan', {
          method: 'POST',
          body: {
            qr_token: trimmed,
            direction,
            gate,
            confirm_repeat: confirmRepeat,
          },
        });
        if (res.requiresConfirmation) {
          setRepeatConfirmToken(trimmed);
          setLastBanner({
            tone: 'warning',
            title: 'Repeat Check-Out Confirmation',
            detail: res.message,
          });
          return;
        }
        setLastBanner({
          tone: res.ok ? 'success' : 'warning',
          title: res.scan_outcome.replace(/_/g, ' ').toUpperCase(),
          detail: res.message,
        });
        const bc = new BroadcastChannel('lismun-qr-attendance-sync');
        bc.postMessage({ type: direction, at: Date.now() });
        bc.close();
        void fetchRegistry();
      } catch (err) {
        setLastBanner({
          tone: 'error',
          title: 'SCAN REJECTED',
          detail: err instanceof Error ? err.message : 'Scan error.',
        });
        void fetchRegistry();
      }
    },
    [direction, gate, fetchRegistry]
  );

  // Camera viewfinder loop (jsQR decoder)
  useEffect(() => {
    if (!cameraOn) return;
    let stream: MediaStream | null = null;
    let rafId = 0;
    let active = true;

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const scanLoop = async () => {
          if (!active || !videoRef.current || !canvasRef.current) return;
          const v = videoRef.current;
          if (v.readyState >= 2 && v.videoWidth > 0) {
            const c = canvasRef.current;
            c.width = v.videoWidth;
            c.height = v.videoHeight;
            const ctx = c.getContext('2d');
            if (ctx) {
              ctx.drawImage(v, 0, 0, c.width, c.height);
              const imgData = ctx.getImageData(0, 0, c.width, c.height);
              const decoded = jsQR(imgData.data, imgData.width, imgData.height);
              if (decoded?.data) {
                const now = Date.now();
                if (
                  decoded.data !== lastDecodedRef.current.token ||
                  now - lastDecodedRef.current.at > 2500
                ) {
                  lastDecodedRef.current = { token: decoded.data, at: now };
                  void submitScan(decoded.data);
                }
              }
            }
          }
          rafId = window.requestAnimationFrame(() => void scanLoop());
        };
        rafId = window.requestAnimationFrame(() => void scanLoop());
      } catch {
        setCameraOn(false);
        setLastBanner({
          tone: 'warning',
          title: 'Camera Unavailable',
          detail: 'Use manual pass code entry or allow camera permissions.',
        });
      }
    };

    void start();
    return () => {
      active = false;
      if (rafId) window.cancelAnimationFrame(rafId);
      if (stream) {
        for (const track of stream.getTracks()) track.stop();
      }
    };
  }, [cameraOn, submitScan]);

  if (!canScan) {
    return (
      <div className="border border-[#DC2626]/55 bg-[#12070B] p-8 text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-[#FCA5A5]" />
        <h2 className="mt-3 font-display text-2xl text-[#F3EDE0]">Scanner Access Restricted</h2>
        <p className="mt-2 font-sans text-xs text-[#E8E1D2]/70">
          QR check-in/check-out is restricted strictly to Admins and Security department accounts.
        </p>
      </div>
    );
  }

  const checkedIn = passes.filter((p) => p.inside);
  const notCheckedIn = passes.filter((p) => !p.inside);
  const tokenPresent = Boolean(getAuthTokens().bearerToken);

  return (
    <div className="space-y-6">
      <PortalPageHeader
        kicker={`Entrance Checkpoint Terminal · ${tokenPresent ? 'Authenticated' : 'Session Required'}`}
        title="Security QR Scanner"
        subtitle="Verify live pass credentials, enforce duplicate check-in lock, and synchronize gate occupancy."
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex border border-[#263D59] bg-[#040B18]">
              <button
                type="button"
                onClick={() => setDirection('checkin')}
                className={`px-3.5 py-2 font-mono text-[11px] uppercase whitespace-nowrap transition-colors ${
                  direction === 'checkin'
                    ? 'bg-[#16A34A]/20 text-[#86EFAC]'
                    : 'text-[#E8E1D2]/65 hover:text-[#E8E1D2]'
                }`}
              >
                Check In
              </button>
              <button
                type="button"
                onClick={() => setDirection('checkout')}
                className={`border-l border-[#263D59] px-3.5 py-2 font-mono text-[11px] uppercase whitespace-nowrap transition-colors ${
                  direction === 'checkout'
                    ? 'bg-[#D97706]/20 text-[#FCD34D]'
                    : 'text-[#E8E1D2]/65 hover:text-[#E8E1D2]'
                }`}
              >
                Check Out
              </button>
            </div>
            <input
              value={gate}
              onChange={(e) => setGate(e.target.value)}
              aria-label="Gate name"
              className="portal-input w-36 font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => void fetchRegistry()}
              className="portal-btn-secondary"
            >
              <RefreshCw className="h-3.5 w-3.5 shrink-0" />
              <span>Sync</span>
            </button>
          </div>
        }
      />

      <MetricLedger
        items={[
          { label: 'Inside Venue', value: checkedIn.length, accent: 'green', detail: `Active gate: ${gate}` },
          { label: 'Outside Venue', value: notCheckedIn.length, accent: 'default', detail: 'Awaiting arrival' },
          { label: 'Issued Passes', value: passes.length, accent: 'gold', detail: `${scans.length} logged scans` },
        ]}
      />

      {lastBanner && (
        <div
          className={`flex items-center gap-3 border px-5 py-3.5 ${
            lastBanner.tone === 'success'
              ? 'border-[#16A34A]/60 bg-[#05140E] text-[#86EFAC]'
              : lastBanner.tone === 'warning'
              ? 'border-[#D97706]/60 bg-[#140F06] text-[#FCD34D]'
              : 'border-[#DC2626]/60 bg-[#16080D] text-[#FCA5A5]'
          }`}
        >
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-mono text-xs font-semibold uppercase">{lastBanner.title}</p>
            <p className="font-sans text-xs text-[#E8E1D2]/90">{lastBanner.detail}</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Optical Viewfinder & Manual Entry */}
        <div className="space-y-5 border border-[#263D59]/65 bg-[#050E1C]/85 p-5 lg:col-span-5">
          <div className="flex items-center justify-between border-b border-[#263D59]/50 pb-3">
            <span className="font-mono text-[11px] tracking-[0.16em] text-[#7DD3FC] uppercase">
              Optical Scanner &amp; Token Input
            </span>
            <button
              type="button"
              onClick={() => setCameraOn((p) => !p)}
              className="portal-btn-primary py-1.5 text-[10px]"
            >
              {cameraOn ? <CameraOff className="h-3.5 w-3.5" /> : <Camera className="h-3.5 w-3.5" />}
              <span>{cameraOn ? 'Stop Camera' : 'Start Camera'}</span>
            </button>
          </div>

          <div className="relative aspect-video overflow-hidden border border-[#263D59] bg-[#02060E]">
            <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
            <canvas ref={canvasRef} className="hidden" />
            {/* Precision reticle corners */}
            <span aria-hidden="true" className="pointer-events-none absolute top-3 left-3 h-4 w-4 border-t border-l border-[#7DD3FC]/75" />
            <span aria-hidden="true" className="pointer-events-none absolute top-3 right-3 h-4 w-4 border-t border-r border-[#7DD3FC]/75" />
            <span aria-hidden="true" className="pointer-events-none absolute bottom-3 left-3 h-4 w-4 border-b border-l border-[#7DD3FC]/75" />
            <span aria-hidden="true" className="pointer-events-none absolute right-3 bottom-3 h-4 w-4 border-r border-b border-[#7DD3FC]/75" />
            {!cameraOn && (
              <div className="absolute inset-0 flex items-center justify-center font-mono text-xs text-[#E8E1D2]/45">
                Camera paused — click Start Camera or scan below
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitScan(manualInput);
              setManualInput('');
            }}
            className="flex gap-2"
          >
            <input
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="Scan or paste LMQR-... / Pass Code LMP-..."
              className="portal-input flex-1 font-mono text-xs"
            />
            <button type="submit" className="portal-btn-primary">
              Verify
            </button>
          </form>

          <div className="border-t border-[#263D59]/50 pt-4">
            <p className="font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
              Recent Scan Feed ({scans.length})
            </p>
            <div className="mt-2.5 max-h-52 divide-y divide-[#263D59]/45 overflow-y-auto border border-[#263D59]/50 bg-[#030914]">
              {scans.length === 0 ? (
                <p className="px-3 py-4 text-center font-mono text-[11px] text-[#E8E1D2]/45">
                  No checkpoint events logged yet.
                </p>
              ) : (
                scans.slice(0, 12).map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                  >
                    <span className="truncate text-[#E8E1D2]">
                      {s.pass_holder_name || s.pass_code || 'Unknown'}
                    </span>
                    <StatusLabel status={s.scan_outcome} />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Checked In vs Not Checked In Side-by-Side Tabular Split */}
        <div className="grid divide-y divide-[#263D59]/60 border border-[#263D59]/65 bg-[#050E1C]/80 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:col-span-7">
          <div className="flex flex-col">
            <div className="flex items-center justify-between border-b border-[#263D59]/60 bg-[#040B18] px-4 py-3">
              <span className="font-mono text-[11px] tracking-[0.16em] text-[#86EFAC] uppercase">
                Checked In
              </span>
              <span className="font-mono text-xs font-semibold tabular-nums text-[#86EFAC]">
                {checkedIn.length}
              </span>
            </div>
            <div className="max-h-[460px] divide-y divide-[#263D59]/40 overflow-y-auto">
              {checkedIn.length === 0 ? (
                <p className="p-6 text-center font-mono text-xs text-[#E8E1D2]/45">
                  No badge holders inside venue.
                </p>
              ) : (
                checkedIn.map((p) => (
                  <div key={p.id} className="px-4 py-2.5 text-xs transition-colors hover:bg-[#071426]/65">
                    <p className="font-medium text-[#F3EDE0]">{p.full_name}</p>
                    <p className="mt-0.5 font-mono text-[10px] tabular-nums text-[#B89A62]">
                      {p.pass_code} · {p.department_slug} · {p.checked_in_gate || 'Gate'}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex flex-col">
            <div className="flex items-center justify-between border-b border-[#263D59]/60 bg-[#040B18] px-4 py-3">
              <span className="font-mono text-[11px] tracking-[0.16em] text-[#E8E1D2]/75 uppercase">
                Not Checked In
              </span>
              <span className="font-mono text-xs font-semibold tabular-nums text-[#E8E1D2]">
                {notCheckedIn.length}
              </span>
            </div>
            <div className="max-h-[460px] divide-y divide-[#263D59]/40 overflow-y-auto">
              {notCheckedIn.length === 0 ? (
                <p className="p-6 text-center font-mono text-xs text-[#E8E1D2]/45">
                  All active passes accounted for inside.
                </p>
              ) : (
                notCheckedIn.map((p) => (
                  <div key={p.id} className="px-4 py-2.5 text-xs transition-colors hover:bg-[#071426]/65">
                    <p className="font-medium text-[#F3EDE0]">{p.full_name}</p>
                    <p className="mt-0.5 font-mono text-[10px] tabular-nums text-[#E8E1D2]/50">
                      {p.pass_code} · {p.department_slug}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(repeatConfirmToken)}
        title="Confirm Repeat Check-Out"
        message="This badge has already been checked out earlier today. Record an additional check-out event?"
        confirmLabel="Confirm Check-Out"
        onCancel={() => setRepeatConfirmToken(null)}
        onConfirm={() => {
          const tok = repeatConfirmToken;
          setRepeatConfirmToken(null);
          if (tok) void submitScan(tok, true);
        }}
      />
    </div>
  );
};
