/**
 * Shared presentation shell for dashboard cards: title + optional subtitle,
 * plus matching loading-skeleton and empty-state helpers so every chart
 * component (weekly playtime, habit completion, wellness trend, playtime vs.
 * mood) looks consistent. No data fetching or business logic lives here.
 */
export function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-border bg-card rounded-lg border p-4">
      <p className="text-sm font-semibold">{title}</p>
      {subtitle && <p className="text-muted-foreground text-xs">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

export function ChartSkeleton({ height = 220 }: { height?: number }) {
  return (
    <div className="bg-muted w-full animate-pulse rounded" style={{ height }} />
  );
}

export function ChartEmptyState({
  message,
  height = 220,
}: {
  message: string;
  height?: number;
}) {
  return (
    <div
      className="text-muted-foreground flex items-center justify-center px-4 text-center text-sm"
      style={{ height }}
    >
      {message}
    </div>
  );
}
