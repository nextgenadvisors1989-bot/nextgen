'use client';

import Link from 'next/link';
import { Card, CardHeader } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils/dates';
import { ComplianceActivity, ComplianceBadge, DetailRow, Prose } from '@/components/compliance/shared';

export function NotificationDetail({ notification, canUpdate }: {
  notification: Record<string, unknown> & {
    id: number; notification_number: string; title: string; notification_date: string | null;
    issuing_authority: string | null; act_id: number | null; act_name?: string | null;
    gazette_reference: string | null; subject: string | null; body: string | null;
    effective_date: string | null; applicability: string | null; action_required: string | null;
    status: string; created_at: string;
  };
  canUpdate: boolean;
}) {
  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">{notification.title}</h1>
              <ComplianceBadge value={notification.status} />
              {notification.action_required && <Badge tone="warning">Action required</Badge>}
            </div>
            <p className="mt-1 text-sm text-ink-muted">
              {[notification.notification_number, notification.issuing_authority, notification.gazette_reference]
                .filter(Boolean).join(' · ') || 'No gazette reference recorded'}
            </p>
          </div>
          {canUpdate && <LinkButton href={`/admin/compliance/notifications/${notification.id}/edit`} size="sm">Edit Notification</LinkButton>}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Subject" />
            <Prose>{notification.subject}</Prose>
          </Card>
          <Card>
            <CardHeader title="Notification text" />
            <Prose>{notification.body}</Prose>
          </Card>
          <Card>
            <CardHeader
              title="Action required"
              description="What establishments must now do, and by when."
            />
            <Prose>{notification.action_required}</Prose>
          </Card>
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader title="Notification details" />
            <dl className="divide-y divide-line">
              <DetailRow label="Number">{notification.notification_number}</DetailRow>
              <DetailRow label="Dated">{notification.notification_date ? formatDate(notification.notification_date) : null}</DetailRow>
              <DetailRow label="Effective from">{notification.effective_date ? formatDate(notification.effective_date) : null}</DetailRow>
              <DetailRow label="Issued by">{notification.issuing_authority}</DetailRow>
              <DetailRow label="Gazette reference">{notification.gazette_reference}</DetailRow>
              <DetailRow label="Act">
                {notification.act_id
                  ? <Link href={`/admin/compliance/acts/${notification.act_id}`} className="text-brand-600 hover:underline">{notification.act_name}</Link>
                  : null}
              </DetailRow>
              <DetailRow label="Applies to">{notification.applicability}</DetailRow>
              <DetailRow label="Registered">{formatDate(notification.created_at)}</DetailRow>
            </dl>
          </Card>
          <Card>
            <ComplianceActivity entityType="compliance_notification" entityId={notification.id} title="Notification history" />
          </Card>
        </div>
      </div>
    </div>
  );
}
