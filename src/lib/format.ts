import type { PriorityLevel, SnackCategory } from '../types/domain';

export function money(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  if (Number.isNaN(n)) return String(value ?? '');
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export function dateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(d);
}

export function relativeMinutes(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value).getTime();
  if (Number.isNaN(d)) return value;
  const minutes = Math.round((d - Date.now()) / 60_000);
  if (minutes === 0) return 'now';
  if (minutes > 0) return `in ${minutes} min`;
  return `${Math.abs(minutes)} min ago`;
}

export function remainingFromKitchenTime(value: string | null | undefined, kitchenCurrentTime: string | null | undefined, zeroLabel = 'ready now'): string {
  if (!value) return '-';
  const target = new Date(value).getTime();
  const current = kitchenCurrentTime ? new Date(kitchenCurrentTime).getTime() : Date.now();
  if (Number.isNaN(target) || Number.isNaN(current)) return value;
  const seconds = Math.max(0, Math.ceil((target - current) / 1000));
  if (seconds === 0) return zeroLabel;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes === 0) return `${remainder}s remaining`;
  if (remainder === 0) return `${minutes}m remaining`;
  return `${minutes}m ${remainder}s remaining`;
}

export function remainingSeconds(value: number | null | undefined, zeroLabel = 'ready now'): string {
  if (value === null || value === undefined) return '-';
  const seconds = Math.max(0, Math.ceil(Number(value)));
  if (!Number.isFinite(seconds)) return String(value);
  if (seconds === 0) return zeroLabel;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes === 0) return `${remainder}s remaining`;
  if (remainder === 0) return `${minutes}m remaining`;
  return `${minutes}m ${remainder}s remaining`;
}

export function priorityLabel(priority: PriorityLevel): string {
  switch (priority) {
    case 1:
      return 'Tier 1 · VIP';
    case 2:
      return 'Tier 2 · App/Delivery';
    case 3:
      return 'Tier 3 · Walk-in';
    default:
      return String(priority);
  }
}

export function categoryLabel(category: SnackCategory): string {
  switch (category) {
    case 'cookies':
      return 'Cookies · 5 min';
    case 'pastries':
      return 'Pastries · 10 min';
    case 'breads':
      return 'Breads · 20 min';
    default:
      return category;
  }
}

export function compactJson(value: unknown): string {
  if (value === undefined) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function truncateMiddle(value: string, max = 18): string {
  if (value.length <= max) return value;
  const left = Math.ceil((max - 1) / 2);
  const right = Math.floor((max - 1) / 2);
  return `${value.slice(0, left)}…${value.slice(-right)}`;
}
