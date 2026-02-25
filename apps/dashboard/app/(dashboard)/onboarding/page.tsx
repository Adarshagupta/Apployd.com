'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { SectionCard } from '../../../components/section-card';
import { useWorkspaceContext } from '../../../components/workspace-provider';
import { apiClient } from '../../../lib/api';

interface OnboardingStatusResponse {
  completed?: boolean;
  githubConnected?: boolean;
}

interface GitHubStatusResponse {
  configured?: boolean;
  connected?: boolean;
}

interface TeamMembersResponse {
  members?: Array<{ id: string }>;
  invites?: Array<{ id: string }>;
  permissions?: {
    canManageInvites?: boolean;
  };
}

interface CurrentSubscriptionResponse {
  subscription?: {
    status?: string;
    plan?: {
      code?: string | null;
      displayName?: string | null;
    } | null;
  } | null;
}

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due']);

export default function OnboardingPage() {
  const router = useRouter();
  const { selectedOrganizationId, selectedOrganization, refresh } = useWorkspaceContext();

  const [githubConfigured, setGithubConfigured] = useState(false);
  const [githubConnected, setGithubConnected] = useState(false);
  const [teamMembersCount, setTeamMembersCount] = useState(1);
  const [pendingInviteCount, setPendingInviteCount] = useState(0);
  const [canManageInvites, setCanManageInvites] = useState(false);
  const [subscriptionName, setSubscriptionName] = useState('Free');
  const [subscriptionCode, setSubscriptionCode] = useState('free');
  const [subscriptionStatus, setSubscriptionStatus] = useState('inactive');

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'developer' | 'viewer'>('developer');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [message, setMessage] = useState('');

  const teamSetupDone = teamMembersCount > 1 || pendingInviteCount > 0;
  const paidPlanActive = subscriptionCode !== 'free' && ACTIVE_SUBSCRIPTION_STATUSES.has(subscriptionStatus);

  const steps = useMemo(
    () => [
      {
        id: 'github',
        title: 'Connect GitHub',
        description: githubConnected
          ? 'GitHub account is connected.'
          : githubConfigured
            ? 'Link your GitHub account to import repositories and enable push deploys.'
            : 'GitHub OAuth is not configured on this server yet.',
        done: githubConnected,
      },
      {
        id: 'team',
        title: 'Invite team member',
        description: teamSetupDone
          ? `Team setup started (${teamMembersCount} member${teamMembersCount === 1 ? '' : 's'}, ${pendingInviteCount} pending invite${pendingInviteCount === 1 ? '' : 's'}).`
          : 'Invite at least one teammate to collaborate with role-based access.',
        done: teamSetupDone,
      },
      {
        id: 'billing',
        title: 'Purchase subscription',
        description: paidPlanActive
          ? `Active paid plan: ${subscriptionName}.`
          : `Current plan: ${subscriptionName}. Upgrade from Billing when ready.`,
        done: paidPlanActive,
      },
    ],
    [githubConnected, githubConfigured, teamSetupDone, teamMembersCount, pendingInviteCount, paidPlanActive, subscriptionName],
  );

  const load = async () => {
    if (!selectedOrganizationId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [onboardingData, githubData, teamData, subscriptionData] = await Promise.all([
        apiClient.get('/onboarding/status') as Promise<OnboardingStatusResponse>,
        apiClient.get('/integrations/github/status') as Promise<GitHubStatusResponse>,
        apiClient.get(`/teams/${selectedOrganizationId}/members`) as Promise<TeamMembersResponse>,
        apiClient.get(`/plans/current?organizationId=${selectedOrganizationId}`) as Promise<CurrentSubscriptionResponse>,
      ]);

      if (onboardingData.completed) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.replace('/overview' as any);
        return;
      }

      setGithubConfigured(Boolean(githubData.configured));
      setGithubConnected(Boolean(githubData.connected || onboardingData.githubConnected));
      setTeamMembersCount(teamData.members?.length ?? 1);
      setPendingInviteCount(teamData.invites?.length ?? 0);
      setCanManageInvites(Boolean(teamData.permissions?.canManageInvites));

      const planCodeRaw = subscriptionData.subscription?.plan?.code;
      const planCode = typeof planCodeRaw === 'string' && planCodeRaw.trim().length > 0
        ? planCodeRaw.trim().toLowerCase()
        : 'free';
      const planNameRaw = subscriptionData.subscription?.plan?.displayName;
      const planName = typeof planNameRaw === 'string' && planNameRaw.trim().length > 0
        ? planNameRaw.trim()
        : planCode === 'free'
          ? 'Free'
          : 'Unknown';
      const statusRaw = subscriptionData.subscription?.status;
      const status = typeof statusRaw === 'string' ? statusRaw.toLowerCase() : 'inactive';

      setSubscriptionCode(planCode);
      setSubscriptionName(planName);
      setSubscriptionStatus(status);
      setMessage('');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrganizationId]);

  const connectGithub = async () => {
    setActionLoading('github');
    setMessage('');

    try {
      const data = (await apiClient.get(
        `/integrations/github/connect-url?redirectTo=${encodeURIComponent('/onboarding')}`,
      )) as { url?: string };

      if (!data.url) {
        throw new Error('GitHub authorize URL missing.');
      }

      window.location.href = data.url;
    } catch (error) {
      setMessage((error as Error).message);
      setActionLoading('');
    }
  };

  const inviteTeammate = async () => {
    if (!selectedOrganizationId) {
      setMessage('Select an organization first.');
      return;
    }
    if (!inviteEmail.trim()) {
      setMessage('Enter an email to invite.');
      return;
    }

    setActionLoading('team');
    setMessage('');

    try {
      await apiClient.post('/teams/invite', {
        organizationId: selectedOrganizationId,
        email: inviteEmail.trim(),
        role: inviteRole,
      });

      setInviteEmail('');
      setMessage('Invite sent.');
      await Promise.all([load(), refresh()]);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setActionLoading('');
    }
  };

  const completeOnboarding = async () => {
    setActionLoading('complete');
    setMessage('');

    try {
      await apiClient.post('/onboarding/complete', {
        appType: 'fullstack_web',
        deploymentExperience: githubConnected ? 'used_vercel' : 'first_time',
        teamSize: teamMembersCount > 1 ? 'small' : 'solo',
        primaryGoal: 'ship_fast',
        notes: `setup_checklist github=${githubConnected}; team=${teamSetupDone}; paid_plan=${paidPlanActive}`,
        connectGithubNow: !githubConnected,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.push('/overview' as any);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setActionLoading('');
    }
  };

  if (loading) {
    return (
      <SectionCard
        title="Onboarding"
        subtitle="Preparing your workspace setup checklist."
      >
        <p className="text-sm text-slate-600">Loading onboarding...</p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-4">
      <SectionCard
        title="Welcome To Apployd"
        subtitle={`Complete your first-time setup for ${selectedOrganization?.name ?? 'your workspace'}.`}
      >
        <div className="space-y-3">
          {steps.map((step) => (
            <article key={step.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{step.title}</p>
                  <p className="mt-1 text-sm text-slate-600">{step.description}</p>
                </div>
                <span
                  className={`rounded-full border px-2 py-1 text-xs font-semibold ${
                    step.done
                      ? 'border-emerald-200 bg-emerald-100 text-emerald-800'
                      : 'border-amber-200 bg-amber-100 text-amber-800'
                  }`}
                >
                  {step.done ? 'Done' : 'Pending'}
                </span>
              </div>
            </article>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Setup Actions"
        subtitle="Connect tools and team first, then choose a paid subscription when ready."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <button
            type="button"
            className="btn-primary"
            onClick={connectGithub}
            disabled={actionLoading === 'github' || !githubConfigured}
          >
            {actionLoading === 'github' ? 'Opening GitHub...' : githubConnected ? 'Reconnect GitHub' : 'Connect GitHub'}
          </button>

          <Link href="/billing" className="btn-secondary text-center">
            Open Billing
          </Link>

          <button
            type="button"
            className="btn-secondary"
            onClick={completeOnboarding}
            disabled={actionLoading === 'complete'}
          >
            {actionLoading === 'complete' ? 'Finishing...' : 'Finish onboarding'}
          </button>
        </div>
      </SectionCard>

      <SectionCard
        title="Invite Team"
        subtitle="Send your first invite to start collaboration."
      >
        {canManageInvites ? (
          <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
            <input
              type="email"
              className="field-input"
              placeholder="teammate@company.com"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
            />
            <select
              className="field-input"
              value={inviteRole}
              onChange={(event) => setInviteRole(event.target.value as 'admin' | 'developer' | 'viewer')}
            >
              <option value="developer">Developer</option>
              <option value="admin">Admin</option>
              <option value="viewer">Viewer</option>
            </select>
            <button
              type="button"
              className="btn-primary"
              onClick={inviteTeammate}
              disabled={actionLoading === 'team'}
            >
              {actionLoading === 'team' ? 'Sending...' : 'Send invite'}
            </button>
          </div>
        ) : (
          <p className="text-sm text-slate-600">
            Your role does not allow invites. Ask an organization admin to invite teammates.
          </p>
        )}
      </SectionCard>

      {message ? <p className="text-sm text-slate-700">{message}</p> : null}
    </div>
  );
}
