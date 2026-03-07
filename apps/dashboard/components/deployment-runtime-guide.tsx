import { getDeploymentRuntimeGuide } from '../lib/deployment-runtime-guides';

export function DeploymentRuntimeGuide({ serviceType }: { serviceType?: string | null }) {
  const guide = getDeploymentRuntimeGuide(serviceType);
  const fieldRows = [
    { label: 'Root directory', value: guide.fields.rootDirectory },
    { label: 'Build command', value: guide.fields.buildCommand },
    guide.fields.startCommand
      ? { label: 'Start command', value: guide.fields.startCommand }
      : { label: 'Output directory', value: guide.fields.outputDirectory ?? 'dist' },
    { label: 'Port', value: guide.fields.port },
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Before deployment
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{guide.title}</p>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">{guide.summary}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {fieldRows.map((row) => (
          <div key={row.label} className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {row.label}
            </p>
            <code className="mt-2 block break-all text-[11px] text-slate-800">{row.value}</code>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {guide.details.map((detail) => (
          <div key={detail.title} className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs font-semibold text-slate-900">{detail.title}</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">{detail.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
