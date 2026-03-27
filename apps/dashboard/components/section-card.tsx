import type { ReactNode } from 'react';

export function SectionCard({
  title,
  children,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="section-band">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="title-gradient text-lg font-semibold">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-slate-700">{subtitle}</p> : null}
        </div>
        {actions ? <div className="sm:shrink-0">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
