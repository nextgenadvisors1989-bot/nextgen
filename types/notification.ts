export interface Notification {
  id: number;
  uuid: string;
  user_id: number;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'action_required';
  category: 'AUDIT' | 'REPORT' | 'PAYROLL' | 'COMPLIANCE' | 'EMPLOYEE' | 'EMPLOYER' | 'ACCOUNT' | 'SYSTEM' | 'REMINDER';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  action_url: string | null;
  action_label: string | null;
  entity_type: string | null;
  entity_id: number | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface NotificationTemplate {
  id: number;
  template_code: string;
  template_name: string;
  channel: 'email' | 'sms' | 'whatsapp' | 'in_app';
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  variables_json: string[] | null;
  locale: string;
  is_active: boolean;
}

export interface NotificationLog {
  id: number;
  notification_id: number | null;
  channel: 'email' | 'sms' | 'whatsapp' | 'in_app';
  template_code: string | null;
  recipient: string;
  subject: string | null;
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'bounced' | 'read';
  provider_message_id: string | null;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
}

export type NotificationCategory = Notification['category'];
export type NotificationChannel = 'in_app' | 'email' | 'sms' | 'whatsapp';
