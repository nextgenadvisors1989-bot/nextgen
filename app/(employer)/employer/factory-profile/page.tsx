import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** The factory profile now lives on the one Company & Factory Profile page. */
export default function EmployerFactoryProfileRedirect() {
  redirect('/employer/profile?tab=factory');
}
