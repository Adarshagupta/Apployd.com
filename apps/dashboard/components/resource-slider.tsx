'use client';

interface ResourceSliderProps {
  label: string;
  min: number;
  max: number;
  value: number;
  step?: number;
  unit: string;
  onChange: (next: number) => void;
}

export function ResourceSlider({ label, min, max, value, step = 1, unit, onChange }: ResourceSliderProps) {
  return (
    <label className="block space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-slate-800">{label}</span>
        <span className="mono text-slate-600">
          {value} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full border border-slate-300 bg-transparent accent-black"
      />
    </label>
  );
}
