interface StatusBadgeProps {
  value: string | number | boolean | null | undefined;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'vip';
}

export function StatusBadge({ value, tone = 'neutral' }: StatusBadgeProps) {
  return <span className={`badge badge-${tone}`}>{String(value ?? '—')}</span>;
}
