import Link from 'next/link';

import { SectionCard } from '../../../components/section-card';

const quickHelpLinks = [
  {
    title: 'Deployment Troubleshooting',
    description: 'Diagnose build failures, runtime crashes, and missing environment variables.',
    href: '/docs',
  },
  {
    title: 'Usage and Billing Questions',
    description: 'Understand pooled resource metrics, limits, and subscription behavior.',
    href: '/billing',
  },
  {
    title: 'Security and Compliance',
    description: 'Review security posture, privacy terms, and compliance commitments.',
    href: '/legal/compliance',
  },
  {
    title: 'Contact Support',
    description: 'Reach the support team for account, billing, and technical incidents.',
    href: '/contact',
  },
] as const;

const faqs = [
  {
    question: 'Why is my deployment still queued?',
    answer:
      'Queued deployments usually indicate available runner capacity is temporarily exhausted or another deployment is in progress for the same project.',
  },
  {
    question: 'How do I connect GitHub for automatic deploys?',
    answer:
      'Open Integrations, connect your GitHub account, then select a repository and branch in the project deploy settings.',
  },
  {
    question: 'Where can I see live logs?',
    answer:
      'Use the Logs page for organization-wide events, or open a specific deployment to stream logs for that execution.',
  },
  {
    question: 'How do I change organization context?',
    answer:
      'Use the organization selector in Overview or Settings to switch workspace context before taking actions.',
  },
] as const;

const supportChannels = [
  { label: 'Support Email', value: 'support@apployd.dev' },
  { label: 'Security Reports', value: 'security@apployd.dev' },
  { label: 'Sales Inquiries', value: 'sales@apployd.dev' },
  { label: 'Response SLA', value: 'Within 24 hours (business days)' },
] as const;

export default function HelpPage() {
  return (
    <div className="space-y-4">
      <SectionCard title="Get Help Fast" subtitle="Support resources for day-to-day platform operations.">
        <div className="grid gap-3 md:grid-cols-2">
          {quickHelpLinks.map((item) => (
            <Link key={item.title} href={item.href} className="metric-card transition hover:bg-slate-50">
              <p className="text-sm font-semibold text-slate-900">{item.title}</p>
              <p className="mt-1 text-xs text-slate-600">{item.description}</p>
              <p className="mt-2 text-xs uppercase tracking-[0.12em] text-slate-500">Open</p>
            </Link>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Frequently Asked Questions" subtitle="Common platform questions from engineering teams.">
        <div className="space-y-3">
          {faqs.map((faq) => (
            <article key={faq.question} className="metric-card">
              <h3 className="text-sm font-semibold text-slate-900">{faq.question}</h3>
              <p className="mt-1 text-sm text-slate-700">{faq.answer}</p>
            </article>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Support Channels" subtitle="Direct contacts for account, technical, and compliance requests.">
        <div className="grid gap-3 sm:grid-cols-2">
          {supportChannels.map((channel) => (
            <article key={channel.label} className="metric-card">
              <p className="text-xs uppercase tracking-[0.12em] text-slate-500">{channel.label}</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{channel.value}</p>
            </article>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
