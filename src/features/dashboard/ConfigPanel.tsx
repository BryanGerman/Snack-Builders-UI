import { useMemo, useState } from 'react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Field, TextArea, TextInput } from '../../components/FormField';
import { JsonBlock } from '../../components/JsonBlock';
import { createDemoAdminJwt, decodeJwtPayload } from '../../lib/jwt';

interface ConfigPanelProps {
  apiBaseUrl: string;
  token: string;
  jwtSecret: string;
  onApiBaseUrlChange: (value: string) => void;
  onTokenChange: (value: string) => void;
  onJwtSecretChange: (value: string) => void;
}

export function ConfigPanel({
  apiBaseUrl,
  token,
  jwtSecret,
  onApiBaseUrlChange,
  onTokenChange,
  onJwtSecretChange,
}: ConfigPanelProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const payload = useMemo(() => decodeJwtPayload(token), [token]);

  async function generateToken() {
    setIsGenerating(true);
    try {
      const jwt = await createDemoAdminJwt(jwtSecret);
      onTokenChange(jwt);
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <Card
      title="Connection & Auth"
      subtitle="Set your API Gateway URL or use the Vite /api proxy. Generate the demo admin JWT used by the backend."
      actions={
        <Button onClick={generateToken} disabled={isGenerating}>
          {isGenerating ? 'Generating...' : 'Generate admin JWT'}
        </Button>
      }
    >
      <div className="grid grid-2">
        <Field label="Base URL" hint="Recommended local value: /api">
          <TextInput value={apiBaseUrl} onChange={(event) => onApiBaseUrlChange(event.target.value)} />
        </Field>
        <Field label="Demo JWT Secret" hint="Must match the service auth.py secret in dev.">
          <TextInput value={jwtSecret} onChange={(event) => onJwtSecretChange(event.target.value)} />
        </Field>
      </div>

      <Field label="Bearer Token">
        <TextArea rows={4} value={token} onChange={(event) => onTokenChange(event.target.value)} />
      </Field>

      <details className="details-panel">
        <summary>Decoded JWT payload</summary>
        <JsonBlock value={payload ?? { message: 'No valid JWT payload yet.' }} maxHeight={220} />
      </details>
    </Card>
  );
}
