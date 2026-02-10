'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const AUTH_STORAGE_KEY = 'apployd_token';

export function AuthRedirect({ to = '/overview' }: { to?: string }) {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const token = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (token) {
      router.replace(to);
    }
  }, [router, to]);

  return null;
}
