'use client';

interface Point {
  label: string;
  value: number;
}

interface ChartPoint {
  x: number;
  y: number;
  label: string;
  value: number;
}

const CHART_WIDTH = 640;
const CHART_HEIGHT = 220;
const CHART_PADDING = 28;

function clampToFinite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function buildChartGeometry(data: Point[]): {
  points: ChartPoint[];
  linePath: string;
  areaPath: string;
  maxValue: number;
} {
  const normalized = data.map((item) => ({ ...item, value: clampToFinite(item.value) }));
  const maxValue = Math.max(1, ...normalized.map((item) => item.value));
  const usableWidth = CHART_WIDTH - CHART_PADDING * 2;
  const usableHeight = CHART_HEIGHT - CHART_PADDING * 2;
  const xStep = normalized.length > 1 ? usableWidth / (normalized.length - 1) : 0;

  const points = normalized.map((item, index) => ({
    x: CHART_PADDING + index * xStep,
    y: CHART_HEIGHT - CHART_PADDING - (item.value / maxValue) * usableHeight,
    label: item.label,
    value: item.value,
  }));

  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const areaPath =
    firstPoint && lastPoint
      ? `${linePath} L ${lastPoint.x.toFixed(2)} ${(CHART_HEIGHT - CHART_PADDING).toFixed(2)} L ${firstPoint.x.toFixed(2)} ${(CHART_HEIGHT - CHART_PADDING).toFixed(2)} Z`
      : '';

  return { points, linePath, areaPath, maxValue };
}

export function UsageChart({ title, data }: { title: string; data: Point[] }) {
  const { points, linePath, areaPath, maxValue } = buildChartGeometry(data);
  const gradientId = `usage-fill-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  const tickValues = [0.25, 0.5, 0.75, 1].map((factor) => Math.round(maxValue * factor));

  return (
    <div className="h-56 w-full">
      <p className="mb-3 text-sm font-medium text-slate-700">{title}</p>
      <div className="h-[200px] w-full overflow-hidden rounded-xl border border-slate-200">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="h-full w-full"
          preserveAspectRatio="none"
          role="img"
          aria-label={`${title} chart`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0F766E" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#0F766E" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {tickValues.map((tickValue, tickIndex) => {
            const y = CHART_HEIGHT - CHART_PADDING - (tickValue / maxValue) * (CHART_HEIGHT - CHART_PADDING * 2);
            return (
              <g key={`tick-${tickIndex}`}>
                <line
                  x1={CHART_PADDING}
                  y1={y}
                  x2={CHART_WIDTH - CHART_PADDING}
                  y2={y}
                  stroke="#E2E8F0"
                  strokeDasharray="4 4"
                />
                <text x={6} y={y + 4} fontSize="10" fill="#64748B">
                  {tickValue}
                </text>
              </g>
            );
          })}
          {points.length > 0 ? <path d={areaPath} fill={`url(#${gradientId})`} /> : null}
          {points.length > 0 ? (
            <path d={linePath} fill="none" stroke="#0F766E" strokeWidth="2.5" strokeLinecap="round" />
          ) : null}
          {points.map((point) => (
            <g key={`${point.label}-${point.x}`}>
              <circle cx={point.x} cy={point.y} r="2.5" fill="#0F766E" />
              <title>
                {point.label}: {point.value}
              </title>
            </g>
          ))}
          {points.map((point, index) => (
            <text
              key={`x-${point.label}-${point.x}`}
              x={point.x}
              y={CHART_HEIGHT - 8}
              fontSize="10"
              fill="#64748B"
              textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}
            >
              {point.label}
            </text>
          ))}
        </svg>
      </div>
      {data.length === 0 ? <p className="mt-2 text-xs text-slate-500">No usage has been recorded yet.</p> : null}
    </div>
  );
}
