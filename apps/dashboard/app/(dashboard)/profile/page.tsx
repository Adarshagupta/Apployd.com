'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { SectionCard } from '../../../components/section-card';
import { apiClient } from '../../../lib/api';

interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  createdAt?: string;
}

const formatDate = (value?: string): string => {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return '-';
  }

  return parsed.toLocaleString();
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const data = await apiClient.get('/auth/me');
        if (mounted) {
          setProfile((data.user ?? null) as UserProfile | null);
          setError('');
        }
      } catch (cause) {
        if (mounted) {
          setError((cause as Error).message);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const initials = useMemo(() => {
    const name = profile?.name?.trim();
    if (name) {
      return name
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('');
    }

    const email = profile?.email ?? '';
    return email.slice(0, 2).toUpperCase() || '--';
  }, [profile?.email, profile?.name]);

  return (
    <div className="space-y-4">
      <SectionCard title="Account Identity" subtitle="Personal profile and session-level account metadata.">
        {loading ? (
          <p className="text-sm text-slate-600">Loading profile...</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[160px_minmax(0,1fr)]">
            <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <span className="text-4xl font-semibold text-slate-900">{initials}</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <article className="metric-card">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Full Name</p>
                <p className="mt-1 text-base font-semibold text-slate-900">{profile?.name ?? '-'}</p>
              </article>
              <article className="metric-card">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Email</p>
                <p className="mt-1 text-base font-semibold text-slate-900">{profile?.email ?? '-'}</p>
              </article>
              <article className="metric-card">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">User ID</p>
                <p className="mono mt-1 text-xs font-semibold text-slate-900">{profile?.id ?? '-'}</p>
              </article>
              <article className="metric-card">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Created At</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{formatDate(profile?.createdAt)}</p>
              </article>
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Security Checklist" subtitle="Current baseline controls for account and workspace access.">
        <div className="grid gap-3 md:grid-cols-2">
          <article className="metric-card">
            <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Authentication</p>
            <p className="mt-1 text-sm text-slate-700">Session token validation active with server-side account checks.</p>
          </article>
          <article className="metric-card">
            <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Role Enforcement</p>
            <p className="mt-1 text-sm text-slate-700">Organization and project actions are guarded by RBAC permissions.</p>
          </article>
          <article className="metric-card">
            <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Auditability</p>
            <p className="mt-1 text-sm text-slate-700">Administrative actions are logged for traceability and incident review.</p>
          </article>
          <article className="metric-card">
            <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Support</p>
            <p className="mt-1 text-sm text-slate-700">Need access changes or policy review? Use Help Center links below.</p>
          </article>
        </div>
      </SectionCard>

      <SectionCard title="Account Shortcuts" subtitle="Quick access to profile-adjacent settings, docs, and legal pages.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Link href="/settings" className="metric-card transition hover:bg-slate-50">
            <p className="text-sm font-semibold text-slate-900">Workspace Settings</p>
            <p className="mt-1 text-xs text-slate-600">Manage organization, billing plan, and integration status.</p>
          </Link>
          <Link href="/support" className="metric-card transition hover:bg-slate-50">
            <p className="text-sm font-semibold text-slate-900">Help Center</p>
            <p className="mt-1 text-xs text-slate-600">Troubleshooting guides, support channels, and FAQ.</p>
          </Link>
          <Link href="/privacy" className="metric-card transition hover:bg-slate-50">
            <p className="text-sm font-semibold text-slate-900">Privacy Policy</p>
            <p className="mt-1 text-xs text-slate-600">How account and infrastructure data is handled.</p>
          </Link>
          <Link href="/terms" className="metric-card transition hover:bg-slate-50">
            <p className="text-sm font-semibold text-slate-900">Terms and Conditions</p>
            <p className="mt-1 text-xs text-slate-600">Usage terms, responsibilities, and service limitations.</p>
          </Link>
        </div>
      </SectionCard>

      {error ? <p className="text-sm text-slate-900">{error}</p> : null}
    </div>
  );
}
