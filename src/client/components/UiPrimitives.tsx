import React, { createContext, useCallback, useContext, useState } from 'react';
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
      className="fixed right-4 bottom-4 z-[80] flex w-full max-w-sm flex-col gap-2.5"
    >
      {toasts.map((t) => {
        const border =
          t.tone === 'error'
            ? 'border-[#DC2626]/70 bg-[#1B0B10]'
            : t.tone === 'warning'
            ? 'border-[#D97706]/70 bg-[#1B1409]'
            : t.tone === 'success'
            ? 'border-[#16A34A]/70 bg-[#081A12]'
            : 'border-[#B89A62]/60 bg-[#071426]';
        const Icon =
          t.tone === 'success'
            ? CheckCircle2
            : t.tone === 'error' || t.tone === 'warning'
            ? AlertTriangle
            : Info;
        return (
          <div
            key={t.id}
            className={`flex items-start gap-3 border p-3.5 text-[#E8E1D2] ${border}`}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#D5BD8B]" />
            <div className="min-w-0 flex-1">
              <p className="font-sans text-xs font-semibold tracking-wide text-[#E8E1D2]">
                {t.title}
              </p>
              {t.detail && (
                <p className="mt-1 font-sans text-xs text-[#E8E1D2]/75">{t.detail}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              aria-label="Dismiss notification"
              className="text-[#E8E1D2]/50 hover:text-[#E8E1D2]"
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
    (s.includes('accept') || s.includes('valid') || s === 'sent' || s === 'open' || s === 'active' || s === 'completed' || s === 'resolved'
      ? 'green'
      : s.includes('reject') || s.includes('fail') || s.includes('denied') || s.includes('revoked') || s.includes('blocked') || s === 'closed'
      ? 'red'
      : s.includes('wait') || s.includes('warn') || s.includes('already') || s.includes('in_progress') || s.includes('recommend')
      ? 'amber'
      : 'gold');

  const cls =
    resolvedTone === 'green'
      ? 'border-[#16A34A]/50 bg-[#16A34A]/12 text-[#86EFAC]'
      : resolvedTone === 'red'
      ? 'border-[#DC2626]/50 bg-[#DC2626]/12 text-[#FCA5A5]'
      : resolvedTone === 'amber'
      ? 'border-[#D97706]/50 bg-[#D97706]/12 text-[#FCD34D]'
      : resolvedTone === 'neutral'
      ? 'border-[#263D59] bg-[#030914] text-[#E8E1D2]/70'
      : 'border-[#B89A62]/55 bg-[#B89A62]/10 text-[#D5BD8B]';

  return (
    <span
      className={`inline-flex items-center border px-2 py-0.5 font-mono text-[10px] tracking-[0.14em] uppercase whitespace-nowrap ${cls}`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
};

export const LoadingSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
  <div className="space-y-2.5" aria-label="Loading content">
    {Array.from({ length: rows }).map((_, i) => (
      <div
        key={i}
        className="h-12 w-full animate-pulse border border-[#263D59]/45 bg-[#071426]/65"
      />
    ))}
  </div>
);

export const EmptyState: React.FC<{
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}> = ({ title, description, actionLabel, onAction }) => (
  <div className="border border-[#263D59]/70 bg-[#071426]/55 p-8 text-center">
    <p className="font-display text-2xl font-medium text-[#E8E1D2]">{title}</p>
    <p className="mx-auto mt-2 max-w-md font-sans text-sm text-[#E8E1D2]/65">
      {description}
    </p>
    {actionLabel && onAction && (
      <button
        type="button"
        onClick={onAction}
        className="mt-5 border border-[#B89A62] bg-[#030914] px-5 py-2.5 font-mono text-xs tracking-[0.16em] text-[#D5BD8B] uppercase hover:bg-[#0D1E36]"
      >
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
      className="fixed inset-0 z-[75] flex items-center justify-center bg-[#030914]/90 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md border border-[#B89A62]/55 bg-[#071426] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-2xl font-medium text-[#E8E1D2]">{title}</h3>
        <p className="mt-2 font-sans text-sm leading-relaxed text-[#E8E1D2]/75">
          {message}
        </p>
        {requireTypedText && (
          <div className="mt-4">
            <label className="block font-mono text-[10px] tracking-[0.18em] text-[#D5BD8B] uppercase">
              Type "{requireTypedText}" to confirm
            </label>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="mt-2 w-full border border-[#263D59] bg-[#030914] px-3 py-2 font-mono text-sm text-[#E8E1D2] focus:border-[#D5BD8B] focus:outline-none"
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
            className="border border-[#263D59] px-4 py-2 font-mono text-xs tracking-[0.14em] text-[#E8E1D2]/75 uppercase hover:text-[#E8E1D2]"
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
            className={`border px-4 py-2 font-mono text-xs tracking-[0.14em] uppercase disabled:opacity-40 ${
              destructive
                ? 'border-[#DC2626] bg-[#7F1D1D]/50 text-[#FCA5A5] hover:bg-[#991B1B]/60'
                : 'border-[#B89A62] bg-[#030914] text-[#D5BD8B] hover:bg-[#0D1E36]'
            }`}
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
          <div className="max-w-lg border border-[#B89A62]/50 bg-[#071426] p-8">
            <p className="font-mono text-xs tracking-[0.2em] text-[#B89A62] uppercase">
              Portal Recovery
            </p>
            <h2 className="mt-2 font-display text-3xl text-[#E8E1D2]">
              An unexpected interface error occurred
            </h2>
            <p className="mt-3 font-sans text-sm text-[#E8E1D2]/70">
              {this.state.error.message}
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => this.setState({ error: null })}
                className="border border-[#B89A62] bg-[#030914] px-4 py-2 font-mono text-xs tracking-[0.14em] text-[#D5BD8B] uppercase"
              >
                Retry View
              </button>
              <a
                href="/"
                className="border border-[#263D59] px-4 py-2 font-mono text-xs tracking-[0.14em] text-[#E8E1D2]/80 uppercase"
              >
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
