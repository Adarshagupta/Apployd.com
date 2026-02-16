'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

import { apiClient } from '../../../lib/api';

export const dynamic = 'force-dynamic';

type CallbackState = 'processing' | 'error';

const safePath = (value: string | null | undefined, fallback: string): string => {
  if (!value) {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed;
  }

  return fallback;
};

function GitHubCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState<CallbackState>('processing');
  const [message, setMessage] = useState('Finalizing GitHub sign-in...');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;

    const run = async () => {
      const code = searchParams?.get('code')?.trim() ?? '';
      const nextFromQuery = searchParams?.get('next');
      const fallbackNext = safePath(nextFromQuery, '/overview');

      if (!code) {
        setState('error');
        setMessage('Missing GitHub login code. Please try signing in again.');
        return;
      }

      try {
        const data = await apiClient.post('/auth/github/exchange', { code });
        const token = typeof data?.token === 'string' ? data.token : '';
        if (!token) {
          throw new Error('GitHub login exchange did not return a session token.');
        }

        window.localStorage.setItem('apployd_token', token);
        const nextFromPayload = typeof data?.redirectTo === 'string' ? data.redirectTo : null;
        const target = safePath(nextFromPayload, fallbackNext);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.replace(target as any);
      } catch (error) {
        setState('error');
        setMessage((error as Error).message || 'GitHub sign-in failed.');
      }
    };

    run().catch(() => {
      setState('error');
      setMessage('GitHub sign-in failed.');
    });
  }, [router, searchParams]);

  return <GitHubCallbackCard state={state} message={message} />;
}

function GitHubCallbackCard({ state, message }: { state: CallbackState; message: string }) {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <article className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        {state === 'processing' ? (
          <>
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
            <h1 className="text-lg font-semibold text-slate-900">Signing you in</h1>
            <p className="mt-2 text-sm text-slate-600">{message}</p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-slate-900">GitHub sign-in failed</h1>
            <p className="mt-2 text-sm text-slate-600">{message}</p>
            <div className="mt-4">
              <Link href="/login" className="btn-primary">
                Back to login
              </Link>
            </div>
          </>
        )}
      </article>
    </main>
  );
}

export default function GitHubCallbackPage() {
  return (
    <Suspense fallback={<GitHubCallbackCard state="processing" message="Finalizing GitHub sign-in..." />}>
      <GitHubCallbackContent />
    </Suspense>
  );
}
