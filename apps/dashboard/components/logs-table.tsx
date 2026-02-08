'use client';

interface LogRow {
  timestamp: string;
  level: string;
  message: string;
  source: string;
}

export function LogsTable({ rows }: { rows: LogRow[] }) {
  return (
    <div className="overflow-auto rounded-xl border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="text-left text-slate-600">
          <tr>
            <th className="px-3 py-2">Timestamp</th>
            <th className="px-3 py-2">Level</th>
            <th className="px-3 py-2">Source</th>
            <th className="px-3 py-2">Message</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <tr key={`${row.timestamp}-${row.source}-${index}`}>
              <td className="whitespace-nowrap px-3 py-2 font-[var(--font-mono)] text-xs text-slate-500">{row.timestamp}</td>
              <td className="px-3 py-2 uppercase text-slate-700">{row.level}</td>
              <td className="px-3 py-2 text-slate-700">{row.source}</td>
              <td className="px-3 py-2 text-slate-800">{row.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
