'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { useDashboardMessageToast } from '../../../components/dashboard-toast';
import { SectionCard } from '../../../components/section-card';
import { useWorkspaceContext } from '../../../components/workspace-provider';
import { apiClient } from '../../../lib/api';

interface Plan {
  code: string;
  displayName: string;
  priceUsdMonthly: string;
  includedRamMb: number;
  includedCpuMillicore: number;
  includedBandwidthGb: number;
  checkoutEnabled?: boolean;
}

type DatabaseAddonTierCode = 'starter' | 'growth' | 'scale';
type DatabaseAddonSelection = 'hobby' | DatabaseAddonTierCode;

interface PlanAddonTierAvailability {
  checkoutEnabled?: boolean;
}

interface PlansResponse {
  plans?: Plan[];
  addons?: {
    database?: {
      checkoutEnabled?: boolean;
      tiers?: Partial<Record<DatabaseAddonTierCode, PlanAddonTierAvailability>>;
    };
  };
}

interface Invoice {
  id: string;
  amountDueUsd: string;
  amountPaidUsd: string;
  status: string;
  createdAt: string;
  hostedInvoiceUrl: string | null;
}

interface PlanCatalogItem {
  code: string;
  name: string;
  price: string;
  projects: string;
  ram: string;
  cpu: string;
  storage: string;
  bandwidth: string;
  support: string;
  sleepMode: string;
  previewEnvironments: string;
  customDomain: string;
  ssl: string;
  autoDeploy: string;
  backupPolicy: string;
  logRetention: string;
  analytics: string;
  bestFor: string;
  popular?: boolean;
}

interface DatabaseAddonTierOption {
  code: DatabaseAddonSelection;
  name: string;
  price: string;
  storage: string;
  compute: string;
  ram: string;
}

type PlanRecommendationCode = 'free' | 'dev' | 'pro' | 'max' | 'enterprise';

interface BillingCalculatorState {
  projects: number;
  monthlyTrafficGb: number;
  appStorageGb: number;
  peakRamMb: number;
  databaseStorageGb: number;
  needPreviewEnvironments: boolean;
  needPrioritySupport: boolean;
}

interface BillingRecommendationPlan {
  code: PlanRecommendationCode;
  name: string;
  price: string;
  maxProjects: number;
  maxBandwidthGb: number;
  maxStorageGb: number;
  maxRamMb: number;
  previewEnvironments: boolean;
  prioritySupport: boolean;
}

interface BillingRecommendationResult {
  plan: BillingRecommendationPlan;
  databaseAddon: DatabaseAddonTierOption;
  reasons: string[];
}

const planCatalog: PlanCatalogItem[] = [
  {
    code: 'free',
    name: 'Free',
    price: '$0 / month',
    projects: '2',
    ram: '512 MB',
    cpu: '0.2',
    storage: '2 GB',
    bandwidth: '10 GB / month',
    support: 'Community',
    sleepMode: 'Yes (after inactivity)',
    previewEnvironments: 'No',
    customDomain: 'No',
    ssl: 'No',
    autoDeploy: 'Yes',
    backupPolicy: 'Every 3 days (1 copy)',
    logRetention: '24 hours',
    analytics: 'Basic',
    bestFor: 'Students, demos, testing',
  },
  {
    code: 'dev',
    name: 'Dev',
    price: '$5 / month',
    projects: '6',
    ram: '1 GB / project',
    cpu: '0.5',
    storage: '10 GB',
    bandwidth: '40 GB / month',
    support: 'Email',
    sleepMode: 'Optional',
    previewEnvironments: 'No',
    customDomain: 'Yes',
    ssl: 'Yes',
    autoDeploy: 'Yes',
    backupPolicy: 'Daily (7 days)',
    logRetention: '7 days',
    analytics: 'Standard',
    bestFor: 'Side projects, MVPs',
  },
  {
    code: 'pro',
    name: 'Pro',
    price: '$12 / month',
    projects: '16',
    ram: '2 GB / project',
    cpu: '1.0',
    storage: '30 GB',
    bandwidth: '160 GB / month',
    support: 'Priority',
    sleepMode: 'No',
    previewEnvironments: 'Yes',
    customDomain: 'Yes',
    ssl: 'Yes',
    autoDeploy: 'Yes',
    backupPolicy: 'Daily (14 days)',
    logRetention: '14 days',
    analytics: 'Advanced',
    bestFor: 'Production apps, funded startups',
    popular: true,
  },
  {
    code: 'max',
    name: 'Max',
    price: '$25 / month',
    projects: '40',
    ram: '4 GB / project',
    cpu: '2.0',
    storage: '100 GB',
    bandwidth: '400 GB / month',
    support: '24/7 Priority',
    sleepMode: 'No',
    previewEnvironments: 'Unlimited',
    customDomain: 'Yes',
    ssl: 'Yes',
    autoDeploy: 'Yes',
    backupPolicy: 'Daily (30 days)',
    logRetention: '30 days',
    analytics: 'Pro + Insights',
    bestFor: 'Agencies, SaaS companies',
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    price: '$100+ / month',
    projects: 'Unlimited',
    ram: 'Custom',
    cpu: 'Custom',
    storage: 'Custom',
    bandwidth: 'Custom',
    support: 'Dedicated',
    sleepMode: 'Custom',
    previewEnvironments: 'Unlimited',
    customDomain: 'Unlimited',
    ssl: 'Enterprise',
    autoDeploy: 'Yes',
    backupPolicy: 'Hourly + Cross-region',
    logRetention: 'Custom',
    analytics: 'Custom',
    bestFor: 'Large startups, enterprises',
  },
];

const databaseAddonCatalog: DatabaseAddonTierOption[] = [
  {
    code: 'hobby',
    name: 'Hobby',
    price: 'Included',
    storage: '1 GB',
    compute: '500 mCPU-min',
    ram: '512 MB',
  },
  {
    code: 'starter',
    name: 'Starter',
    price: '$5.00 / month',
    storage: '5 GB',
    compute: '2,000 mCPU-min',
    ram: '1 GB',
  },
  {
    code: 'growth',
    name: 'Growth',
    price: '$19.99 / month',
    storage: '20 GB',
    compute: '8,000 mCPU-min',
    ram: '4 GB',
  },
  {
    code: 'scale',
    name: 'Scale',
    price: '$70.00 / month',
    storage: '100 GB',
    compute: '40,000 mCPU-min',
    ram: '16 GB',
  },
];

const hobbyDatabaseAddon = databaseAddonCatalog.find((tier) => tier.code === 'hobby')!;
const starterDatabaseAddon = databaseAddonCatalog.find((tier) => tier.code === 'starter')!;
const growthDatabaseAddon = databaseAddonCatalog.find((tier) => tier.code === 'growth')!;
const scaleDatabaseAddon = databaseAddonCatalog.find((tier) => tier.code === 'scale')!;
const billingRecommendationPlans: BillingRecommendationPlan[] = [
  {
    code: 'free',
    name: 'Free',
    price: '$0 / month',
    maxProjects: 2,
    maxBandwidthGb: 10,
    maxStorageGb: 2,
    maxRamMb: 512,
    previewEnvironments: false,
    prioritySupport: false,
  },
  {
    code: 'dev',
    name: 'Dev',
    price: '$5 / month',
    maxProjects: 6,
    maxBandwidthGb: 40,
    maxStorageGb: 10,
    maxRamMb: 1024,
    previewEnvironments: false,
    prioritySupport: false,
  },
  {
    code: 'pro',
    name: 'Pro',
    price: '$12 / month',
    maxProjects: 16,
    maxBandwidthGb: 160,
    maxStorageGb: 30,
    maxRamMb: 2048,
    previewEnvironments: true,
    prioritySupport: true,
  },
  {
    code: 'max',
    name: 'Max',
    price: '$25 / month',
    maxProjects: 40,
    maxBandwidthGb: 400,
    maxStorageGb: 100,
    maxRamMb: 4096,
    previewEnvironments: true,
    prioritySupport: true,
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    price: '$100+ / month',
    maxProjects: Number.POSITIVE_INFINITY,
    maxBandwidthGb: Number.POSITIVE_INFINITY,
    maxStorageGb: Number.POSITIVE_INFINITY,
    maxRamMb: Number.POSITIVE_INFINITY,
    previewEnvironments: true,
    prioritySupport: true,
  },
] as const;

const calculatorDefaults: BillingCalculatorState = {
  projects: 3,
  monthlyTrafficGb: 40,
  appStorageGb: 8,
  peakRamMb: 1024,
  databaseStorageGb: 5,
  needPreviewEnvironments: false,
  needPrioritySupport: false,
};

const formatDatabaseAddonOptionLabel = (tier: DatabaseAddonTierOption): string =>
  `${tier.name} · ${tier.price} · ${tier.storage} · ${tier.ram} RAM · ${tier.compute}`;

const recommendDatabaseAddonTier = (input: BillingCalculatorState): DatabaseAddonTierOption => {
  if (input.databaseStorageGb <= 1 && input.monthlyTrafficGb <= 40) {
    return hobbyDatabaseAddon;
  }
  if (input.databaseStorageGb <= 5 && input.monthlyTrafficGb <= 120) {
    return starterDatabaseAddon;
  }
  if (input.databaseStorageGb <= 20 && input.monthlyTrafficGb <= 300) {
    return growthDatabaseAddon;
  }
  return scaleDatabaseAddon;
};

const recommendBillingPlan = (input: BillingCalculatorState): BillingRecommendationResult => {
  const recommendedPlan =
    billingRecommendationPlans.find((plan) => (
      input.projects <= plan.maxProjects
      && input.monthlyTrafficGb <= plan.maxBandwidthGb
      && input.appStorageGb <= plan.maxStorageGb
      && input.peakRamMb <= plan.maxRamMb
      && (!input.needPreviewEnvironments || plan.previewEnvironments)
      && (!input.needPrioritySupport || plan.prioritySupport)
    ))
    ?? billingRecommendationPlans[billingRecommendationPlans.length - 1]!;

  const reasons = [
    `${input.projects} active project${input.projects === 1 ? '' : 's'} to host.`,
    `${input.monthlyTrafficGb} GB/month estimated traffic.`,
    `${input.appStorageGb} GB application storage requirement.`,
    `${input.peakRamMb} MB peak RAM needed per app.`,
    input.needPreviewEnvironments ? 'Preview environments are required for the workflow.' : 'No preview environments needed right now.',
    input.needPrioritySupport ? 'Priority support is preferred for production workloads.' : 'Standard support is acceptable for now.',
  ];

  return {
    plan: recommendedPlan,
    databaseAddon: recommendDatabaseAddonTier(input),
    reasons,
  };
};

function SkeletonBlock({ className }: { className: string }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}

export default function BillingPage() {
  const { selectedOrganizationId, subscription, refreshSubscription } = useWorkspaceContext();
  const searchParams = useSearchParams();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [calculatorState, setCalculatorState] = useState<BillingCalculatorState>(calculatorDefaults);
  const [databaseAddonAvailability, setDatabaseAddonAvailability] = useState<Record<DatabaseAddonTierCode, boolean>>({
    starter: false,
    growth: false,
    scale: false,
  });
  const [databaseAddonSelectionByPlan, setDatabaseAddonSelectionByPlan] = useState<
    Partial<Record<string, DatabaseAddonSelection>>
  >({});
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [redirectingToCheckout, setRedirectingToCheckout] = useState(false);
  const [redirectingPlanCode, setRedirectingPlanCode] = useState<string | null>(null);
  useDashboardMessageToast(message);

  const availablePlansByCode = useMemo(() => {
    const map = new Map<string, Plan>();
    for (const plan of plans) {
      map.set(plan.code.toLowerCase(), plan);
    }
    return map;
  }, [plans]);

  const currentPlan = useMemo(() => {
    const codeRaw = subscription?.plan?.code;
    const displayNameRaw = subscription?.plan?.displayName;
    const statusRaw = subscription?.status;
    const periodEndRaw = subscription?.currentPeriodEnd;

    if (
      typeof codeRaw !== 'string'
      || codeRaw.trim().length === 0
      || typeof displayNameRaw !== 'string'
      || displayNameRaw.trim().length === 0
      || typeof statusRaw !== 'string'
      || statusRaw.trim().length === 0
      || typeof periodEndRaw !== 'string'
      || periodEndRaw.trim().length === 0
    ) {
      return null;
    }

    return {
      code: codeRaw.trim(),
      displayName: displayNameRaw.trim(),
      status: statusRaw.trim(),
      periodEnd: periodEndRaw,
    };
  }, [subscription]);

  const currentPlanCode = currentPlan?.code.toLowerCase() ?? null;
  const checkoutStatus = searchParams?.get('status');
  const providerSubscriptionId = searchParams?.get('subscription_id') ?? undefined;
  const checkoutSuccess = checkoutStatus === 'succeeded';
  const checkoutProcessing = checkoutStatus === 'processing';
  const currentPlanPrice = useMemo(() => {
    if (!currentPlan) {
      return null;
    }

    const apiPlan = availablePlansByCode.get(currentPlan.code.toLowerCase());
    if (apiPlan?.priceUsdMonthly) {
      return `$${apiPlan.priceUsdMonthly} / month`;
    }

    const catalogPlan = planCatalog.find((item) => item.code === currentPlan.code.toLowerCase());
    return catalogPlan?.price ?? null;
  }, [availablePlansByCode, currentPlan]);

  const availableDatabaseAddonOptions = useMemo(
    () => [
      hobbyDatabaseAddon,
      ...(databaseAddonAvailability.starter ? [starterDatabaseAddon] : []),
      ...(databaseAddonAvailability.growth ? [growthDatabaseAddon] : []),
      ...(databaseAddonAvailability.scale ? [scaleDatabaseAddon] : []),
    ],
    [databaseAddonAvailability],
  );
  const calculatorRecommendation = useMemo(
    () => recommendBillingPlan(calculatorState),
    [calculatorState],
  );
  const suggestedDatabaseAddon = useMemo(
    () =>
      availableDatabaseAddonOptions.find((tier) => tier.code === calculatorRecommendation.databaseAddon.code)
      ?? availableDatabaseAddonOptions[availableDatabaseAddonOptions.length - 1]
      ?? hobbyDatabaseAddon,
    [availableDatabaseAddonOptions, calculatorRecommendation.databaseAddon.code],
  );

  const load = async () => {
    setLoading(true);
    try {
      const planData = (await apiClient.get('/plans')) as PlansResponse;
      setPlans(planData.plans ?? []);
      setDatabaseAddonAvailability({
        starter: Boolean(planData.addons?.database?.tiers?.starter?.checkoutEnabled),
        growth: Boolean(planData.addons?.database?.tiers?.growth?.checkoutEnabled),
        scale: Boolean(planData.addons?.database?.tiers?.scale?.checkoutEnabled),
      });

      if (selectedOrganizationId) {
        if (checkoutStatus === 'succeeded' || checkoutStatus === 'processing') {
          await apiClient.post('/billing/sync-subscription', {
            organizationId: selectedOrganizationId,
            ...(providerSubscriptionId ? { providerSubscriptionId } : {}),
          });
          await refreshSubscription();
        }

        const invoiceData = await apiClient.get(`/billing/invoices?organizationId=${selectedOrganizationId}`);
        setInvoices(invoiceData.invoices ?? []);
      } else {
        setInvoices([]);
      }
      if (checkoutStatus === 'cancelled') {
        setMessage('Checkout was cancelled.');
      } else if (checkoutStatus === 'failed') {
        setMessage('Payment failed. Update your payment method and try again.');
      } else if (checkoutStatus === 'processing') {
        setMessage('Payment is processing. Subscription state will refresh automatically.');
      } else if (checkoutStatus === 'succeeded') {
        setMessage('Payment successful. Subscription synced.');
      } else {
        setMessage('');
      }
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrganizationId, checkoutStatus, providerSubscriptionId, refreshSubscription]);

  const startUpgrade = async (planCode: string, databaseAddonTier: DatabaseAddonTierCode | null) => {
    if (!selectedOrganizationId) {
      setMessage('Organization required');
      return;
    }

    try {
      setMessage('');
      setRedirectingPlanCode(planCode);
      setRedirectingToCheckout(true);
      const response = await apiClient.post('/billing/checkout-session', {
        organizationId: selectedOrganizationId,
        planCode,
        ...(databaseAddonTier ? { databaseAddonTier } : {}),
        successUrl: `${window.location.origin}/billing`,
        cancelUrl: `${window.location.origin}/billing?status=cancelled`,
      });

      if (response.checkoutUrl) {
        window.location.href = response.checkoutUrl;
        return;
      }

      setMessage('Checkout URL missing');
      setRedirectingToCheckout(false);
      setRedirectingPlanCode(null);
    } catch (error) {
      setMessage((error as Error).message);
      setRedirectingToCheckout(false);
      setRedirectingPlanCode(null);
    }
  };

  const updateCalculatorNumber = (field: keyof Pick<
    BillingCalculatorState,
    'projects' | 'monthlyTrafficGb' | 'appStorageGb' | 'peakRamMb' | 'databaseStorageGb'
  >) => (value: string) => {
    const nextValue = Number(value);
    setCalculatorState((current) => ({
      ...current,
      [field]: Number.isFinite(nextValue) && nextValue >= 0 ? nextValue : 0,
    }));
  };

  const applyCalculatorRecommendation = () => {
    if (calculatorRecommendation.plan.code !== 'enterprise' && calculatorRecommendation.plan.code !== 'free') {
      setDatabaseAddonSelectionByPlan((current) => ({
        ...current,
        [calculatorRecommendation.plan.code]: suggestedDatabaseAddon.code,
      }));
    }

    setIsCalculatorOpen(false);
    if (typeof document !== 'undefined') {
      document.getElementById(`plan-card-${calculatorRecommendation.plan.code}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  };

  return (
    <div className="space-y-4">
      {checkoutSuccess ? (
        <SectionCard title="Purchase Complete" subtitle="Your billing upgrade is active and synced.">
          <div className="billing-success-wrap">
            <div className="billing-success-confetti billing-success-confetti-left" />
            <div className="billing-success-confetti billing-success-confetti-right" />
            <div className="billing-success-card">
              <div className="billing-success-kicker">
                <span className="billing-success-check" aria-hidden="true">✓</span>
                <span>Payment Successful</span>
              </div>
              <p className="billing-success-title">
                {currentPlan ? `${currentPlan.displayName} plan is now active.` : 'Your subscription is now active.'}
              </p>
              <p className="billing-success-copy">
                Usage pools, feature limits, and project entitlements have been refreshed.
              </p>
              <div className="billing-success-meta">
                <span>
                  Status: <strong>Successful</strong>
                </span>
                <span>
                  Date: <strong>{new Date().toLocaleDateString()}</strong>
                </span>
              </div>

              {currentPlan ? (
                <div className="billing-success-plan">
                  <div>
                    <p className="billing-success-plan-name">{currentPlan.displayName}</p>
                    <p className="billing-success-plan-status">{currentPlan.status.replace('_', ' ')}</p>
                  </div>
                  <div className="billing-success-plan-price">
                    {currentPlanPrice ?? 'Active'}
                  </div>
                </div>
              ) : null}

              <div className="relative flex flex-wrap items-start justify-between gap-4">
                <div>
                  {currentPlan ? (
                    <p className="billing-success-period">
                      Current period ends {new Date(currentPlan.periodEnd).toLocaleDateString()}
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <Link href="/usage" className="btn-secondary">
                    View usage
                  </Link>
                  <Link href="/projects" className="btn-primary">
                    Open projects
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </SectionCard>
      ) : null}

      {checkoutProcessing ? (
        <SectionCard title="Payment Processing" subtitle="Dodo Payments is still confirming the transaction.">
          <div className="panel-muted p-4">
            <p className="text-sm text-slate-700">
              We received the checkout return and started syncing your subscription. Refresh this page in a moment if
              the updated plan does not appear immediately.
            </p>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Subscription"
        subtitle="Manage plan upgrades, renewals, and invoice lifecycle."
        actions={(
          <button
            type="button"
            className="btn-secondary inline-flex items-center gap-2"
            onClick={() => setIsCalculatorOpen(true)}
          >
            <span aria-hidden="true">+</span>
            <span>Plan calculator</span>
          </button>
        )}
      >
        <div className="grid gap-3">
          {loading ? (
            <div className="panel-muted p-3">
              <SkeletonBlock className="h-3 w-32 rounded" />
              <SkeletonBlock className="mt-2 h-7 w-72 rounded-lg" />
              <SkeletonBlock className="mt-2 h-3 w-44 rounded" />
            </div>
          ) : (
            <div className="panel-muted p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Current subscription</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {currentPlan ? `${currentPlan.displayName} (${currentPlan.status})` : 'No active subscription'}
              </p>
              {currentPlan ? (
                <p className="text-xs text-slate-600">
                  Current period ends {new Date(currentPlan.periodEnd).toLocaleDateString()}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Plan Catalog" subtitle="Official Apployd pricing tiers with transparent limits.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {planCatalog.map((catalogPlan) => {
            const apiPlan = availablePlansByCode.get(catalogPlan.code);
            const isCurrent = currentPlanCode === catalogPlan.code;
            const canCheckout =
              !!apiPlan
              && apiPlan.checkoutEnabled !== false
              && catalogPlan.code !== 'free'
              && catalogPlan.code !== 'enterprise';
            const unavailableInWorkspace =
              catalogPlan.code !== 'enterprise'
              && catalogPlan.code !== 'free'
              && (!apiPlan || apiPlan.checkoutEnabled === false);
            const selectedAddonTier = databaseAddonSelectionByPlan[catalogPlan.code] ?? 'hobby';
            const selectedAddon = databaseAddonCatalog.find((tier) => tier.code === selectedAddonTier) ?? null;
            const showAddonSelector = canCheckout && availableDatabaseAddonOptions.length > 0;

            return (
              <article
                key={catalogPlan.code}
                id={`plan-card-${catalogPlan.code}`}
                className={`rounded-xl border p-4 ${
                  isCurrent
                    ? 'border-slate-900 bg-slate-50'
                    : catalogPlan.popular
                    ? 'border-blue-400/70'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">{catalogPlan.name}</p>
                  {catalogPlan.popular ? (
                    <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white">
                      Popular
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{catalogPlan.price}</p>
                <p className="mt-1 text-xs text-slate-600">Best for: {catalogPlan.bestFor}</p>

                <div className="mt-3 space-y-1 text-xs text-slate-700">
                  <p>Projects: {catalogPlan.projects}</p>
                  <p>RAM: {catalogPlan.ram}</p>
                  <p>vCPU: {catalogPlan.cpu}</p>
                  <p>Storage: {catalogPlan.storage}</p>
                  <p>Bandwidth: {catalogPlan.bandwidth}</p>
                  <p>Sleep Mode: {catalogPlan.sleepMode}</p>
                  <p>Preview Environments: {catalogPlan.previewEnvironments}</p>
                  <p>Auto Deploy: {catalogPlan.autoDeploy}</p>
                  <p>Custom Domain: {catalogPlan.customDomain}</p>
                  <p>SSL: {catalogPlan.ssl}</p>
                  <p>Backups: {catalogPlan.backupPolicy}</p>
                  <p>Log Retention: {catalogPlan.logRetention}</p>
                  <p>Analytics: {catalogPlan.analytics}</p>
                  <p>Support: {catalogPlan.support}</p>
                </div>

                {isCurrent ? (
                  <p className="mt-3 inline-block rounded-lg border border-slate-900 px-2 py-1 text-xs font-semibold text-slate-900">
                    Current plan
                  </p>
                ) : catalogPlan.code === 'enterprise' ? (
                  <a href="/contact" className="btn-secondary mt-4 inline-flex w-full justify-center">
                    Contact Sales
                  </a>
                ) : canCheckout ? (
                  <>
                    {showAddonSelector ? (
                      <div className="mt-4 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                            Database add-on
                          </p>
                          <span className="text-[11px] text-slate-500">
                            Choose database tier
                          </span>
                        </div>
                        <select
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                          value={selectedAddonTier}
                          onChange={(event) => {
                            const nextSelection = event.target.value as DatabaseAddonSelection;
                            setDatabaseAddonSelectionByPlan((current) => ({
                              ...current,
                              [catalogPlan.code]: nextSelection,
                            }));
                          }}
                          disabled={redirectingToCheckout}
                        >
                          {availableDatabaseAddonOptions.map((tier) => (
                            <option key={tier.code} value={tier.code}>
                              {formatDatabaseAddonOptionLabel(tier)}
                            </option>
                          ))}
                        </select>
                        {selectedAddon ? (
                          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                                {selectedAddon.name} database
                              </p>
                              <span className="text-[11px] text-slate-600">{selectedAddon.price}</span>
                            </div>
                            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                              <div>
                                <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500">Storage</p>
                                <p className="mt-1 font-semibold text-slate-900">{selectedAddon.storage}</p>
                              </div>
                              <div>
                                <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500">vCPU-min</p>
                                <p className="mt-1 font-semibold text-slate-900">{selectedAddon.compute}</p>
                              </div>
                              <div>
                                <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500">RAM</p>
                                <p className="mt-1 font-semibold text-slate-900">{selectedAddon.ram}</p>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <button
                      className="btn-primary mt-4 w-full disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => startUpgrade(apiPlan.code, selectedAddonTier === 'hobby' ? null : selectedAddonTier)}
                      disabled={redirectingToCheckout}
                    >
                      {redirectingToCheckout && redirectingPlanCode === apiPlan.code
                        ? 'Redirecting...'
                        : `Choose ${catalogPlan.name}`}
                    </button>
                  </>
                ) : catalogPlan.code === 'free' ? (
                  <p className="mt-3 text-xs text-slate-500">Free plan available by default for new organizations.</p>
                ) : unavailableInWorkspace ? (
                  <p className="mt-3 text-xs text-slate-500">
                    This plan is not available in your current billing configuration.
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Add-ons and Overage" subtitle="Optional services and guardrails for predictable spend.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <article className="panel-muted p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Backup Pro</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">$5 / project / month</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-700">
              <li>Hourly backups</li>
              <li>60-90 day retention</li>
              <li>One-click restore</li>
              <li>Cross-region copy</li>
              <li>Encrypted storage</li>
            </ul>
          </article>

          <article className="panel-muted p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Bandwidth Overage</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">$0.05 / GB</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-700">
              <li>Auto-charge cap: $5/month default</li>
              <li>Warning level at 80% usage</li>
              <li>Throttle after cap enabled</li>
              <li>Hard suspend only for abuse</li>
            </ul>
          </article>

          <article className="panel-muted p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Managed Dedicated Servers</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">Optional managed infrastructure</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-700">
              <li>Managed AX41: EUR 52 / month</li>
              <li>Managed EX44: EUR 65 / month</li>
              <li>Setup fee: EUR 100 one-time</li>
              <li>Minimum term: 3 months</li>
            </ul>
          </article>
        </div>
      </SectionCard>

      <SectionCard title="Invoices" subtitle="Latest invoice history synced from billing webhook events.">
        {loading && !invoices.length ? (
          <div className="space-y-2">
            {[0, 1, 2].map((placeholder) => (
              <article key={placeholder} className="panel-muted p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-2">
                    <SkeletonBlock className="h-4 w-56 rounded" />
                    <SkeletonBlock className="h-3 w-44 rounded" />
                  </div>
                  <SkeletonBlock className="h-9 w-24 rounded-xl" />
                </div>
              </article>
            ))}
          </div>
        ) : invoices.length ? (
          <div className="space-y-2">
            {invoices.map((invoice) => (
              <article key={invoice.id} className="panel-muted p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Due ${invoice.amountDueUsd} | Paid ${invoice.amountPaidUsd}
                    </p>
                    <p className="text-xs text-slate-600">
                      {invoice.status} | {new Date(invoice.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {invoice.hostedInvoiceUrl ? (
                    <a
                      href={invoice.hostedInvoiceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary"
                    >
                      Open invoice
                    </a>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-600">No invoices yet.</p>
        )}
      </SectionCard>
      {isCalculatorOpen ? (
        <div className="fixed inset-0 z-[75] overflow-y-auto bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
          <div className="mx-auto w-full max-w-5xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Plan calculator</p>
                <h3 className="mt-1 text-2xl font-semibold text-slate-900">Find the right plan before checkout</h3>
                <p className="mt-1 max-w-2xl text-sm text-slate-600">
                  Estimate your workload, compare the fit, and we will suggest both the subscription tier and the
                  database add-on size.
                </p>
              </div>
              <button type="button" className="btn-secondary" onClick={() => setIsCalculatorOpen(false)}>
                Close
              </button>
            </div>

            <div className="grid gap-5 px-5 py-5 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Active projects</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={calculatorState.projects}
                    onChange={(event) => updateCalculatorNumber('projects')(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                  />
                  <span className="block text-xs text-slate-500">How many apps or APIs do you expect to keep live?</span>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Monthly traffic (GB)</span>
                  <input
                    type="number"
                    min={0}
                    step={5}
                    value={calculatorState.monthlyTrafficGb}
                    onChange={(event) => updateCalculatorNumber('monthlyTrafficGb')(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                  />
                  <span className="block text-xs text-slate-500">Use expected bandwidth or CDN egress across your apps.</span>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">App storage (GB)</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={calculatorState.appStorageGb}
                    onChange={(event) => updateCalculatorNumber('appStorageGb')(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                  />
                  <span className="block text-xs text-slate-500">Persistent storage needed for builds, assets, and deploy output.</span>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Peak RAM per app (MB)</span>
                  <input
                    type="number"
                    min={128}
                    step={128}
                    value={calculatorState.peakRamMb}
                    onChange={(event) => updateCalculatorNumber('peakRamMb')(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                  />
                  <span className="block text-xs text-slate-500">Estimate the biggest service or API process you need to run.</span>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Database storage (GB)</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={calculatorState.databaseStorageGb}
                    onChange={(event) => updateCalculatorNumber('databaseStorageGb')(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                  />
                  <span className="block text-xs text-slate-500">How much Postgres data do you expect to keep in the managed database?</span>
                </label>

                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Workflow needs</p>
                  <label className="flex items-start gap-3 rounded-lg bg-white px-3 py-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={calculatorState.needPreviewEnvironments}
                      onChange={(event) => {
                        setCalculatorState((current) => ({
                          ...current,
                          needPreviewEnvironments: event.target.checked,
                        }));
                      }}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                    />
                    <span>
                      <strong className="block text-slate-900">Preview environments</strong>
                      Enable this if you need preview URLs for review and QA before merge.
                    </span>
                  </label>
                  <label className="flex items-start gap-3 rounded-lg bg-white px-3 py-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={calculatorState.needPrioritySupport}
                      onChange={(event) => {
                        setCalculatorState((current) => ({
                          ...current,
                          needPrioritySupport: event.target.checked,
                        }));
                      }}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                    />
                    <span>
                      <strong className="block text-slate-900">Priority support</strong>
                      Turn this on if the workload is customer-facing and needs faster response when something breaks.
                    </span>
                  </label>
                </div>
              </div>

              <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Recommendation</p>
                <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-slate-500">Best-fit subscription</p>
                      <p className="mt-1 text-2xl font-semibold text-slate-900">{calculatorRecommendation.plan.name}</p>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-700">
                      {calculatorRecommendation.plan.price}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="uppercase tracking-[0.08em] text-slate-500">Projects</p>
                      <p className="mt-1 font-semibold text-slate-900">
                        {Number.isFinite(calculatorRecommendation.plan.maxProjects)
                          ? calculatorRecommendation.plan.maxProjects
                          : 'Custom'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="uppercase tracking-[0.08em] text-slate-500">Traffic</p>
                      <p className="mt-1 font-semibold text-slate-900">
                        {Number.isFinite(calculatorRecommendation.plan.maxBandwidthGb)
                          ? `${calculatorRecommendation.plan.maxBandwidthGb} GB`
                          : 'Custom'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="uppercase tracking-[0.08em] text-slate-500">Storage</p>
                      <p className="mt-1 font-semibold text-slate-900">
                        {Number.isFinite(calculatorRecommendation.plan.maxStorageGb)
                          ? `${calculatorRecommendation.plan.maxStorageGb} GB`
                          : 'Custom'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="uppercase tracking-[0.08em] text-slate-500">RAM/app</p>
                      <p className="mt-1 font-semibold text-slate-900">
                        {Number.isFinite(calculatorRecommendation.plan.maxRamMb)
                          ? `${calculatorRecommendation.plan.maxRamMb} MB`
                          : 'Custom'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Suggested database add-on</p>
                        <p className="mt-1 text-sm text-slate-600">
                          {suggestedDatabaseAddon.name} · {suggestedDatabaseAddon.price}
                        </p>
                      </div>
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-600">
                        Database
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="uppercase tracking-[0.08em] text-slate-500">Storage</p>
                        <p className="mt-1 font-semibold text-slate-900">{suggestedDatabaseAddon.storage}</p>
                      </div>
                      <div>
                        <p className="uppercase tracking-[0.08em] text-slate-500">vCPU-min</p>
                        <p className="mt-1 font-semibold text-slate-900">{suggestedDatabaseAddon.compute}</p>
                      </div>
                      <div>
                        <p className="uppercase tracking-[0.08em] text-slate-500">RAM</p>
                        <p className="mt-1 font-semibold text-slate-900">{suggestedDatabaseAddon.ram}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Why this fits</p>
                    <ul className="mt-2 space-y-2 text-sm text-slate-700">
                      {calculatorRecommendation.reasons.map((reason) => (
                        <li key={reason} className="flex gap-2">
                          <span className="mt-0.5 text-slate-400">•</span>
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" className="btn-primary" onClick={applyCalculatorRecommendation}>
                    Show matching plan
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setCalculatorState(calculatorDefaults)}
                  >
                    Reset inputs
                  </button>
                </div>
              </aside>
            </div>
          </div>
        </div>
      ) : null}
      {redirectingToCheckout ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/45 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-xl">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
            <p className="text-sm font-semibold text-slate-900">Redirecting to Dodo Payments checkout</p>
            <p className="mt-1 text-xs text-slate-600">
              {redirectingPlanCode
                ? `Preparing ${redirectingPlanCode.toUpperCase()} plan checkout...`
                : 'Preparing secure checkout...'}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
