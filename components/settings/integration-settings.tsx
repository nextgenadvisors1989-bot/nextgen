'use client';

/**
 * Email / SMS / WhatsApp settings.
 *
 * The credentials form (from the shared settings engine) sits above the live
 * provider status, the "send a test" panel and the channel's delivery log. The
 * test sends a real message through the configured transport — and when the
 * platform has no credentials yet it says so plainly instead of pretending:
 * the message is rendered, logged as simulated and reported as such.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';
import { DeliveryLogTable } from '@/components/settings/delivery-log-table';
import { SettingsForm, type ResolvedValue, type SettingSection } from '@/components/settings/settings-form';

interface IntegrationState {
  configured: boolean;
  enabled: boolean;
  detail: string;
}

interface TestResult {
  ok: boolean;
  provider: string;
  simulated: boolean;
  message: string;
  to: string;
  segments?: number;
  logId: number;
}

export function IntegrationSettings({
  channel,
  label,
  sections,
  initial,
  canEdit,
  integrations,
  templatesUsed,
}: {
  channel: 'email' | 'sms' | 'whatsapp';
  label: string;
  sections: SettingSection[];
  initial: Record<string, ResolvedValue>;
  canEdit: boolean;
  integrations: { email: IntegrationState; sms: IntegrationState; whatsapp: IntegrationState };
  templatesUsed: number;
}) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const state = integrations[channel];

  const [to, setTo] = useState('');
  const [message, setMessage] = useState(
    channel === 'email'
      ? ''
      : `ComplianceOS test message. If you received this, ${channel === 'sms' ? 'SMS' : 'WhatsApp'} delivery is working.`
  );
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  async function sendTest() {
    setSending(true);
    setResult(null);
    try {
      const endpoint = `/api/admin/settings/test/${channel}`;
      const payload: Record<string, string> = {};
      if (to.trim()) payload.to = to.trim();
      if (message.trim() && channel !== 'email') payload.message = message.trim();

      const response = await api.post<TestResult>(endpoint, payload);
      if (!response.ok) {
        // A delivery failure returns the provider's own words — show them.
        const data = (response as unknown as { raw?: { message?: string } }).raw;
        setResult({
          ok: false,
          provider: '—',
          simulated: false,
          message: data?.message ?? response.message,
          to: to || 'the signed-in administrator',
          logId: 0,
        });
        errorToast(response.message);
        return;
      }
      setResult(response.data as TestResult);
      success(response.message);
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  const sidebar = (
    <>
      <Card>
        <CardBody className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-ink">Live status</h3>
            <Badge tone={state.configured ? 'success' : 'warning'} dot>
              {state.configured ? 'Configured' : 'Not configured'}
            </Badge>
          </div>
          <dl className="space-y-3 text-[13px]">
            <div>
              <dt className="text-ink-muted">Transport</dt>
              <dd className="text-ink">{state.detail}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Master switch</dt>
              <dd className="text-ink">{state.enabled ? 'Enabled' : 'Disabled — nothing will be sent'}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Templates on this channel</dt>
              <dd className="text-ink">{templatesUsed}</dd>
            </div>
          </dl>
          {!state.configured && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              Without credentials the platform still records every attempt, marked <strong>simulated</strong>, so the
              delivery log shows what would have gone out.
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-ink">Send a test</h3>
            <p className="mt-1 text-[12px] text-ink-muted">
              Sends a real message through the saved credentials and reports what the provider said.
            </p>
          </div>

          {channel === 'email' ? (
            <Input
              label="Send to" type="email" value={to} placeholder="Leave blank to send it to yourself"
              onChange={(event) => setTo(event.target.value)}
              helper={`Defaults to your own address when left blank.`}
            />
          ) : (
            <>
              <Input
                label="Mobile number" required value={to} placeholder="+91 98765 43210"
                onChange={(event) => setTo(event.target.value)}
              />
              <Textarea
                label="Message" rows={3} value={message} maxLength={600}
                onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setMessage(event.target.value)}
                helper={channel === 'sms' ? '160 characters per segment; 70 for Tamil or any non-Latin script.' : undefined}
              />
            </>
          )}

          <Button onClick={sendTest} loading={sending} disabled={!canEdit || (channel !== 'email' && !to.trim())} fullWidth>
            Send test {channel === 'email' ? 'email' : channel.toUpperCase()}
          </Button>

          {result && (
            <div className={`rounded-lg border px-3 py-2 text-[12px] ${
              result.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'
            }`}>
              <p className="font-medium">{result.ok ? 'Accepted' : 'Failed'}</p>
              <p className="mt-0.5">{result.message}</p>
              {result.ok && (
                <p className="mt-0.5 opacity-80">
                  Provider: {result.provider}
                  {result.segments ? ` · ${result.segments} segment(s)` : ''} · log #{result.logId}
                </p>
              )}
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );

  return (
    <div className="space-y-6">
      <SettingsForm
        group={channel}
        label={label}
        sections={sections}
        initial={initial}
        canEdit={canEdit}
        note={`Saving rebuilds the ${label.toLowerCase()} transport immediately — the next message uses the new credentials.`}
        sidebar={sidebar}
      />

      <div>
        <h2 className="section-title mb-2">Delivery log</h2>
        <p className="mb-4 text-[13px] text-ink-muted">
          Every {label.toLowerCase()} the platform attempted, with the provider's response. This is the first place to
          look when a user says a message never arrived.
        </p>
        <DeliveryLogTable channel={channel} />
      </div>
    </div>
  );
}
