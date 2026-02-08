import type { ReactNode } from 'react';

export function SectionCard({ title, children, subtitle }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="section-band">
      <div className="mb-5">
        <h2 className="title-gradient text-lg font-semibold">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-slate-700">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}
