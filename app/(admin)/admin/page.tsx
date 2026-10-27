import { redirect } from 'next/navigation';

/** /admin always lands on the dashboard. */
export default function AdminIndexPage() {
  redirect('/admin/dashboard');
}
