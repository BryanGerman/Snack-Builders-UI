export function Spinner({ label = 'Working...' }: { label?: string }) {
  return <span className="spinner" aria-label={label} title={label} />;
}
