import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  tone: 'success' | 'error' | 'warning' | 'info';
  title: string;
  detail?: string;
}

interface ToastContextValue {
  addToast: (title: string, tone?: ToastMessage['tone'], detail?: string) => void;
}

const ToastContext = createContext<ToastContextValue>({
  addToast: () => {},
});

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { toasts, pushToast, dismissToast } = useToasts();
  const addToast = useCallback(
    (title: string, tone: ToastMessage['tone'] = 'info', detail?: string) => {
      pushToast({ title, tone, detail });
    },
    [pushToast]
  );

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

export function useToasts() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const pushToast = useCallback(
    (toast: Omit<ToastMessage, 'id'>) => {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-4), { ...toast, id }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 5000);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, pushToast, dismissToast };
}

export const ToastViewport: React.FC<{
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;
  return (
    <div
      aria-live="polite"
      className="fixed right-5 bottom-5 z-[80] flex w-full max-w-sm flex-col gap-2.5"
    >
      {toasts.map((t) => {
        const frame =
          t.tone === 'error'
            ? 'border-[#DC2626]/55 bg-[#12070B]/95'
            : t.tone === 'warning'
            ? 'border-[#D97706]/55 bg-[#130E05]/95'
            : t.tone === 'success'
            ? 'border-[#16A34A]/50 bg-[#05130D]/95'
            : 'border-[#B89A62]/55 bg-[#050E1C]/95';
        const iconTone =
          t.tone === 'error'
            ? 'text-[#FCA5A5]'
            : t.tone === 'warning'
            ? 'text-[#FCD34D]'
            : t.tone === 'success'
            ? 'text-[#86EFAC]'
            : 'text-[#D5BD8B]';
        const Icon =
          t.tone === 'success'
            ? CheckCircle2
            : t.tone === 'error' || t.tone === 'warning'
            ? AlertTriangle
            : Info;
        return (
          <div
            key={t.id}
            className={`portal-modal-enter flex items-start gap-3 border px-4 py-3 text-[#E8E1D2] shadow-xl shadow-black/45 backdrop-blur-md ${frame}`}
          >
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconTone}`} />
            <div className="min-w-0 flex-1">
              <p className="font-sans text-xs font-medium tracking-wide text-[#E8E1D2]">
                {t.title}
              </p>
              {t.detail && (
                <p className="mt-1 font-sans text-xs leading-relaxed text-[#E8E1D2]/70">
                  {t.detail}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              aria-label="Dismiss notification"
              className="text-[#E8E1D2]/45 transition-colors hover:text-[#E8E1D2]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export const StatusLabel: React.FC<{
  status: string;
  tone?: 'gold' | 'green' | 'amber' | 'red' | 'neutral';
}> = ({ status, tone }) => {
  const s = status.toLowerCase();
  const resolvedTone =
    tone ||
    (s.includes('accept') ||
    s.includes('valid') ||
    s === 'sent' ||
    s === 'open' ||
    s === 'active' ||
    s === 'completed' ||
    s === 'resolved' ||
    s === 'approved' ||
    s.includes('checked_in')
      ? 'green'
      : s.includes('reject') ||
        s.includes('fail') ||
        s.includes('denied') ||
        s.includes('revoked') ||
        s.includes('blocked') ||
        s === 'closed' ||
        s === 'absent'
      ? 'red'
      : s.includes('wait') ||
        s.includes('warn') ||
        s.includes('already') ||
        s.includes('in_progress') ||
        s.includes('recommend') ||
        s === 'late'
      ? 'amber'
      : 'gold');

  const markColor =
    resolvedTone === 'green'
      ? 'bg-[#86EFAC]'
      : resolvedTone === 'red'
      ? 'bg-[#FCA5A5]'
      : resolvedTone === 'amber'
      ? 'bg-[#FCD34D]'
      : resolvedTone === 'neutral'
      ? 'bg-[#E8E1D2]/45'
      : 'bg-[#D5BD8B]';

  const textColor =
    resolvedTone === 'green'
      ? 'text-[#86EFAC]'
      : resolvedTone === 'red'
      ? 'text-[#FCA5A5]'
      : resolvedTone === 'amber'
      ? 'text-[#FCD34D]'
      : resolvedTone === 'neutral'
      ? 'text-[#E8E1D2]/65'
      : 'text-[#D5BD8B]';

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] uppercase whitespace-nowrap ${textColor}`}
    >
      <span aria-hidden="true" className={`inline-block h-1.5 w-1.5 shrink-0 ${markColor}`} />
      <span>{status.replace(/_/g, ' ')}</span>
    </span>
  );
};

export const AnimatedNumber: React.FC<{ value: number; durationMs?: number }> = ({
  value,
  durationMs = 320,
}) => {
  const [display, setDisplay] = useState(value);
  const displayRef = useRef(value);

  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      displayRef.current = value;
      setDisplay(value);
      return;
    }
    const startVal = displayRef.current;
    if (startVal === value) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    const startedAt = performance.now();

    const tick = (now: number) => {
      const elapsed = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      const nextVal = elapsed >= 1 ? value : Math.round(startVal + (value - startVal) * eased);
      displayRef.current = nextVal;
      setDisplay(nextVal);
      if (elapsed < 1) {
        raf = window.requestAnimationFrame(tick);
      }
    };

    raf = window.requestAnimationFrame(tick);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [value, durationMs]);

  return <span className="tabular-nums">{display}</span>;
};

export const PortalPageHeader: React.FC<{
  kicker?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}> = ({ kicker, title, subtitle, actions }) => (
  <header className="wm-page-header flex flex-wrap items-end justify-between gap-5 border-b border-[#263D59]/60 pb-6">
    <div className="min-w-0 max-w-3xl">
      {kicker && (
        <p
          className="font-mono text-[10px] tracking-[0.22em] uppercase"
          style={{ color: 'var(--dept-accent-muted, #B89A62)' }}
        >
          {kicker}
        </p>
      )}
      <h1 className="mt-1.5 font-display text-3xl font-medium tracking-tight text-[#F3EDE0] md:text-[2.25rem] md:leading-[1.12]">
        {title}
      </h1>
      {subtitle && (
        <p className="mt-2 font-sans text-xs leading-relaxed text-[#E8E1D2]/65 md:text-[13px]">
          {subtitle}
        </p>
      )}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2.5 shrink-0">{actions}</div>}
  </header>
);

export interface MetricLedgerItem {
  label: string;
  value: number | string;
  detail?: string;
  accent?: 'default' | 'gold' | 'green' | 'amber' | 'red';
}

export const MetricLedger: React.FC<{ items: MetricLedgerItem[] }> = ({ items }) => {
  const colsClass =
    items.length === 3
      ? 'md:grid-cols-3'
      : items.length === 2
      ? 'md:grid-cols-2'
      : 'sm:grid-cols-2 lg:grid-cols-4';

  return (
    <div
      className={`wm-metric-ledger grid divide-y divide-[#263D59]/50 border border-[#263D59]/65 bg-[#050E1C]/80 md:divide-x md:divide-y-0 ${colsClass}`}
    >
      {items.map((item) => {
        const valColor =
          item.accent === 'green'
            ? 'text-[#86EFAC]'
            : item.accent === 'amber'
            ? 'text-[#FCD34D]'
            : item.accent === 'red'
            ? 'text-[#FCA5A5]'
            : item.accent === 'gold'
            ? 'text-[#D5BD8B]'
            : 'text-[#F3EDE0]';
        return (
          <div key={item.label} className="px-5 py-5">
            <p className="font-mono text-[10px] tracking-[0.18em] text-[#E8E1D2]/55 uppercase">
              {item.label}
            </p>
            <p className={`mt-2.5 font-display text-4xl font-normal tabular-nums ${valColor}`}>
              {typeof item.value === 'number' ? <AnimatedNumber value={item.value} /> : item.value}
            </p>
            {item.detail && (
              <p className="mt-1.5 font-mono text-[11px] tabular-nums text-[#E8E1D2]/50">
                {item.detail}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
};

export interface DistributionSegment {
  label: string;
  value: number;
  color: string;
}

export const ProportionalDistributionBar: React.FC<{
  title: string;
  segments: DistributionSegment[];
  emptyText?: string;
}> = ({ title, segments, emptyText = 'No recorded entries yet' }) => {
  const total = segments.reduce((sum, seg) => sum + seg.value, 0);
  return (
    <div className="wm-distribution border border-[#263D59]/60 bg-[#050E1C]/75 px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-[10px] tracking-[0.18em] text-[#B89A62] uppercase">{title}</p>
        <p className="font-mono text-[11px] tabular-nums text-[#E8E1D2]/60">
          {total > 0 ? `${total} total` : emptyText}
        </p>
      </div>
      <div className="mt-3 flex h-2 w-full overflow-hidden bg-[#030914]">
        {total === 0 ? (
          <div className="h-full w-full bg-[#263D59]/25" />
        ) : (
          segments
            .filter((s) => s.value > 0)
            .map((seg) => (
              <div
                key={seg.label}
                style={{
                  width: `${(seg.value / total) * 100}%`,
                  backgroundColor: seg.color,
                }}
                title={`${seg.label}: ${seg.value}`}
                className="h-full transition-[width] duration-300 ease-out"
              />
            ))
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-2 font-mono text-[11px] tabular-nums">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 shrink-0"
              style={{ backgroundColor: seg.color }}
            />
            <span className="text-[#E8E1D2]/70">{seg.label}</span>
            <span className="text-[#E8E1D2]">{seg.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const LoadingSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
  <div className="space-y-3" aria-label="Loading content">
    <div className="portal-shimmer h-10 w-64 border border-[#263D59]/35" />
    <div className="divide-y divide-[#263D59]/40 border border-[#263D59]/50">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="portal-shimmer h-12 w-full" />
      ))}
    </div>
  </div>
);

export const EmptyState: React.FC<{
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}> = ({ title, description, actionLabel, onAction }) => (
  <div className="wm-empty-state border border-[#263D59]/55 bg-[#050E1C]/65 px-6 py-10 text-center">
    <p className="font-display text-2xl font-medium text-[#F3EDE0]">{title}</p>
    <p className="mx-auto mt-2 max-w-md font-sans text-xs leading-relaxed text-[#E8E1D2]/60 md:text-sm">
      {description}
    </p>
    {actionLabel && onAction && (
      <button type="button" onClick={onAction} className="portal-btn-primary mt-5">
        {actionLabel}
      </button>
    )}
  </div>
);

export const ConfirmDialog: React.FC<{
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  requireTypedText?: string;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  destructive = false,
  requireTypedText,
  onCancel,
  onConfirm,
}) => {
  const [typed, setTyped] = useState('');
  if (!open) return null;
  const blocked = Boolean(requireTypedText && typed.trim() !== requireTypedText);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[75] flex items-center justify-center bg-[#02060E]/88 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="wm-confirm-panel portal-modal-enter w-full max-w-md border border-[#B89A62]/45 bg-[#061020] p-6 shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-mono text-[10px] tracking-[0.2em] text-[#B89A62] uppercase">
          Confirmation Required
        </p>
        <h3 className="mt-1.5 font-display text-2xl font-medium text-[#F3EDE0]">{title}</h3>
        <p className="mt-2 font-sans text-xs leading-relaxed text-[#E8E1D2]/75 md:text-sm">
          {message}
        </p>
        {requireTypedText && (
          <div className="mt-4">
            <label className="block font-mono text-[10px] tracking-[0.18em] text-[#D5BD8B] uppercase">
              Type &quot;{requireTypedText}&quot; to confirm
            </label>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="portal-input mt-2 font-mono text-sm"
            />
          </div>
        )}
        <div className="mt-6 flex items-center justify-end gap-3 border-t border-[#263D59]/60 pt-4">
          <button
            type="button"
            onClick={() => {
              setTyped('');
              onCancel();
            }}
            className="portal-btn-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={blocked}
            onClick={() => {
              setTyped('');
              onConfirm();
            }}
            className={`${destructive ? 'portal-btn-danger' : 'portal-btn-primary'} disabled:opacity-40`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

interface ErrorBoundaryState {
  error: Error | null;
}

export class PortalErrorBoundary extends React.Component<
  { resetKey: string; children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { resetKey: string; children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(prevProps: { resetKey: string }) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#030914] p-6 text-[#E8E1D2]">
          <div className="max-w-lg border border-[#B89A62]/45 bg-[#061020] p-8">
            <p className="font-mono text-[10px] tracking-[0.2em] text-[#B89A62] uppercase">
              Portal Recovery
            </p>
            <h2 className="mt-2 font-display text-3xl text-[#F3EDE0]">
              An unexpected interface error occurred
            </h2>
            <p className="mt-3 font-sans text-sm text-[#E8E1D2]/70">
              {this.state.error.message}
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => this.setState({ error: null })}
                className="portal-btn-primary"
              >
                Retry View
              </button>
              <a href="/" className="portal-btn-secondary">
                Return to Atlas
              </a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
