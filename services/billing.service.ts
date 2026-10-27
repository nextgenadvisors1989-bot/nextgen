/**
 * Quotations, GST tax invoices and payment receipts.
 *
 * Administrators run all of it. An employer (the client) reads only its own quotations and invoices, and never a Draft: `scope.employerId`
 * narrows every read. Money maths is in lib/billing/gst.ts; this file owns the rules about who may change what and when:
 *   quotation: Draft -> Sent -> Accepted / Rejected / Expired -> Invoiced (by converting). Editable until it is Accepted.
 *   invoice:   Draft (editable, deletable, no number yet) -> Issued (number given, figures locked) -> Part paid -> Paid; or Cancelled.
 * The invoice number is allocated at issue, so the series is gap-free as GST requires.
 */
import { randomUUID } from 'node:crypto';
import { execute, query, queryOne, transaction, type RowDataPacket } from '@/lib/db/mysql';
import { invoiceTotals, quotationTotals, round2, stateCodeOfGstin, supplyTypeFor } from '@/lib/billing/gst';
import { localToday } from '@/lib/utils/dates';
import { nextDocumentNumber } from '@/lib/utils/report-number';
import { DEFAULT_OBJECTIVE, DEFAULT_PAYMENT_TERMS, DEFAULT_QUOTATION_ELEMENTS, DEFAULT_QUOTATION_NOTES, DEFAULT_SUBJECT, DEFAULT_VALIDITY_DAYS } from '@/lib/billing/defaults';
import { cancelSchema, invoiceSchema, paymentSchema, quotationSchema, quotationStatusSchema, serviceSchema } from '@/lib/validations/billing.validation';

export interface BillingScope { employerId?: number | null }

interface Tx { execute: (sql: string, params?: unknown[]) => Promise<unknown> }
/** A transaction whose `execute` hands back the result header (insertId, affectedRows) directly. */
function withTransaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  return transaction((conn) => work({ execute: async (sql, params = []) => (await conn.execute(sql, params as never))[0] }));
}

function fail(message: string, code: string, extra: Record<string, unknown> = {}): never {
  throw Object.assign(new Error(message), { code, ...extra });
}
const invalid = (field: string, message: string): never => fail('Validation failed. Please correct the highlighted fields.', 'VALIDATION_FAILED', { issues: [{ field, message }] });
const n = (value: unknown) => Number(value ?? 0);

/** A textarea setting, one entry per line; the fallback list when it is blank. */
const lines = (value: string | undefined, fallback: string[]) => {
  const list = String(value ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return list.length ? list : fallback;
};

async function companySettings(): Promise<Record<string, string>> {
  const rows = await query<RowDataPacket>("SELECT setting_key, setting_value FROM settings WHERE setting_group = 'company'");
  return Object.fromEntries(rows.map((row) => [String(row.setting_key), String(row.setting_value ?? '')]));
}

/* ───────────────────────────── lookups ───────────────────────────── */

export async function lookups() {
  const [employers, settings, services] = await Promise.all([
    query<RowDataPacket>(
      `SELECT id, company_name, gst_number, pan_number, address_line_1, address_line_2, city, state, pincode, contact_person_name, approximate_employee_count
         FROM employers WHERE deleted_at IS NULL ORDER BY company_name`),
    companySettings(),
    listServices(false),
  ]);
  return {
    employers: employers.map((e) => ({
      id: Number(e.id), name: String(e.company_name), gstin: e.gst_number ?? null, pan: e.pan_number ?? null, contact: e.contact_person_name ?? null,
      address: [e.address_line_1, e.address_line_2, [e.city, e.pincode].filter(Boolean).join(' - ')].filter(Boolean).join(', '), state: e.state ?? null,
      employees: e.approximate_employee_count ?? null,
    })),
    seller: { name: settings.company_name ?? '', stateCode: settings.company_state_code || '33', defaultSac: settings.billing_default_sac || '998311', gstin: settings.company_gstin ?? '' },
    services,
    defaults: {
      elements: lines(settings.quotation_elements, DEFAULT_QUOTATION_ELEMENTS),
      notes: lines(settings.quotation_notes, DEFAULT_QUOTATION_NOTES),
      paymentTerms: lines(settings.quotation_payment_terms, DEFAULT_PAYMENT_TERMS),
      validityDays: Number(settings.quotation_validity_days) || DEFAULT_VALIDITY_DAYS,
      subject: DEFAULT_SUBJECT,
      directive: DEFAULT_OBJECTIVE,
    },
  };
}

/* ───────────────────────────── service catalogue ───────────────────────────── */

export async function listServices(includeInactive = true) {
  return query<RowDataPacket>(`SELECT id, name, scope, frequency, default_fee, sac_code, sort_order, status FROM billing_services WHERE deleted_at IS NULL ${includeInactive ? '' : "AND status = 'active'"} ORDER BY sort_order, id`);
}

export async function saveService(payload: unknown, id?: number) {
  const input = serviceSchema.parse(payload);
  if (id) {
    const found = await queryOne<RowDataPacket>('SELECT id FROM billing_services WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!found) fail('Service not found', 'NOT_FOUND');
    await execute('UPDATE billing_services SET name = ?, scope = ?, frequency = ?, default_fee = ?, sac_code = ?, status = ? WHERE id = ?',
      [input.name, input.scope, input.frequency, input.default_fee, input.sac_code, input.status, id]);
    return { id };
  }
  const order = n((await queryOne<RowDataPacket>('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM billing_services'))?.next);
  const result = await execute('INSERT INTO billing_services (name, scope, frequency, default_fee, sac_code, sort_order, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [input.name, input.scope, input.frequency, input.default_fee, input.sac_code, order, input.status]);
  return { id: result.insertId };
}

export async function deleteService(id: number) {
  const result = await execute('UPDATE billing_services SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!result.affectedRows) fail('Service not found', 'NOT_FOUND');
}

/* ───────────────────────────── quotations ───────────────────────────── */

const QUOTATION_COLUMNS = `q.id, q.quotation_number, q.employer_id, q.client_name, q.client_address, q.client_contact, q.contact_designation, q.client_profile, q.employee_strength, q.shifts, q.industry, q.client_gstin, q.client_state_code,
  q.subject, q.directive, q.framework_elements, q.notes, q.payment_terms, q.quote_date, q.valid_until, q.service_period, q.gst_percent, q.subtotal, q.gst_amount, q.total, q.status, q.invoice_id, q.created_at`;

export async function listQuotations(filters: { status?: string | null; search?: string | null }, scope: BillingScope) {
  const where = ['q.deleted_at IS NULL'];
  const params: unknown[] = [];
  if (scope.employerId) { where.push('q.employer_id = ?', "q.status <> 'Draft'"); params.push(scope.employerId); }
  if (filters.status) { where.push('q.status = ?'); params.push(filters.status); }
  if (filters.search) { where.push('(q.client_name LIKE ? OR q.quotation_number LIKE ?)'); params.push(`%${filters.search}%`, `%${filters.search}%`); }
  const rows = await query<RowDataPacket>(`SELECT ${QUOTATION_COLUMNS} FROM quotations q WHERE ${where.join(' AND ')} ORDER BY q.quote_date DESC, q.id DESC LIMIT 300`, params);
  const today = localToday();
  return rows.map((row) => ({ ...row, is_expired: ['Draft', 'Sent'].includes(String(row.status)) && row.valid_until && String(row.valid_until) < today }));
}

export type QuotationDetail = RowDataPacket & { items: RowDataPacket[]; framework_elements: string[]; payment_terms: string[] };

export async function getQuotation(id: number, scope: BillingScope): Promise<QuotationDetail> {
  const row = await queryOne<RowDataPacket>(`SELECT ${QUOTATION_COLUMNS} FROM quotations q WHERE q.id = ? AND q.deleted_at IS NULL`, [id]);
  if (!row || (scope.employerId && (Number(row.employer_id) !== scope.employerId || row.status === 'Draft'))) fail('Quotation not found', 'NOT_FOUND');
  const items = await query<RowDataPacket>('SELECT id, sort_order, category, scope, frequency, sac_code, fee FROM quotation_items WHERE quotation_id = ? ORDER BY sort_order, id', [id]);
  let elements: string[] = [];
  try { elements = row!.framework_elements ? JSON.parse(String(row!.framework_elements)) : []; } catch { elements = []; }
  let terms: string[] = [];
  try { terms = row!.payment_terms ? JSON.parse(String(row!.payment_terms)) : []; } catch { terms = []; }
  return { ...row!, framework_elements: elements, payment_terms: terms, items } as QuotationDetail;
}

async function writeQuotation(tx: Tx, id: number, input: ReturnType<typeof quotationSchema.parse>) {
  await tx.execute('DELETE FROM quotation_items WHERE quotation_id = ?', [id]);
  let order = 0;
  for (const item of input.items) {
    order += 1;
    await tx.execute('INSERT INTO quotation_items (quotation_id, sort_order, category, scope, frequency, sac_code, fee) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, order, item.category, item.scope, item.frequency, item.sac_code, round2(item.fee)]);
  }
}

export async function saveQuotation(payload: unknown, userId: number, id?: number) {
  const input = quotationSchema.parse(payload);
  if (input.client_gstin && input.client_state_code && stateCodeOfGstin(input.client_gstin) !== input.client_state_code) invalid('client_state_code', 'The state code does not match the GSTIN');
  if (input.employer_id && !(await queryOne<RowDataPacket>('SELECT id FROM employers WHERE id = ? AND deleted_at IS NULL', [input.employer_id]))) invalid('employer_id', 'That company does not exist');
  const totals = quotationTotals(input.items.map((item) => item.fee), input.gst_percent);
  const stateCode = input.client_state_code ?? (input.client_gstin ? stateCodeOfGstin(input.client_gstin) : null);
  const values = [input.employer_id, input.client_name, input.client_address, input.client_contact, input.contact_designation, input.client_profile, input.employee_strength, input.shifts, input.industry,
    input.client_gstin, stateCode, input.subject, input.directive, JSON.stringify(input.framework_elements), input.notes, JSON.stringify(input.payment_terms), input.quote_date, input.valid_until,
    input.service_period, input.gst_percent, totals.subtotal, totals.gst, totals.total];

  if (id) {
    const existing = await queryOne<RowDataPacket>('SELECT id, status FROM quotations WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!existing) fail('Quotation not found', 'NOT_FOUND');
    if (!['Draft', 'Sent'].includes(String(existing!.status))) fail(`A ${String(existing!.status).toLowerCase()} quotation can no longer be edited`, 'INVALID_STATE');
    await withTransaction(async (tx) => {
      await tx.execute(`UPDATE quotations SET employer_id = ?, client_name = ?, client_address = ?, client_contact = ?, contact_designation = ?, client_profile = ?, employee_strength = ?, shifts = ?, industry = ?,
        client_gstin = ?, client_state_code = ?, subject = ?, directive = ?, framework_elements = ?, notes = ?, payment_terms = ?, quote_date = ?, valid_until = ?, service_period = ?,
        gst_percent = ?, subtotal = ?, gst_amount = ?, total = ? WHERE id = ?`, [...values, id]);
      await writeQuotation(tx, id, input);
    });
    return { id, total: totals.total };
  }
  const number = await nextDocumentNumber('quotation', new Date(input.quote_date));
  const newId = await withTransaction(async (tx) => {
    const result = (await tx.execute(
      `INSERT INTO quotations (uuid, quotation_number, employer_id, client_name, client_address, client_contact, contact_designation, client_profile, employee_strength, shifts, industry,
        client_gstin, client_state_code, subject, directive, framework_elements, notes, payment_terms, quote_date, valid_until, service_period, gst_percent, subtotal, gst_amount, total, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), number, ...values, userId])) as { insertId: number };
    await writeQuotation(tx, result.insertId, input);
    return result.insertId;
  });
  return { id: newId, quotation_number: number, total: totals.total };
}

export async function setQuotationStatus(id: number, payload: unknown) {
  const { status } = quotationStatusSchema.parse(payload);
  const row = await queryOne<RowDataPacket>('SELECT id, status FROM quotations WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!row) fail('Quotation not found', 'NOT_FOUND');
  const current = String(row!.status);
  const allowed: Record<string, string[]> = { Draft: ['Sent'], Sent: ['Accepted', 'Rejected', 'Expired'], Accepted: [], Rejected: ['Sent'], Expired: ['Sent'], Invoiced: [] };
  if (!allowed[current]?.includes(status)) fail(`A ${current.toLowerCase()} quotation cannot be marked ${status.toLowerCase()}`, 'INVALID_STATE');
  await execute('UPDATE quotations SET status = ? WHERE id = ?', [status, id]);
  return { id, status };
}

export async function deleteQuotation(id: number) {
  const row = await queryOne<RowDataPacket>('SELECT id, status FROM quotations WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!row) fail('Quotation not found', 'NOT_FOUND');
  if (row!.status !== 'Draft') fail('Only a draft quotation can be deleted', 'INVALID_STATE');
  await execute('UPDATE quotations SET deleted_at = NOW() WHERE id = ?', [id]);
}

/* ───────────────────────────── invoices ───────────────────────────── */

const INVOICE_COLUMNS = `i.id, i.invoice_number, i.quotation_id, i.employer_id, i.buyer_name, i.buyer_address, i.buyer_gstin, i.buyer_pan, i.buyer_state_code, i.consignee_name, i.consignee_address,
  i.invoice_date, i.payment_terms, i.due_date, i.place_of_supply, i.supply_type, i.subtotal, i.cgst_amount, i.sgst_amount, i.igst_amount, i.total, i.amount_paid, i.status, i.notes, i.issued_at, i.cancel_reason, i.created_at`;

export async function listInvoices(filters: { status?: string | null; search?: string | null }, scope: BillingScope) {
  const where = ['i.deleted_at IS NULL'];
  const params: unknown[] = [];
  if (scope.employerId) { where.push('i.employer_id = ?', "i.status <> 'Draft'"); params.push(scope.employerId); }
  if (filters.status) { where.push('i.status = ?'); params.push(filters.status); }
  if (filters.search) { where.push('(i.buyer_name LIKE ? OR i.invoice_number LIKE ?)'); params.push(`%${filters.search}%`, `%${filters.search}%`); }
  const rows = await query<RowDataPacket>(`SELECT ${INVOICE_COLUMNS} FROM invoices i WHERE ${where.join(' AND ')} ORDER BY i.invoice_date DESC, i.id DESC LIMIT 300`, params);
  const today = localToday();
  return rows.map((row) => ({ ...row, balance: round2(n(row.total) - n(row.amount_paid)), is_overdue: ['Issued', 'Part paid'].includes(String(row.status)) && row.due_date && String(row.due_date) < today }));
}

export type InvoiceDetail = RowDataPacket & { balance: number; items: RowDataPacket[]; payments: RowDataPacket[] };

export async function getInvoice(id: number, scope: BillingScope): Promise<InvoiceDetail> {
  const row = await queryOne<RowDataPacket>(`SELECT ${INVOICE_COLUMNS} FROM invoices i WHERE i.id = ? AND i.deleted_at IS NULL`, [id]);
  if (!row || (scope.employerId && (Number(row.employer_id) !== scope.employerId || row.status === 'Draft'))) fail('Invoice not found', 'NOT_FOUND');
  const [items, payments] = await Promise.all([
    query<RowDataPacket>('SELECT id, sort_order, description, sac_code, quantity, uom, unit_price, taxable_value, gst_percent, gst_amount, amount FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order, id', [id]),
    query<RowDataPacket>('SELECT id, receipt_number, payment_date, amount, mode, reference, remarks FROM invoice_payments WHERE invoice_id = ? ORDER BY payment_date, id', [id]),
  ]);
  return { ...row!, balance: round2(n(row!.total) - n(row!.amount_paid)), items, payments } as InvoiceDetail;
}

function dueDate(invoiceDate: string, terms: string): string | null {
  const match = /net\s+(\d{1,3})\s+day/i.exec(terms);
  if (!match) return /immediate|on receipt|due on/i.test(terms) ? invoiceDate : null;
  const date = new Date(`${invoiceDate}T00:00:00`);
  date.setDate(date.getDate() + Number(match[1]));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

async function computeInvoice(input: ReturnType<typeof invoiceSchema.parse>) {
  const settings = await companySettings();
  const buyerState = input.buyer_state_code ?? (input.buyer_gstin ? stateCodeOfGstin(input.buyer_gstin) : null);
  if (input.buyer_gstin && input.buyer_state_code && stateCodeOfGstin(input.buyer_gstin) !== input.buyer_state_code) invalid('buyer_state_code', 'The state code does not match the GSTIN');
  const supply = supplyTypeFor(settings.company_state_code || '33', buyerState);
  const totals = invoiceTotals(input.items.map((item) => ({ quantity: item.quantity, unit_price: item.unit_price, gst_percent: item.gst_percent })), supply);
  return { totals, supply, buyerState, defaultSac: settings.billing_default_sac || '998311' };
}

async function writeInvoiceItems(tx: Tx, id: number, input: ReturnType<typeof invoiceSchema.parse>, computed: Awaited<ReturnType<typeof computeInvoice>>) {
  await tx.execute('DELETE FROM invoice_items WHERE invoice_id = ?', [id]);
  let order = 0;
  for (const [index, item] of input.items.entries()) {
    order += 1;
    const line = computed.totals.lines[index];
    await tx.execute(
      'INSERT INTO invoice_items (invoice_id, sort_order, description, sac_code, quantity, uom, unit_price, taxable_value, gst_percent, gst_amount, amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, order, item.description, item.sac_code ?? computed.defaultSac, item.quantity, item.uom, round2(item.unit_price), line.taxable_value, item.gst_percent, line.gst_amount, line.amount]);
  }
}

export async function saveInvoice(payload: unknown, userId: number, id?: number) {
  const input = invoiceSchema.parse(payload);
  if (input.employer_id && !(await queryOne<RowDataPacket>('SELECT id FROM employers WHERE id = ? AND deleted_at IS NULL', [input.employer_id]))) invalid('employer_id', 'That company does not exist');
  const computed = await computeInvoice(input);
  const due = dueDate(input.invoice_date, input.payment_terms);
  const values = [input.employer_id, input.quotation_id, input.buyer_name, input.buyer_address, input.buyer_gstin, input.buyer_pan, computed.buyerState, input.consignee_name, input.consignee_address,
    input.invoice_date, input.payment_terms, due, input.place_of_supply, computed.supply, computed.totals.subtotal, computed.totals.cgst, computed.totals.sgst, computed.totals.igst, computed.totals.total, input.notes];

  if (id) {
    const existing = await queryOne<RowDataPacket>('SELECT id, status FROM invoices WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!existing) fail('Invoice not found', 'NOT_FOUND');
    if (existing!.status !== 'Draft') fail('An issued invoice cannot be edited. Cancel it and raise a new one.', 'INVALID_STATE');
    await withTransaction(async (tx) => {
      await tx.execute(`UPDATE invoices SET employer_id = ?, quotation_id = ?, buyer_name = ?, buyer_address = ?, buyer_gstin = ?, buyer_pan = ?, buyer_state_code = ?, consignee_name = ?, consignee_address = ?,
        invoice_date = ?, payment_terms = ?, due_date = ?, place_of_supply = ?, supply_type = ?, subtotal = ?, cgst_amount = ?, sgst_amount = ?, igst_amount = ?, total = ?, notes = ? WHERE id = ?`, [...values, id]);
      await writeInvoiceItems(tx, id, input, computed);
    });
    return { id, total: computed.totals.total };
  }
  const uuid = randomUUID();
  const newId = await withTransaction(async (tx) => {
    const result = (await tx.execute(
      `INSERT INTO invoices (uuid, invoice_number, employer_id, quotation_id, buyer_name, buyer_address, buyer_gstin, buyer_pan, buyer_state_code, consignee_name, consignee_address, invoice_date, payment_terms,
        due_date, place_of_supply, supply_type, subtotal, cgst_amount, sgst_amount, igst_amount, total, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuid, `DRAFT-${uuid.slice(0, 8)}`, ...values, userId])) as { insertId: number };
    await writeInvoiceItems(tx, result.insertId, input, computed);
    return result.insertId;
  });
  return { id: newId, total: computed.totals.total };
}

export async function deleteInvoice(id: number) {
  const row = await queryOne<RowDataPacket>('SELECT id, status FROM invoices WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!row) fail('Invoice not found', 'NOT_FOUND');
  if (row!.status !== 'Draft') fail('Only a draft invoice can be deleted; cancel an issued one instead', 'INVALID_STATE');
  await execute('UPDATE invoices SET deleted_at = NOW() WHERE id = ?', [id]);
}

/** Issuing gives the invoice its number and locks it. A quotation it came from is marked Invoiced. */
export async function issueInvoice(id: number) {
  const row = await queryOne<RowDataPacket>('SELECT id, status, invoice_date, total, buyer_name FROM invoices WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!row) fail('Invoice not found', 'NOT_FOUND');
  if (row!.status !== 'Draft') fail(`This invoice is already ${String(row!.status).toLowerCase()}`, 'INVALID_STATE');
  if (!(n(row!.total) > 0)) invalid('items', 'An invoice with nothing to pay cannot be issued');
  const number = await nextDocumentNumber('invoice', new Date(String(row!.invoice_date)));
  await execute("UPDATE invoices SET invoice_number = ?, status = 'Issued', issued_at = NOW() WHERE id = ?", [number, id]);
  return { id, invoice_number: number };
}

export async function cancelInvoice(id: number, payload: unknown) {
  const { reason } = cancelSchema.parse(payload);
  const row = await queryOne<RowDataPacket>('SELECT id, status, amount_paid, quotation_id FROM invoices WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!row) fail('Invoice not found', 'NOT_FOUND');
  if (!['Issued', 'Part paid'].includes(String(row!.status))) fail(`A ${String(row!.status).toLowerCase()} invoice cannot be cancelled`, 'INVALID_STATE');
  if (n(row!.amount_paid) > 0) fail('Payments are recorded against this invoice, so it cannot be cancelled', 'INVALID_STATE');
  await execute("UPDATE invoices SET status = 'Cancelled', cancelled_at = NOW(), cancel_reason = ? WHERE id = ?", [reason, id]);
  if (row!.quotation_id) await execute("UPDATE quotations SET status = 'Accepted', invoice_id = NULL WHERE id = ? AND status = 'Invoiced'", [row!.quotation_id]);
  return { id };
}

export async function recordPayment(id: number, payload: unknown, userId: number) {
  const input = paymentSchema.parse(payload);
  if (input.payment_date > localToday()) invalid('payment_date', 'A payment cannot be dated in the future');
  const row = await queryOne<RowDataPacket>('SELECT id, status, total, amount_paid, invoice_date FROM invoices WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!row) fail('Invoice not found', 'NOT_FOUND');
  if (!['Issued', 'Part paid'].includes(String(row!.status))) fail(`Payments cannot be recorded against a ${String(row!.status).toLowerCase()} invoice`, 'INVALID_STATE');
  if (input.payment_date < String(row!.invoice_date).slice(0, 10)) invalid('payment_date', 'A payment cannot be dated before the invoice');
  const balance = round2(n(row!.total) - n(row!.amount_paid));
  if (round2(input.amount) > balance) invalid('amount', `The amount is more than the balance due (${balance.toFixed(2)})`);
  const receipt = await nextDocumentNumber('receipt', new Date(input.payment_date));
  const paid = round2(n(row!.amount_paid) + input.amount);
  const status = paid >= n(row!.total) ? 'Paid' : 'Part paid';
  const paymentId = await withTransaction(async (tx) => {
    const result = (await tx.execute('INSERT INTO invoice_payments (invoice_id, receipt_number, payment_date, amount, mode, reference, remarks, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, receipt, input.payment_date, round2(input.amount), input.mode, input.reference, input.remarks, userId])) as { insertId: number };
    await tx.execute('UPDATE invoices SET amount_paid = ?, status = ? WHERE id = ?', [paid, status, id]);
    return result.insertId;
  });
  return { id: paymentId, receipt_number: receipt, status, balance: round2(n(row!.total) - paid) };
}

/** A quotation the client accepted becomes a Draft invoice: one line per service, the same GST rate, the buyer's details copied across. */
export async function convertQuotation(id: number, userId: number) {
  const quotation = await getQuotation(id, {});
  if (quotation.status !== 'Accepted') fail(`Only an accepted quotation can be invoiced (this one is ${String(quotation.status).toLowerCase()})`, 'INVALID_STATE');
  const settings = await companySettings();
  const employer = quotation.employer_id ? await queryOne<RowDataPacket>('SELECT pan_number, state FROM employers WHERE id = ?', [quotation.employer_id]) : null;
  const today = localToday();
  const created = await saveInvoice({
    employer_id: quotation.employer_id, quotation_id: id, buyer_name: quotation.client_name, buyer_address: quotation.client_address, buyer_gstin: quotation.client_gstin,
    buyer_pan: quotation.client_gstin ? String(quotation.client_gstin).slice(2, 12) : employer?.pan_number ?? null, buyer_state_code: quotation.client_state_code,
    invoice_date: today, payment_terms: 'Net 30 days', place_of_supply: employer?.state ?? null, notes: `As per quotation ${String(quotation.quotation_number)}.`,
    items: quotation.items.map((item) => ({ description: `${String(item.category)} (${String(item.frequency).toLowerCase()})`, sac_code: item.sac_code ?? (settings.billing_default_sac || '998311'),
      quantity: 1, uom: 'Nos', unit_price: n(item.fee), gst_percent: n(quotation.gst_percent) })),
  }, userId);
  await execute("UPDATE quotations SET status = 'Invoiced', invoice_id = ? WHERE id = ?", [created.id, id]);
  return created;
}

/* ───────────────────────────── receipts ───────────────────────────── */

export async function getReceipt(paymentId: number, scope: BillingScope) {
  const row = await queryOne<RowDataPacket>(
    `SELECT p.id, p.receipt_number, p.payment_date, p.amount, p.mode, p.reference, p.remarks, i.id AS invoice_id, i.invoice_number, i.invoice_date, i.employer_id, i.buyer_name, i.buyer_address, i.buyer_gstin, i.total, i.amount_paid
       FROM invoice_payments p JOIN invoices i ON i.id = p.invoice_id WHERE p.id = ? AND i.deleted_at IS NULL`, [paymentId]);
  if (!row || (scope.employerId && Number(row.employer_id) !== scope.employerId)) fail('Receipt not found', 'NOT_FOUND');
  return row!;
}

/** Summary strip for the admin billing pages. */
export async function summary() {
  const row = await queryOne<RowDataPacket>(
    `SELECT (SELECT COUNT(*) FROM quotations WHERE deleted_at IS NULL AND status IN ('Draft','Sent')) AS open_quotations,
            (SELECT COALESCE(SUM(total - amount_paid), 0) FROM invoices WHERE deleted_at IS NULL AND status IN ('Issued','Part paid')) AS outstanding,
            (SELECT COALESCE(SUM(total - amount_paid), 0) FROM invoices WHERE deleted_at IS NULL AND status IN ('Issued','Part paid') AND due_date < CURDATE()) AS overdue,
            (SELECT COALESCE(SUM(amount), 0) FROM invoice_payments WHERE payment_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')) AS received_this_month`);
  return { openQuotations: n(row?.open_quotations), outstanding: round2(n(row?.outstanding)), overdue: round2(n(row?.overdue)), receivedThisMonth: round2(n(row?.received_this_month)) };
}
