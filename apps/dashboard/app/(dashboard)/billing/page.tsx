'use client';

import { useEffect, useState } from 'react';

import { SectionCard } from '../../../components/section-card';
import { apiClient } from '../../../lib/api';
import { useWorkspace } from '../../../lib/workspace';

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

export default function BillingPage() {
  const { organizations, selectedOrganizationId, setSelectedOrganizationId } = useWorkspace();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [currentPlan, setCurrentPlan] = useState<{
    code: string;
    status: string;
    periodEnd: string;
    displayName: string;
  } | null>(null);
  const [message, setMessage] = useState('');

  const load = async () => {
    try {
      const planData = await apiClient.get('/plans');
      setPlans(planData.plans ?? []);

      if (selectedOrganizationId) {
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
      setMessage('');
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  useEffect(() => {
    load().catch(() => undefined);
  }, [selectedOrganizationId]);

  const startUpgrade = async (planCode: string) => {
    if (!selectedOrganizationId) {
      setMessage('Organization required');
      return;
    }

    try {
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
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Subscription" subtitle="Manage plan upgrades/downgrades and payment lifecycle.">
        <div className="grid gap-3 md:grid-cols-[320px_1fr]">
          <label>
            <span className="field-label">Organization</span>
            <select
              className="field-input"
              value={selectedOrganizationId}
              onChange={(event) => setSelectedOrganizationId(event.target.value)}
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
        </div>
      </SectionCard>

      <SectionCard title="Plans" subtitle="Choose a tier based on pool size and usage targets.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = currentPlan?.code === plan.code;
            return (
              <article
                key={plan.code}
                className={`rounded-xl border p-4 ${
                  isCurrent ? 'border-slate-900' : 'border-slate-200'
                }`}
              >
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">{plan.displayName}</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">${plan.priceUsdMonthly}</p>
                <p className="mt-2 text-xs text-slate-600">
                  {plan.includedRamMb} MB RAM | {plan.includedCpuMillicore} mCPU | {plan.includedBandwidthGb} GB
                </p>
                {isCurrent ? (
                  <p className="mt-3 inline-block rounded-lg border border-slate-900 px-2 py-1 text-xs font-semibold text-slate-900">
                    Current plan
                  </p>
                ) : plan.code === 'free' ? null : (
                  <button className="btn-primary mt-4 w-full" onClick={() => startUpgrade(plan.code)}>
                    Choose {plan.displayName}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Invoices" subtitle="Latest invoice history synced from Stripe webhook events.">
        {invoices.length ? (
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
    </div>
  );
}
