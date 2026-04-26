export interface HeatmapProps {
  values: number[]; // 0..1
  cellSize?: number;
  gap?: number;
}

export function Heatmap({ values, gap = 3 }: HeatmapProps) {
  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: `repeat(${values.length}, minmax(0, 1fr))`,
        gap,
      }}
    >
      {values.map((v, i) => (
        <div
          key={i}
          style={{
            aspectRatio: '1 / 1',
            borderRadius: 3,
            border: '1px solid var(--color-pt-border)',
            background: `oklch(0.75 0.07 195 / ${Math.max(0.05, Math.min(1, v))})`,
          }}
        />
      ))}
    </div>
  );
}
