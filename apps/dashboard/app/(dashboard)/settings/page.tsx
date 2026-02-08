'use client';

import { useEffect, useState } from 'react';

import { SectionCard } from '../../../components/section-card';
import { apiClient } from '../../../lib/api';
import { useWorkspace } from '../../../lib/workspace';

export default function SettingsPage() {
  const { organizations, selectedOrganizationId, setSelectedOrganizationId } = useWorkspace();
  const [me, setMe] = useState<{ id: string; email: string; name: string | null; createdAt?: string } | null>(null);
  const [subscription, setSubscription] = useState<{
    status: string;
    currentPeriodEnd: string;
    plan: { code: string; displayName: string } | null;
  } | null>(null);
  const [githubConnected, setGithubConnected] = useState(false);
  const [message, setMessage] = useState('');

  const load = async () => {
    try {
      const [meData, githubStatus] = await Promise.all([
        apiClient.get('/auth/me'),
        apiClient.get('/integrations/github/status'),
      ]);

      setMe(meData.user ?? null);
      setGithubConnected(Boolean(githubStatus.connected));

      if (selectedOrganizationId) {
        const current = await apiClient.get(`/plans/current?organizationId=${selectedOrganizationId}`);
        setSubscription(current.subscription ?? null);
      } else {
        setSubscription(null);
      }

      setMessage('');
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  useEffect(() => {
    load().catch(() => undefined);
  }, [selectedOrganizationId]);

  return (
    <div className="space-y-4">
      <SectionCard title="Workspace Settings" subtitle="Account profile and subscription context for current workspace.">
        <div className="grid gap-3 md:grid-cols-[320px_1fr]">
          <label>
            <span className="field-label">Organization</span>
            <select
              value={selectedOrganizationId}
              onChange={(event) => setSelectedOrganizationId(event.target.value)}
              className="field-input"
            >
              {!organizations.length ? <option value="">No organizations</option> : null}
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </label>
          <div className="panel-muted p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Security posture</p>
            <p className="mt-1 text-sm text-slate-700">
              GitHub integration: <span className="font-medium">{githubConnected ? 'Connected' : 'Not connected'}</span>
            </p>
            <p className="text-sm text-slate-700">
              Auth type: <span className="font-medium">JWT session</span>
            </p>
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="User Profile">
          <div className="space-y-1 text-sm text-slate-700">
            <p>
              Name: <span className="font-medium text-slate-900">{me?.name ?? '-'}</span>
            </p>
            <p>
              Email: <span className="font-medium text-slate-900">{me?.email ?? '-'}</span>
            </p>
            <p>
              User ID: <span className="mono text-xs">{me?.id ?? '-'}</span>
            </p>
          </div>
        </SectionCard>

        <SectionCard title="Subscription">
          <div className="space-y-1 text-sm text-slate-700">
            <p>
              Plan:{' '}
              <span className="font-medium text-slate-900">
                {subscription?.plan
                  ? `${subscription.plan.displayName} (${subscription.plan.code})`
                  : 'No active subscription'}
              </span>
            </p>
            <p>
              Status: <span className="font-medium text-slate-900">{subscription?.status ?? '-'}</span>
            </p>
            <p>
              Period end:{' '}
              <span className="font-medium text-slate-900">
                {subscription?.currentPeriodEnd
                  ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
                  : '-'}
              </span>
            </p>
          </div>
        </SectionCard>
      </div>

      {message ? <p className="text-sm text-slate-700">{message}</p> : null}
    </div>
  );
}
