import React, { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, CameraOff, CheckCircle2, RefreshCw, ShieldAlert } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { apiRequest, getAuthTokens } from '../client/api';
import { useAuth } from '../client/AuthContext';
import { ConfirmDialog, EmptyState, LoadingSkeleton, StatusLabel } from '../client/components/UiPrimitives';
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
    <div className="mx-auto max-w-md border border-[#B89A62]/50 bg-[#071426] p-8 text-center">
      <p className="font-mono text-[11px] tracking-[0.2em] text-[#B89A62] uppercase">
        Personal Conference Credential
      </p>
      <div className="mx-auto mt-5 inline-block border border-[#B89A62] bg-white p-4">
        <QRCodeSVG value={pass.token_value || pass.pass_code} size={210} />
      </div>
      <h2 className="mt-5 font-display text-3xl text-[#E8E1D2]">{pass.full_name}</h2>
      <p className="mt-1 font-mono text-sm tabular-nums text-[#D5BD8B]">{pass.pass_code}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <StatusLabel status={pass.department_slug} tone="gold" />
        <StatusLabel status={pass.role_label} tone="neutral" />
        <StatusLabel
          status={pass.inside ? 'Inside Venue' : 'Outside Venue'}
          tone={pass.inside ? 'green' : 'neutral'}
        />
      </div>
      <p className="mt-5 font-mono text-[11px] tabular-nums text-[#E8E1D2]/55">
        Check-Ins: {pass.scan_count} · Check-Outs: {pass.checkout_count}
      </p>
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl text-[#E8E1D2]">Department QR Passes Grid</h2>
        <input
          placeholder="Search member or pass code..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="border border-[#263D59] bg-[#071426] px-3 py-2 text-xs text-[#E8E1D2]"
        />
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          title="No Active Passes Found"
          description="Accepted applicants and onboarded team members in this department automatically receive QR credentials."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <div key={p.id} className="border border-[#263D59]/80 bg-[#071426] p-5 text-center">
              <div className="mx-auto inline-block bg-white p-2.5">
                <QRCodeSVG value={p.token_value || p.pass_code} size={136} />
              </div>
              <p className="mt-3 font-sans text-sm font-medium text-[#E8E1D2]">{p.full_name}</p>
              <p className="font-mono text-[11px] tabular-nums text-[#D5BD8B]">{p.pass_code}</p>
              <div className="mt-2 flex justify-center gap-2">
                <StatusLabel status={p.role_label} tone="gold" />
                <StatusLabel status={p.inside ? 'Inside' : 'Outside'} tone={p.inside ? 'green' : 'neutral'} />
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

    // SSE real-time stream (passes Bearer token via query? Better: poll + BroadcastChannel when SSE lacks header; let's attach EventSource only if supported or 4s poll + focus)
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

  // Camera viewfinder loop (BarcodeDetector + jsQR fallback)
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
      <div className="border border-[#DC2626]/60 bg-[#1B0B10] p-8 text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-[#FCA5A5]" />
        <h2 className="mt-3 font-display text-2xl text-[#E8E1D2]">Scanner Access Restricted</h2>
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
      <div className="flex flex-wrap items-center justify-between gap-4 border border-[#263D59]/80 bg-[#071426] p-5">
        <div>
          <p className="font-mono text-[10px] tracking-[0.2em] text-[#B89A62] uppercase">
            Live Entrance Verification · {tokenPresent ? 'Authenticated' : 'Session Required'}
          </p>
          <h2 className="mt-1 font-display text-3xl text-[#E8E1D2]">Security QR Scanner</h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex border border-[#263D59]">
            <button
              type="button"
              onClick={() => setDirection('checkin')}
              className={`px-4 py-2 font-mono text-xs uppercase ${
                direction === 'checkin' ? 'bg-[#16A34A]/25 text-[#86EFAC]' : 'text-[#E8E1D2]/70'
              }`}
            >
              Check In
            </button>
            <button
              type="button"
              onClick={() => setDirection('checkout')}
              className={`border-l border-[#263D59] px-4 py-2 font-mono text-xs uppercase ${
                direction === 'checkout' ? 'bg-[#D97706]/25 text-[#FCD34D]' : 'text-[#E8E1D2]/70'
              }`}
            >
              Check Out
            </button>
          </div>
          <input
            value={gate}
            onChange={(e) => setGate(e.target.value)}
            aria-label="Gate name"
            className="border border-[#263D59] bg-[#030914] px-3 py-2 font-mono text-xs text-[#E8E1D2]"
          />
          <button
            type="button"
            onClick={() => void fetchRegistry()}
            className="inline-flex items-center gap-1.5 border border-[#263D59] bg-[#030914] px-3 py-2 font-mono text-xs text-[#D5BD8B] uppercase"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {lastBanner && (
        <div
          className={`flex items-center gap-3 border p-4 ${
            lastBanner.tone === 'success'
              ? 'border-[#16A34A]/70 bg-[#081A12] text-[#86EFAC]'
              : lastBanner.tone === 'warning'
              ? 'border-[#D97706]/70 bg-[#1B1409] text-[#FCD34D]'
              : 'border-[#DC2626]/70 bg-[#1B0B10] text-[#FCA5A5]'
          }`}
        >
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-mono text-xs font-semibold uppercase">{lastBanner.title}</p>
            <p className="font-sans text-xs text-[#E8E1D2]">{lastBanner.detail}</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Camera + Manual Bar */}
        <div className="space-y-4 border border-[#263D59]/80 bg-[#071426] p-5 lg:col-span-5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs tracking-[0.16em] text-[#B89A62] uppercase">
              Camera &amp; Token Input
            </span>
            <button
              type="button"
              onClick={() => setCameraOn((p) => !p)}
              className="inline-flex items-center gap-1.5 border border-[#B89A62]/60 bg-[#030914] px-3 py-1.5 font-mono text-[11px] text-[#D5BD8B] uppercase"
            >
              {cameraOn ? <CameraOff className="h-3.5 w-3.5" /> : <Camera className="h-3.5 w-3.5" />}
              <span>{cameraOn ? 'Stop Camera' : 'Start Camera'}</span>
            </button>
          </div>

          <div className="relative aspect-video overflow-hidden border border-[#263D59] bg-[#030914]">
            <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
            <canvas ref={canvasRef} className="hidden" />
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
              className="flex-1 border border-[#263D59] bg-[#030914] px-3 py-2.5 font-mono text-xs text-[#E8E1D2]"
            />
            <button
              type="submit"
              className="border border-[#B89A62] bg-[#030914] px-4 py-2.5 font-mono text-xs text-[#D5BD8B] uppercase"
            >
              Verify
            </button>
          </form>

          <div className="border-t border-[#263D59]/60 pt-4">
            <p className="font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">
              Recent Scan Activity ({scans.length})
            </p>
            <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto">
              {scans.slice(0, 12).map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between border border-[#263D59]/50 bg-[#030914] px-2.5 py-1.5 text-xs"
                >
                  <span className="truncate text-[#E8E1D2]">
                    {s.pass_holder_name || s.pass_code || 'Unknown'}
                  </span>
                  <StatusLabel status={s.scan_outcome} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Checked In vs Not Checked In Side-by-Side Split */}
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
          <div className="border border-[#16A34A]/45 bg-[#071426] p-4">
            <div className="flex items-center justify-between border-b border-[#263D59]/60 pb-2.5">
              <span className="font-mono text-xs text-[#86EFAC] uppercase">Checked In</span>
              <span className="font-mono text-sm font-semibold tabular-nums text-[#86EFAC]">
                {checkedIn.length}
              </span>
            </div>
            <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto">
              {checkedIn.map((p) => (
                <div
                  key={p.id}
                  className="border border-[#263D59]/60 bg-[#030914] p-2.5 text-xs"
                >
                  <p className="font-medium text-[#E8E1D2]">{p.full_name}</p>
                  <p className="font-mono text-[10px] tabular-nums text-[#B89A62]">
                    {p.pass_code} · {p.department_slug} · {p.checked_in_gate || 'Gate'}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-[#263D59]/80 bg-[#071426] p-4">
            <div className="flex items-center justify-between border-b border-[#263D59]/60 pb-2.5">
              <span className="font-mono text-xs text-[#E8E1D2]/75 uppercase">Not Checked In</span>
              <span className="font-mono text-sm font-semibold tabular-nums text-[#E8E1D2]">
                {notCheckedIn.length}
              </span>
            </div>
            <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto">
              {notCheckedIn.map((p) => (
                <div
                  key={p.id}
                  className="border border-[#263D59]/60 bg-[#030914] p-2.5 text-xs"
                >
                  <p className="font-medium text-[#E8E1D2]">{p.full_name}</p>
                  <p className="font-mono text-[10px] tabular-nums text-[#E8E1D2]/55">
                    {p.pass_code} · {p.department_slug}
                  </p>
                </div>
              ))}
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
