/** Tiny trend line for stat tiles: de-emphasised history, latest point in the accent. */
export function Sparkline({
  values,
  width = 72,
  height = 24,
  lowerIsBetter = false,
}: {
  values: number[];
  width?: number;
  height?: number;
  lowerIsBetter?: boolean;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => 3 + (i / (values.length - 1)) * (width - 6);
  // Invert for times so "up" always means better.
  const y = (v: number) => 3 + (lowerIsBetter ? (v - min) / span : 1 - (v - min) / span) * (height - 6);
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values.length - 1;
  return (
    <svg width={width} height={height} aria-hidden="true" className="block">
      <path d={d} fill="none" stroke="var(--faint)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last)} cy={y(values[last])} r={3} fill="var(--accent)" stroke="var(--surface)" strokeWidth={1.5} />
    </svg>
  );
}
