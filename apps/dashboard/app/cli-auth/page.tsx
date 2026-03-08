'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

import { UnauthorizedError, apiClient } from '../../lib/api';

export const dynamic = 'force-dynamic';

type CliAuthState = 'processing' | 'success' | 'error';

const safeChallenge = (value: string | null | undefined): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

function CliAuthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState<CliAuthState>('processing');
  const [message, setMessage] = useState('Checking your Apployd session...');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;

    const challengeId = safeChallenge(searchParams?.get('challenge'));
    if (!challengeId) {
      setState('error');
      setMessage('Missing CLI login challenge. Restart login from your terminal.');
      return;
    }

    const token =
      typeof window !== 'undefined' ? window.localStorage.getItem('apployd_token') ?? '' : '';
    if (!token) {
      const next = `/cli-auth?challenge=${encodeURIComponent(challengeId)}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.replace(`/login?next=${encodeURIComponent(next)}` as any);
      return;
    }

    const run = async () => {
      setMessage('Approving terminal access...');
      try {
        await apiClient.post('/auth/cli/approve', { challengeId });
        setState('success');
        setMessage('Terminal login complete. Return to your terminal.');
      } catch (error) {
        if (error instanceof UnauthorizedError) {
          return;
        }
        setState('error');
        setMessage((error as Error).message || 'Unable to complete CLI login.');
      }
    };

    run().catch(() => {
      setState('error');
      setMessage('Unable to complete CLI login.');
    });
  }, [router, searchParams]);

  return <CliAuthCard state={state} message={message} />;
}

function CliAuthCard({ state, message }: { state: CliAuthState; message: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <article className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        {state === 'processing' ? (
          <>
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
            <h1 className="text-lg font-semibold text-slate-900">Authorizing terminal login</h1>
            <p className="mt-2 text-sm text-slate-600">{message}</p>
          </>
        ) : null}

        {state === 'success' ? (
          <>
            <h1 className="text-lg font-semibold text-slate-900">Terminal connected</h1>
            <p className="mt-2 text-sm text-slate-600">{message}</p>
          </>
        ) : null}

        {state === 'error' ? (
          <>
            <h1 className="text-lg font-semibold text-slate-900">CLI login failed</h1>
            <p className="mt-2 text-sm text-slate-600">{message}</p>
            <div className="mt-4">
              <Link href="/login" className="btn-primary">
                Back to login
              </Link>
            </div>
          </>
        ) : null}
      </article>
    </main>
  );
}

export default function CliAuthPage() {
  return (
    <Suspense
      fallback={<CliAuthCard state="processing" message="Authorizing terminal access..." />}
    >
      <CliAuthContent />
    </Suspense>
  );
}
