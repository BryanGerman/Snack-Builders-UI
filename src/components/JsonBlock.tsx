import { compactJson } from '../lib/format';

export function JsonBlock({ value, maxHeight = 260 }: { value: unknown; maxHeight?: number }) {
  return (
    <pre className="json-block" style={{ maxHeight }}>
      {compactJson(value)}
    </pre>
  );
}
