'use client';

/**
 * Create-login screen.
 *
 * Wraps the form so the generated credentials can be shown exactly once, the
 * moment the account exists: username, temporary password, the activation link
 * that went out by email, and a copy-to-clipboard handover panel. Once the
 * administrator leaves the page the password is unrecoverable by design.
 */
import { useState } from 'react';
import Link from 'next/link';
import { Card, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button, LinkButton } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { UserForm, type ProvisionResult } from '@/components/users/user-form';

export function UserCreateScreen({
  roleOptions,
  linkOptions,
}: {
  roleOptions: { value: string; label: string; description?: string }[];
  linkOptions: {
    employers: { id: number; label: string }[];
    auditors: { id: number; label: string }[];
    employees: { id: number; label: string }[];
  };
}) {
  const { success } = useToast();
  const [provisioned, setProvisioned] = useState<ProvisionResult | null>(null);

  function copy(value: string, label: string) {
    navigator.clipboard?.writeText(value).then(
      () => success(`${label} copied`),
      () => success('Select the text and copy it manually')
    );
  }

  if (provisioned) {
    return (
      <div className="space-y-5">
        <Card>
          <CardBody className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="section-title">Login created</h2>
              <Badge tone="success">Active</Badge>
              {provisioned.activation.sent && <Badge tone="info">Credentials emailed</Badge>}
            </div>
            <p className="text-sm text-ink-soft">
              {provisioned.name} can sign in as soon as they set a password. The temporary password below is shown
              once — {provisioned.activation.emailed
                ? 'it has also gone out by email with a 72-hour activation link.'
                : 'no email went out, so hand it over securely.'}
            </p>

            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-line p-3">
                <dt className="text-[12px] uppercase tracking-wide text-ink-muted">Email</dt>
                <dd className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-sm text-ink">{provisioned.email}</span>
                  <Button size="sm" variant="ghost" onClick={() => copy(provisioned.email, 'Email')}>Copy</Button>
                </dd>
              </div>
              <div className="rounded-lg border border-line p-3">
                <dt className="text-[12px] uppercase tracking-wide text-ink-muted">Username</dt>
                <dd className="mt-1 flex items-center justify-between gap-2">
                  <span className="font-mono text-sm text-ink">{provisioned.credentials.username}</span>
                  <Button size="sm" variant="ghost" onClick={() => copy(provisioned.credentials.username, 'Username')}>Copy</Button>
                </dd>
              </div>
              <div className="rounded-lg border border-line p-3 sm:col-span-2">
                <dt className="text-[12px] uppercase tracking-wide text-ink-muted">Temporary password</dt>
                <dd className="mt-1 flex items-center justify-between gap-2">
                  <span className="font-mono text-sm text-ink">{provisioned.credentials.temporaryPassword}</span>
                  <Button size="sm" variant="ghost" onClick={() => copy(provisioned.credentials.temporaryPassword, 'Password')}>Copy</Button>
                </dd>
              </div>
              <div className="rounded-lg border border-line p-3 sm:col-span-2">
                <dt className="text-[12px] uppercase tracking-wide text-ink-muted">Roles</dt>
                <dd className="mt-1 text-sm text-ink">{provisioned.roleNames}</dd>
                {provisioned.linked.length > 0 && (
                  <dd className="mt-1 text-[12px] text-ink-muted">Linked to {provisioned.linked.join(', ')}</dd>
                )}
              </div>
            </dl>

            <div className="flex flex-wrap items-center gap-2">
              <LinkButton href={`/admin/users/${provisioned.userId}`} size="sm">Open the account</LinkButton>
              <Button size="sm" variant="outline" onClick={() => setProvisioned(null)}>Create another login</Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  copy(
                    `Username: ${provisioned.credentials.username}\nTemporary password: ${provisioned.credentials.temporaryPassword}\nSign in at ${window.location.origin}/login`,
                    'Credentials'
                  )
                }
              >
                Copy all credentials
              </Button>
              <Link href="/admin/users" className="ml-auto text-[13px] text-brand-600 hover:underline">
                Back to the register
              </Link>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <UserForm
      mode="create"
      roleOptions={roleOptions}
      linkOptions={linkOptions}
      onProvisioned={setProvisioned}
    />
  );
}
