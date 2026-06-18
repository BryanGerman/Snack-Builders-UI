import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { JsonBlock } from '../../components/JsonBlock';
import { StatusBadge } from '../../components/StatusBadge';
import { dateTime } from '../../lib/format';
import type { ApiLogEntry } from '../../types/domain';

interface ApiLogPanelProps {
  entries: ApiLogEntry[];
  onClear: () => void;
}

export function ApiLogPanel({ entries, onClear }: ApiLogPanelProps) {
  return (
    <Card title="Request / Response Log" subtitle="Every API call made by the UI is captured here." actions={<Button variant="ghost" onClick={onClear}>Clear</Button>}>
      {entries.length === 0 ? (
        <div className="empty-state"><strong>No API calls yet.</strong><span>Run a smoke test or use a panel.</span></div>
      ) : (
        <div className="log-list">
          {entries.map((entry) => (
            <details key={entry.id} className="log-entry">
              <summary>
                <span className="mono">{entry.method}</span>
                <span className="mono">{entry.path}</span>
                <StatusBadge value={entry.status ?? (entry.ok ? 'OK' : 'ERR')} tone={entry.ok ? 'success' : 'danger'} />
                <span>{entry.durationMs}ms</span>
                <span>{dateTime(entry.at)}</span>
              </summary>
              <div className="grid grid-2">
                <div>
                  <h4>Request</h4>
                  <JsonBlock value={entry.requestBody ?? null} />
                </div>
                <div>
                  <h4>Response</h4>
                  <JsonBlock value={entry.responseBody ?? entry.error ?? null} />
                </div>
              </div>
            </details>
          ))}
        </div>
      )}
    </Card>
  );
}
