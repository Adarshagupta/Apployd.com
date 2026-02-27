'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type DashboardToastTone = 'info' | 'success' | 'warning' | 'error';

interface DashboardToastInput {
  message: string;
  tone?: DashboardToastTone;
  title?: string;
  durationMs?: number;
}

interface DashboardToastItem {
  id: number;
  message: string;
  tone: DashboardToastTone;
  title: string | null;
  durationMs: number;
}

interface DashboardToastContextValue {
  showToast: (input: DashboardToastInput | string) => void;
  dismissToast: (id: number) => void;
}

const DEFAULT_DURATION_MS = 4500;
const MAX_VISIBLE_TOASTS = 4;

const DashboardToastContext = createContext<DashboardToastContextValue | null>(null);

const normalizeToastMessage = (value: string): string => value.trim();

const inferToneFromMessage = (value: string): DashboardToastTone => {
  const normalized = value.toLowerCase();
  if (
    normalized.includes('error')
    || normalized.includes('failed')
    || normalized.includes('invalid')
    || normalized.includes('missing')
    || normalized.includes('required')
    || normalized.includes('unable')
  ) {
    return 'error';
  }
  if (normalized.includes('warning') || normalized.includes('limited') || normalized.includes('disabled')) {
    return 'warning';
  }
  if (
    normalized.includes('success')
    || normalized.includes('created')
    || normalized.includes('updated')
    || normalized.includes('connected')
    || normalized.includes('saved')
    || normalized.includes('synced')
    || normalized.includes('loaded')
  ) {
    return 'success';
  }
  return 'info';
};

export function DashboardToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<DashboardToastItem[]>([]);
  const nextIdRef = useRef(0);
  const timeoutByIdRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: number) => {
    setToasts((previous) => previous.filter((toast) => toast.id !== id));
    const activeTimeout = timeoutByIdRef.current.get(id);
    if (activeTimeout) {
      clearTimeout(activeTimeout);
      timeoutByIdRef.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    (input: DashboardToastInput | string) => {
      const rawMessage = typeof input === 'string' ? input : input.message;
      const message = normalizeToastMessage(rawMessage);
      if (!message) {
        return;
      }

      const tone =
        typeof input === 'string'
          ? inferToneFromMessage(message)
          : input.tone ?? inferToneFromMessage(message);
      const durationMs =
        typeof input === 'string'
          ? DEFAULT_DURATION_MS
          : Math.max(1200, Math.min(input.durationMs ?? DEFAULT_DURATION_MS, 12000));

      const id = nextIdRef.current + 1;
      nextIdRef.current = id;

      const toast: DashboardToastItem = {
        id,
        message,
        tone,
        title: typeof input === 'string' ? null : input.title?.trim() || null,
        durationMs,
      };

      setToasts((previous) => {
        const next = [...previous, toast];
        if (next.length <= MAX_VISIBLE_TOASTS) {
          return next;
        }

        const overflow = next.length - MAX_VISIBLE_TOASTS;
        const removed = next.slice(0, overflow);
        for (const removedToast of removed) {
          const activeTimeout = timeoutByIdRef.current.get(removedToast.id);
          if (activeTimeout) {
            clearTimeout(activeTimeout);
            timeoutByIdRef.current.delete(removedToast.id);
          }
        }
        return next.slice(overflow);
      });

      const timeout = setTimeout(() => {
        dismissToast(id);
      }, durationMs);
      timeoutByIdRef.current.set(id, timeout);
    },
    [dismissToast],
  );

  useEffect(
    () => () => {
      for (const timeout of timeoutByIdRef.current.values()) {
        clearTimeout(timeout);
      }
      timeoutByIdRef.current.clear();
    },
    [],
  );

  const contextValue = useMemo<DashboardToastContextValue>(
    () => ({
      showToast,
      dismissToast,
    }),
    [dismissToast, showToast],
  );

  return (
    <DashboardToastContext.Provider value={contextValue}>
      {children}
      <div className="dashboard-toast-viewport" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`dashboard-toast dashboard-toast-${toast.tone}`}
            role={toast.tone === 'error' ? 'alert' : 'status'}
          >
            <div className="dashboard-toast-copy">
              {toast.title ? <p className="dashboard-toast-title">{toast.title}</p> : null}
              <p className="dashboard-toast-message">{toast.message}</p>
            </div>
            <button
              type="button"
              className="dashboard-toast-close"
              aria-label="Dismiss notification"
              onClick={() => dismissToast(toast.id)}
            >
              x
            </button>
          </div>
        ))}
      </div>
    </DashboardToastContext.Provider>
  );
}

export function useDashboardToast(): DashboardToastContextValue {
  const context = useContext(DashboardToastContext);
  if (!context) {
    throw new Error('useDashboardToast must be used within DashboardToastProvider.');
  }
  return context;
}

export function useDashboardMessageToast(message: string | null | undefined, tone?: DashboardToastTone) {
  const { showToast } = useDashboardToast();
  const lastMessageRef = useRef('');

  useEffect(() => {
    const normalized = normalizeToastMessage(message ?? '');
    if (!normalized) {
      lastMessageRef.current = '';
      return;
    }
    if (normalized === lastMessageRef.current) {
      return;
    }
    if (tone) {
      showToast({ message: normalized, tone });
    } else {
      showToast({ message: normalized });
    }
    lastMessageRef.current = normalized;
  }, [message, showToast, tone]);
}
