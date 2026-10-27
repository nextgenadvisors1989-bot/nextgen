/**
 * One dispatcher for the billing API of both panels, so the path table lives in a single place.
 *
 *   admin    /api/admin/billing/...     every route below, each behind its own `billing.*` permission
 *   employer /api/employer/billing/...  quotations and invoices of the caller's own company, read-only, never a Draft
 *
 * Paths: lookups, summary, services[/:id], quotations[/:id][/status|/invoice], invoices[/:id][/issue|/cancel|/payments].
 */
import { requireAdminApi, requireEmployerApi } from '@/lib/auth/api-guards';
import { fail, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import * as billing from '@/services/billing.service';
import type { AuthUser } from '@/types/user';

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';
const idOf = (value: string | undefined) => { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; };

async function body(request: Request) {
  return request.json().catch(() => ({}));
}

export async function handleBilling(request: Request, segments: string[], method: Method, panel: 'admin' | 'employer'): Promise<Response> {
  const route = `/api/${panel}/billing/${segments.join('/')}`;
  try {
    const [resource, rawId, action] = segments;
    const id = idOf(rawId);
    const url = new URL(request.url);
    const filters = { status: url.searchParams.get('status'), search: url.searchParams.get('search') };

    if (panel === 'employer') {
      const user = await requireEmployerApi(['billing.read']);
      const scope = { employerId: Number(user.employerId ?? 0) || -1 };
      if (method !== 'GET') return fail('Billing documents are read-only for your company', 405);
      if (resource === 'quotations' && !rawId) return ok(await billing.listQuotations(filters, scope));
      if (resource === 'quotations' && id && !action) return ok({ data: await billing.getQuotation(id, scope) });
      if (resource === 'invoices' && !rawId) return ok(await billing.listInvoices(filters, scope));
      if (resource === 'invoices' && id && !action) return ok({ data: await billing.getInvoice(id, scope) });
      return notFound('Billing resource');
    }

    const permission = method === 'GET' ? 'billing.read' : method === 'DELETE' ? 'billing.delete' : method === 'POST' && !action && !id ? 'billing.create' : 'billing.update';
    const user: AuthUser = await requireAdminApi([permission]);
    const all = {};

    if (method === 'GET') {
      if (resource === 'lookups') return ok({ data: await billing.lookups() });
      if (resource === 'summary') return ok({ data: await billing.summary() });
      if (resource === 'services' && !rawId) return ok(await billing.listServices());
      if (resource === 'quotations' && !rawId) return ok(await billing.listQuotations(filters, all));
      if (resource === 'quotations' && id && !action) return ok({ data: await billing.getQuotation(id, all) });
      if (resource === 'invoices' && !rawId) return ok(await billing.listInvoices(filters, all));
      if (resource === 'invoices' && id && !action) return ok({ data: await billing.getInvoice(id, all) });
    } else if (method === 'POST') {
      const payload = await body(request);
      if (resource === 'services' && !rawId) return ok({ data: await billing.saveService(payload) }, { status: 201, message: 'Service added' });
      if (resource === 'quotations' && !rawId) return ok({ data: await billing.saveQuotation(payload, user.id) }, { status: 201, message: 'Quotation created' });
      if (resource === 'quotations' && id && action === 'status') return ok({ data: await billing.setQuotationStatus(id, payload) }, { message: 'Quotation updated' });
      if (resource === 'quotations' && id && action === 'invoice') return ok({ data: await billing.convertQuotation(id, user.id) }, { status: 201, message: 'Draft invoice created from the quotation' });
      if (resource === 'invoices' && !rawId) return ok({ data: await billing.saveInvoice(payload, user.id) }, { status: 201, message: 'Draft invoice created' });
      if (resource === 'invoices' && id && action === 'issue') return ok({ data: await billing.issueInvoice(id) }, { message: 'Invoice issued' });
      if (resource === 'invoices' && id && action === 'cancel') return ok({ data: await billing.cancelInvoice(id, payload) }, { message: 'Invoice cancelled' });
      if (resource === 'invoices' && id && action === 'payments') return ok({ data: await billing.recordPayment(id, payload, user.id) }, { status: 201, message: 'Payment recorded' });
    } else if (method === 'PUT') {
      const payload = await body(request);
      if (resource === 'services' && id) return ok({ data: await billing.saveService(payload, id) }, { message: 'Service updated' });
      if (resource === 'quotations' && id && !action) return ok({ data: await billing.saveQuotation(payload, user.id, id) }, { message: 'Quotation updated' });
      if (resource === 'invoices' && id && !action) return ok({ data: await billing.saveInvoice(payload, user.id, id) }, { message: 'Invoice updated' });
    } else if (method === 'DELETE') {
      if (resource === 'services' && id) { await billing.deleteService(id); return ok({ data: { id } }, { message: 'Service removed' }); }
      if (resource === 'quotations' && id) { await billing.deleteQuotation(id); return ok({ data: { id } }, { message: 'Quotation deleted' }); }
      if (resource === 'invoices' && id) { await billing.deleteInvoice(id); return ok({ data: { id } }, { message: 'Invoice deleted' }); }
    }
    return notFound('Billing resource');
  } catch (error) {
    return handleRouteError(error, { route, method });
  }
}
