'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { apiClient } from '../../../lib/api';

type WizardStep = 'github' | 'team' | 'billing' | 'finish';

interface OrganizationRecord {
  id: string;
  name: string;
  role: 'owner' | 'admin' | 'developer' | 'viewer';
}

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

interface PlanListResponse {
  plans?: Array<{
    code?: string | null;
    checkoutEnabled?: boolean;
  }>;
}

const CHECKOUT_PLAN_CODES = ['dev', 'pro', 'max'] as const;
const PAID_PLAN_CODES = new Set(['dev', 'pro', 'max', 'enterprise']);
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due']);

const parseStep = (value: string | null): WizardStep | null => {
  if (value === 'github' || value === 'team' || value === 'billing' || value === 'finish') {
    return value;
  }
  return null;
};

export default function StandaloneOnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [message, setMessage] = useState('');
  const [step, setStep] = useState<WizardStep>('github');

  const [organization, setOrganization] = useState<OrganizationRecord | null>(null);
  const [canManageInvites, setCanManageInvites] = useState(false);

  const [githubConfigured, setGithubConfigured] = useState(false);
  const [githubConnected, setGithubConnected] = useState(false);

  const [teamMembersCount, setTeamMembersCount] = useState(1);
  const [pendingInviteCount, setPendingInviteCount] = useState(0);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'developer' | 'viewer'>('developer');

  const [subscriptionName, setSubscriptionName] = useState('Free');
  const [subscriptionCode, setSubscriptionCode] = useState('free');
  const [subscriptionStatus, setSubscriptionStatus] = useState('inactive');
  const [availableCheckoutPlans, setAvailableCheckoutPlans] = useState<Array<(typeof CHECKOUT_PLAN_CODES)[number]>>(
    [...CHECKOUT_PLAN_CODES],
  );

  const teamSetupDone = teamMembersCount > 1 || pendingInviteCount > 0;
  const paidPlanActive =
    PAID_PLAN_CODES.has(subscriptionCode) && ACTIVE_SUBSCRIPTION_STATUSES.has(subscriptionStatus);

  const steps = useMemo(
    () => [
      { id: 'github' as const, label: 'Connect GitHub', done: githubConnected },
      { id: 'team' as const, label: 'Invite Team', done: teamSetupDone },
      { id: 'billing' as const, label: 'Subscription', done: paidPlanActive },
      { id: 'finish' as const, label: 'Finish', done: false },
    ],
    [githubConnected, paidPlanActive, teamSetupDone],
  );

  const loadState = async () => {
    if (typeof window === 'undefined') {
      return;
    }

    const token = window.localStorage.getItem('apployd_token');
    if (!token) {
      const next = encodeURIComponent('/onboarding');
      window.location.replace(`/login?next=${next}`);
      return;
    }

    setLoading(true);
    try {
      const organizationsPayload = (await apiClient.get('/organizations')) as {
        organizations?: OrganizationRecord[];
      };
      const primaryOrg = organizationsPayload.organizations?.[0] ?? null;
      if (!primaryOrg) {
        throw new Error('No organization found for this account.');
      }
      setOrganization(primaryOrg);

      const [onboarding, github, team, subscription, plans] = await Promise.all([
        apiClient.get('/onboarding/status') as Promise<OnboardingStatusResponse>,
        apiClient.get('/integrations/github/status') as Promise<GitHubStatusResponse>,
        apiClient.get(`/teams/${primaryOrg.id}/members`) as Promise<TeamMembersResponse>,
        apiClient.get(`/plans/current?organizationId=${primaryOrg.id}`) as Promise<CurrentSubscriptionResponse>,
        apiClient.get('/plans') as Promise<PlanListResponse>,
      ]);

      if (onboarding.completed) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.replace('/overview' as any);
        return;
      }

      const githubConnectedNow = Boolean(github.connected || onboarding.githubConnected);
      const teamMembers = team.members?.length ?? 1;
      const pendingInvites = team.invites?.length ?? 0;

      const planCodeRaw = subscription.subscription?.plan?.code;
      const planCode = typeof planCodeRaw === 'string' && planCodeRaw.trim()
        ? planCodeRaw.trim().toLowerCase()
        : 'free';
      const planStatusRaw = subscription.subscription?.status;
      const planStatus = typeof planStatusRaw === 'string' ? planStatusRaw.toLowerCase() : 'inactive';
      const planNameRaw = subscription.subscription?.plan?.displayName;
      const planName =
        typeof planNameRaw === 'string' && planNameRaw.trim()
          ? planNameRaw.trim()
          : planCode === 'free'
            ? 'Free'
            : 'Unknown';

      setGithubConfigured(Boolean(github.configured));
      setGithubConnected(githubConnectedNow);
      setCanManageInvites(Boolean(team.permissions?.canManageInvites));
      setTeamMembersCount(teamMembers);
      setPendingInviteCount(pendingInvites);
      setSubscriptionCode(planCode);
      setSubscriptionStatus(planStatus);
      setSubscriptionName(planName);
      setAvailableCheckoutPlans(
        (plans.plans ?? [])
          .map((plan) => {
            const code = typeof plan.code === 'string' ? plan.code.trim().toLowerCase() : '';
            if (!CHECKOUT_PLAN_CODES.includes(code as (typeof CHECKOUT_PLAN_CODES)[number])) {
              return null;
            }

            return plan.checkoutEnabled === false ? null : (code as (typeof CHECKOUT_PLAN_CODES)[number]);
          })
          .filter((planCode): planCode is (typeof CHECKOUT_PLAN_CODES)[number] => Boolean(planCode)),
      );

      const queryStep = parseStep(searchParams?.get('step') ?? null);
      const teamDoneNow = teamMembers > 1 || pendingInvites > 0;
      const paidDoneNow = PAID_PLAN_CODES.has(planCode) && ACTIVE_SUBSCRIPTION_STATUSES.has(planStatus);
      const autoStep: WizardStep = !githubConnectedNow
        ? 'github'
        : !teamDoneNow
          ? 'team'
          : !paidDoneNow
            ? 'billing'
            : 'finish';
      setStep(queryStep ?? autoStep);
      setMessage('');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadState().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectGithub = async () => {
    setActionLoading('github');
    setMessage('');
    try {
      const data = (await apiClient.get(
        `/integrations/github/connect-url?redirectTo=${encodeURIComponent('/onboarding?step=github')}`,
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
    if (!organization) {
      setMessage('Organization not loaded.');
      return;
    }
    if (!inviteEmail.trim()) {
      setMessage('Enter teammate email.');
      return;
    }

    setActionLoading('team');
    setMessage('');
    try {
      await apiClient.post('/teams/invite', {
        organizationId: organization.id,
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      setInviteEmail('');
      await loadState();
      setStep('billing');
      setMessage('Invite sent.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setActionLoading('');
    }
  };

  const startCheckout = async (planCode: 'dev' | 'pro' | 'max') => {
    if (!organization) {
      setMessage('Organization not loaded.');
      return;
    }

    setActionLoading(`billing-${planCode}`);
    setMessage('');
    try {
      const nextBase = window.location.origin;
      const response = (await apiClient.post('/billing/checkout-session', {
        organizationId: organization.id,
        planCode,
        successUrl: `${nextBase}/onboarding?step=billing`,
        cancelUrl: `${nextBase}/onboarding?step=billing&status=cancelled`,
      })) as { checkoutUrl?: string };

      if (!response.checkoutUrl) {
        throw new Error('Checkout URL missing.');
      }
      window.location.href = response.checkoutUrl;
    } catch (error) {
      setMessage((error as Error).message);
      setActionLoading('');
    }
  };

  const completeOnboarding = async () => {
    setActionLoading('finish');
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

  const moveNext = () => {
    if (step === 'github') {
      setStep('team');
      return;
    }
    if (step === 'team') {
      setStep('billing');
      return;
    }
    if (step === 'billing') {
      setStep('finish');
    }
  };

  const currentCheckoutStatus = searchParams?.get('status');
  const organizationId = organization?.id ?? null;
  const providerSubscriptionId = searchParams?.get('subscription_id') ?? undefined;
  useEffect(() => {
    if (!organizationId) {
      return;
    }

    if (currentCheckoutStatus === 'succeeded' || currentCheckoutStatus === 'processing') {
      apiClient.post('/billing/sync-subscription', {
        organizationId,
        ...(providerSubscriptionId ? { providerSubscriptionId } : {}),
      })
        .then(() => loadState())
        .then(() => {
          setMessage(
            currentCheckoutStatus === 'succeeded'
              ? 'Payment successful. Subscription synced.'
              : 'Payment is processing. Subscription state refreshed.',
          );
        })
        .catch((error) => {
          setMessage((error as Error).message);
        });
      return;
    }

    if (currentCheckoutStatus === 'failed') {
      setMessage('Payment failed. Try again after updating your payment method.');
      return;
    }

    if (currentCheckoutStatus === 'cancelled') {
      setMessage('Checkout cancelled.');
      return;
    }

    if (!currentCheckoutStatus) {
      setMessage('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCheckoutStatus, providerSubscriptionId, organizationId]);

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <article className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-600">Preparing onboarding...</p>
        </article>
      </main>
    );
  }

  const selectedIndex = steps.findIndex((item) => item.id === step);

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-8">
      <article className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <header className="mb-6 space-y-2">
          <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Workspace Onboarding</p>
          <h1 className="text-2xl font-semibold text-slate-900">
            {organization ? `Set up ${organization.name}` : 'Set up your workspace'}
          </h1>
          <p className="text-sm text-slate-600">
            Complete one step at a time. You can finish now and configure details later.
          </p>
        </header>

        <div className="mb-6 grid gap-2 sm:grid-cols-4">
          {steps.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setStep(item.id)}
              className={`rounded-lg border px-3 py-2 text-left text-xs ${
                selectedIndex === index
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : item.done
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              {index + 1}. {item.label}
            </button>
          ))}
        </div>

        {step === 'github' ? (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">Step 1: Connect GitHub</h2>
            <p className="text-sm text-slate-600">
              Connect GitHub to import repositories and enable automatic deployments on push.
            </p>
            <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-700">
              Status: {githubConnected ? 'Connected' : githubConfigured ? 'Not connected' : 'OAuth not configured'}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary"
                onClick={connectGithub}
                disabled={actionLoading === 'github' || !githubConfigured}
              >
                {actionLoading === 'github'
                  ? 'Opening GitHub...'
                  : githubConnected
                    ? 'Reconnect GitHub'
                    : 'Connect GitHub'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={moveNext}
                disabled={!githubConnected}
              >
                Continue
              </button>
            </div>
          </section>
        ) : null}

        {step === 'team' ? (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">Step 2: Invite Team</h2>
            <p className="text-sm text-slate-600">
              Add at least one teammate so your workspace is collaborative.
            </p>
            <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-700">
              Members: {teamMembersCount} | Pending invites: {pendingInviteCount}
            </div>
            {canManageInvites ? (
              <div className="grid gap-2 md:grid-cols-[1fr_180px_auto]">
                <input
                  type="email"
                  className="field-input"
                  placeholder="teammate@gmail.com"
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
              <p className="text-sm text-slate-600">Your role cannot send invites. Ask an admin or owner.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={() => setStep('github')}>
                Back
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={moveNext}
                disabled={!teamSetupDone}
              >
                Continue
              </button>
            </div>
          </section>
        ) : null}

        {step === 'billing' ? (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">Step 3: Purchase Subscription</h2>
            <p className="text-sm text-slate-600">
              Upgrade when you need higher resources and advanced production features.
            </p>
            <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-700">
              Current plan: {subscriptionName} ({subscriptionStatus})
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {availableCheckoutPlans.map((planCode) => (
                <button
                  key={planCode}
                  type="button"
                  className="btn-primary"
                  onClick={() => startCheckout(planCode)}
                  disabled={actionLoading === `billing-${planCode}`}
                >
                  {actionLoading === `billing-${planCode}`
                    ? 'Opening checkout...'
                    : `Choose ${planCode.toUpperCase()}`}
                </button>
              ))}
            </div>
            {!availableCheckoutPlans.length ? (
              <p className="text-sm text-slate-600">
                Paid checkout is not configured for this environment yet.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={() => setStep('team')}>
                Back
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={moveNext}
                disabled={!paidPlanActive}
              >
                Continue
              </button>
              {!paidPlanActive ? (
                <button type="button" className="btn-secondary" onClick={() => setStep('finish')}>
                  Skip for now
                </button>
              ) : null}
            </div>
          </section>
        ) : null}

        {step === 'finish' ? (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">Finish onboarding</h2>
            <p className="text-sm text-slate-600">
              Review your setup and continue to dashboard.
            </p>
            <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-700">
              <p>GitHub: {githubConnected ? 'Connected' : 'Not connected'}</p>
              <p>Team: {teamSetupDone ? 'Configured' : 'Not configured'}</p>
              <p>Subscription: {paidPlanActive ? `${subscriptionName} active` : `${subscriptionName} (free/limited)`}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={() => setStep('billing')}>
                Back
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={completeOnboarding}
                disabled={actionLoading === 'finish'}
              >
                {actionLoading === 'finish' ? 'Finishing...' : 'Go to dashboard'}
              </button>
            </div>
          </section>
        ) : null}

        {message ? <p className="mt-4 text-sm text-slate-700">{message}</p> : null}
      </article>
    </main>
  );
}
