'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

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
    autoDeploy: 'No',
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

function SkeletonBlock({ className }: { className: string }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}

export default function BillingPage() {
  const { selectedOrganizationId } = useWorkspaceContext();
  const searchParams = useSearchParams();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPlan, setCurrentPlan] = useState<{
    code: string;
    status: string;
    periodEnd: string;
    displayName: string;
  } | null>(null);
  const [message, setMessage] = useState('');
  const [redirectingToCheckout, setRedirectingToCheckout] = useState(false);
  const [redirectingPlanCode, setRedirectingPlanCode] = useState<string | null>(null);

  const availablePlansByCode = useMemo(() => {
    const map = new Map<string, Plan>();
    for (const plan of plans) {
      map.set(plan.code.toLowerCase(), plan);
    }
    return map;
  }, [plans]);

  const currentPlanCode = currentPlan?.code.toLowerCase() ?? null;
  const checkoutStatus = searchParams?.get('status');
  const checkoutSuccess = checkoutStatus === 'success';

  const load = async () => {
    setLoading(true);
    try {
      const planData = await apiClient.get('/plans');
      setPlans(planData.plans ?? []);

      if (selectedOrganizationId) {
        if (checkoutStatus === 'success') {
          await apiClient.post('/billing/sync-subscription', {
            organizationId: selectedOrganizationId,
          });
        }

        const currentData = await apiClient.get(`/plans/current?organizationId=${selectedOrganizationId}`);
        setCurrentPlan(
          currentData.subscription
            ? {
                code: currentData.subscription.plan.code,
                displayName: currentData.subscription.plan.displayName,
                status: currentData.subscription.status,
                periodEnd: currentData.subscription.currentPeriodEnd,
              }
            : null,
        );

        const invoiceData = await apiClient.get(`/billing/invoices?organizationId=${selectedOrganizationId}`);
        setInvoices(invoiceData.invoices ?? []);
      } else {
        setCurrentPlan(null);
        setInvoices([]);
      }
      if (checkoutStatus === 'cancelled') {
        setMessage('Checkout was cancelled.');
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
  }, [selectedOrganizationId, checkoutStatus]);

  const startUpgrade = async (planCode: string) => {
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
        successUrl: `${window.location.origin}/billing?status=success`,
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

  return (
    <div className="space-y-4">
      {checkoutSuccess ? (
        <SectionCard title="Purchase Complete" subtitle="Your billing upgrade is active and synced.">
          <div className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-amber-50 p-5">
            <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-emerald-200/40 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-10 -left-10 h-36 w-36 rounded-full bg-amber-200/40 blur-2xl" />
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">Billing updated</p>
                <p className="mt-1 text-xl font-semibold text-slate-900">
                  {currentPlan ? `${currentPlan.displayName} plan is now active.` : 'Your subscription is now active.'}
                </p>
                <p className="mt-2 text-sm text-slate-700">
                  Usage pools, feature limits, and project entitlements have been refreshed.
                </p>
                {currentPlan ? (
                  <p className="mt-2 text-xs text-slate-600">
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
        </SectionCard>
      ) : null}

      <SectionCard title="Subscription" subtitle="Manage plan upgrades, renewals, and invoice lifecycle.">
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
            const canCheckout = !!apiPlan && catalogPlan.code !== 'free' && catalogPlan.code !== 'enterprise';
            const unavailableInWorkspace = catalogPlan.code !== 'enterprise' && catalogPlan.code !== 'free' && !apiPlan;

            return (
              <article
                key={catalogPlan.code}
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
                  <button
                    className="btn-primary mt-4 w-full disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => startUpgrade(apiPlan.code)}
                    disabled={redirectingToCheckout}
                  >
                    {redirectingToCheckout && redirectingPlanCode === apiPlan.code
                      ? 'Redirecting...'
                      : `Choose ${catalogPlan.name}`}
                  </button>
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

      {message ? <p className="text-sm text-slate-700">{message}</p> : null}

      {redirectingToCheckout ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/45 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-xl">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
            <p className="text-sm font-semibold text-slate-900">Redirecting to Stripe checkout</p>
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
