/**
 * The register catalogue of Data Management: every register of the client's "Integrated Industrial Data Management System"
 * (PUR-01 ... CMP-01), with its fields, units and formulas.
 *
 * Rules that run through all of them (from the client's framework):
 *   - one source of truth: every quantity is entered once, in one register, and all rollups, balances, KPIs and GHG figures are
 *     calculated from those records;
 *   - one unit per field: masses are in kg, water in KL, electricity in kWh (a field never mixes kg with tonnes or L with KL);
 *     where a register must handle several units of measure (a purchase may be kg, litres or Nos.) the unit is its own field and
 *     totals only add the same unit;
 *   - calculated fields (type 'calc') are never typed: the server calculates them from the formula on every save, and the form
 *     shows them live. Formulas use only the field keys, + - * / and brackets.
 */

export type FieldType = 'text' | 'number' | 'date' | 'select' | 'textarea' | 'calc';
export type Agg = 'sum' | 'avg' | 'last' | 'max' | 'none';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  unit?: string;
  options?: readonly string[];
  required?: boolean;
  formula?: string;
  hint?: string;
  /** How a number combines over a week / month / year. Default: sum for quantities, none for calc fields (re-calculated from the totals). */
  agg?: Agg;
  /** Offer the values already used in this register as suggestions (materials, suppliers, products). */
  suggest?: boolean;
  /** Options come from the administrator's emission-factor register (see GHG-01). */
  dynamic?: 'ef';
  decimals?: number;
  /** An optional quantity that counts as 0 in the formulas when left empty (a return, an adjustment, the rejected part of a batch). */
  zero?: boolean;
}

export type Frequency = 'Daily' | 'Weekly' | 'Monthly' | 'Annual' | 'As it happens';

export interface RegisterDef {
  code: string;
  name: string;
  /** One of the 15 modules of the client's application plan. */
  module: string;
  group: string;
  frequency: Frequency;
  description: string;
  shift?: boolean;
  fields: FieldDef[];
  /** Fields shown as columns in the list of records (the date is always first). */
  columns: string[];
  /** Roll-ups are also split by this field (material, product, source ...). */
  splitBy?: string;
}

const UOM = ['kg', 'MT', 'L', 'KL', 'Nos', 'SCM', 'm'] as const;
const INSPECTION = ['Accepted', 'Rejected'] as const;

const text = (key: string, label: string, o: Partial<FieldDef> = {}): FieldDef => ({ key, label, type: 'text', ...o });
const area = (key: string, label: string, o: Partial<FieldDef> = {}): FieldDef => ({ key, label, type: 'textarea', ...o });
const num = (key: string, label: string, unit: string, o: Partial<FieldDef> = {}): FieldDef => ({ key, label, type: 'number', unit, ...o });
const date = (key: string, label: string, o: Partial<FieldDef> = {}): FieldDef => ({ key, label, type: 'date', ...o });
const pick = (key: string, label: string, options: readonly string[], o: Partial<FieldDef> = {}): FieldDef => ({ key, label, type: 'select', options, ...o });
const calc = (key: string, label: string, unit: string, formula: string, o: Partial<FieldDef> = {}): FieldDef => ({ key, label, type: 'calc', unit, formula, ...o });

export const MODULES = [
  'Purchase', 'Raw material', 'Inventory', 'Production', 'Finished goods', 'Transportation', 'Water', 'Energy', 'Waste', 'ETP / STP', 'GHG', 'Compliance', 'Audit',
] as const;

export const REGISTERS: RegisterDef[] = [
  /* ───────────────────────── purchase and materials ───────────────────────── */
  {
    code: 'PUR-01', name: 'Purchase and procurement register', module: 'Purchase', group: 'Purchase', frequency: 'Daily',
    description: 'Every purchase: order, supplier, invoice, weighbridge weights, price and the goods receipt. Net quantity = gross - tare; purchase value = net x unit price; difference = invoice - received.',
    columns: ['material', 'supplier', 'uom', 'net_qty', 'purchase_value', 'inspection'], splitBy: 'material',
    fields: [
      text('po_no', 'Purchase order no.'), text('supplier', 'Supplier', { required: true, suggest: true }),
      text('material', 'Material', { required: true, suggest: true }), text('material_code', 'Material code'),
      pick('uom', 'Unit of measure', UOM, { required: true }),
      num('invoice_qty', 'Invoice quantity', '', { hint: 'In the unit chosen above.' }), num('gross_qty', 'Gross weight / quantity', ''), num('tare_qty', 'Tare weight', ''),
      calc('net_qty', 'Net quantity received', '', 'gross_qty - tare_qty'), calc('diff_qty', 'Difference (invoice - received)', '', 'invoice_qty - net_qty'),
      num('unit_price', 'Unit price', '₹ per unit', { agg: 'avg' }), calc('purchase_value', 'Purchase value', '₹', 'net_qty * unit_price'),
      num('gst_pct', 'GST', '%', { agg: 'avg' }), text('invoice_no', 'Invoice no.'), text('vehicle_no', 'Vehicle no.'), text('eway_bill', 'E-way bill'),
      text('weighbridge_slip', 'Weighbridge slip no.'), pick('inspection', 'Quality inspection', INSPECTION), text('storage_location', 'Storage location'), text('grn_no', 'GRN no.'),
    ],
  },
  {
    code: 'RM-01', name: 'Raw material receipt register', module: 'Raw material', group: 'Materials', frequency: 'Daily',
    description: 'Raw materials, chemicals, packaging and fuel received into stores, with batch, dates and quality check.',
    columns: ['material', 'uom', 'received_qty', 'batch_no', 'inspection'], splitBy: 'material',
    fields: [
      text('material', 'Material', { required: true, suggest: true }), pick('uom', 'Unit of measure', UOM, { required: true }), text('supplier', 'Supplier', { suggest: true }),
      text('grn_no', 'GRN no.'), num('received_qty', 'Quantity received', ''), text('batch_no', 'Batch / lot no.'), date('mfg_date', 'Manufacturing date'), date('expiry_date', 'Expiry date'),
      pick('inspection', 'Quality inspection', INSPECTION), text('storage_location', 'Storage location'),
    ],
  },
  {
    code: 'RM-02', name: 'Raw material consumption register', module: 'Raw material', group: 'Materials', frequency: 'Daily',
    description: 'Material issued to production and returned from it. Consumption = opening + receipts - closing, adjusted for transfers and returns (see INV-01).',
    columns: ['material', 'uom', 'issued_qty', 'returned_qty', 'net_issued', 'process'], splitBy: 'material',
    fields: [
      text('material', 'Material', { required: true, suggest: true }), pick('uom', 'Unit of measure', UOM, { required: true }), text('process', 'Process / section', { suggest: true }),
      text('product_code', 'Product code', { suggest: true }), num('issued_qty', 'Issued to production', ''), num('returned_qty', 'Returned from production', '', { zero: true }),
      calc('net_issued', 'Net consumed', '', 'issued_qty - returned_qty'),
    ],
  },
  {
    code: 'INV-01', name: 'Inventory and stock register', module: 'Inventory', group: 'Inventory', frequency: 'Daily',
    description: 'Opening stock, receipts, issues, transfers and closing book stock: closing = opening + receipts + production returns - issues - transfers out. A physical count gives the variance.',
    columns: ['material', 'uom', 'opening', 'closing_book', 'physical', 'variance_pct'], splitBy: 'material',
    fields: [
      text('material', 'Material', { required: true, suggest: true }), pick('uom', 'Unit of measure', UOM, { required: true }), text('location', 'Warehouse / bin / tank'),
      num('opening', 'Opening stock', '', { agg: 'last' }), num('receipts', 'Receipts', '', { zero: true }), num('returns_in', 'Returns from production', '', { zero: true }), num('issues', 'Issued to production', '', { zero: true }),
      num('transfers_out', 'Transferred out', '', { zero: true }), calc('closing_book', 'Closing book stock', '', 'opening + receipts + returns_in - issues - transfers_out', { agg: 'last' }),
      num('physical', 'Physical stock counted', '', { agg: 'last' }), calc('variance', 'Stock variance (physical - book)', '', 'physical - closing_book'),
      calc('variance_pct', 'Variance', '%', '(physical - closing_book) / closing_book * 100'),
      text('batch_no', 'Batch no.'), date('expiry_date', 'Expiry date'), area('condition', 'Leakage, spillage, damage, expired or rejected stock'),
    ],
  },
  /* ───────────────────────── production and finished goods ───────────────────────── */
  {
    code: 'PRO-01', name: 'Daily production register', module: 'Production', group: 'Production', frequency: 'Daily', shift: true,
    description: 'Production by shift, machine and product with the raw material, chemicals, water, electricity and fuel used. Yield = good product / raw material input; availability = (planned - downtime) / planned.',
    columns: ['product_code', 'machine_no', 'total_production', 'rejected', 'good_production', 'downtime_h'], splitBy: 'product_code',
    fields: [
      text('product_code', 'Product code / name', { required: true, suggest: true }), text('machine_no', 'Machine no.', { suggest: true }),
      text('start_time', 'Start time'), text('end_time', 'End time'), num('planned_h', 'Planned production time', 'hours'), num('downtime_h', 'Downtime', 'hours', { zero: true }),
      num('rm_consumed', 'Raw material consumed', 'kg'), num('chemical', 'Chemical consumption', 'kg or L'), num('water_kl', 'Water consumption', 'KL'), num('electricity_kwh', 'Electricity consumption', 'kWh'),
      num('fuel_qty', 'Fuel consumption', 'L or kg'), text('fuel_type', 'Fuel'),
      num('total_production', 'Total production', 'kg'), num('rejected', 'Rejected production', 'kg', { zero: true }), num('rework', 'Rework quantity', 'kg'), num('process_waste', 'Process waste', 'kg'),
      calc('good_production', 'Good finished product', 'kg', 'total_production - rejected'),
      calc('yield_pct', 'Production yield', '%', 'good_production / rm_consumed * 100'), calc('rejection_pct', 'Rejection', '%', 'rejected / total_production * 100'),
      calc('rm_ratio', 'Raw material per kg of product', 'kg/kg', 'rm_consumed / total_production'), calc('availability_pct', 'Machine availability', '%', '(planned_h - downtime_h) / planned_h * 100'),
    ],
  },
  {
    code: 'PRO-02', name: 'Product rejection and rework register', module: 'Production', group: 'Production', frequency: 'Daily',
    description: 'Every rejected or reworked lot with the reason and the action taken.',
    columns: ['product_code', 'batch_no', 'rejected_kg', 'reworked_kg', 'reason'], splitBy: 'product_code',
    fields: [
      text('product_code', 'Product code / name', { required: true, suggest: true }), text('batch_no', 'Batch / lot no.'), num('rejected_kg', 'Rejected quantity', 'kg'), num('reworked_kg', 'Reworked quantity', 'kg'),
      text('reason', 'Reason', { suggest: true }), area('action', 'Action taken'),
    ],
  },
  {
    code: 'FG-01', name: 'Finished goods register', module: 'Finished goods', group: 'Finished goods', frequency: 'Daily',
    description: 'Finished goods stock, quality status and sales per product. Production achievement = actual production / installed capacity; closing = opening + produced - dispatched.',
    columns: ['product_code', 'opening_fg', 'produced', 'dispatched', 'closing_fg', 'quality_status'], splitBy: 'product_code',
    fields: [
      text('product_code', 'Product code / name', { required: true, suggest: true }), text('category', 'Category'), text('specification', 'Specification'),
      num('capacity_per_day', 'Installed capacity', 'kg per day', { agg: 'max', hint: 'Used for production achievement. Enter it once; the latest value is used.' }),
      num('opening_fg', 'Opening stock', 'kg', { agg: 'last' }), num('produced', 'Produced (accepted)', 'kg', { zero: true }), num('dispatched', 'Dispatched', 'kg', { zero: true }),
      calc('closing_fg', 'Closing stock', 'kg', 'opening_fg + produced - dispatched', { agg: 'last' }), num('sales_qty', 'Sales quantity', 'kg'), num('sales_value', 'Sales value', '₹'),
      text('batch_no', 'Batch / lot no.'), pick('quality_status', 'Quality status', ['Approved', 'Rejected']), text('customer', 'Customer / consignee'),
    ],
  },
  {
    code: 'DIS-01', name: 'Product dispatch register', module: 'Finished goods', group: 'Finished goods', frequency: 'Daily',
    description: 'Every dispatch: customer, vehicle, weights, distance, fuel and delivery proof.',
    columns: ['customer', 'product_code', 'net_kg', 'vehicle_no', 'distance_km', 'sales_value'], splitBy: 'product_code',
    fields: [
      text('invoice_no', 'Invoice no.'), text('customer', 'Customer', { required: true, suggest: true }), text('destination', 'Destination'), text('product_code', 'Product code / name', { suggest: true }),
      text('batch_no', 'Batch / lot no.'), text('vehicle_no', 'Vehicle no.'), text('transporter', 'Transporter', { suggest: true }),
      num('gross_kg', 'Gross weight', 'kg'), num('tare_kg', 'Tare weight', 'kg'), calc('net_kg', 'Net dispatched', 'kg', 'gross_kg - tare_kg'),
      num('distance_km', 'Distance', 'km'), num('fuel_l', 'Fuel used', 'L'), num('sales_value', 'Sales value', '₹'), text('challan_no', 'Delivery challan no.'), text('pod_ref', 'Proof of delivery'),
      num('returned_kg', 'Returned / rejected goods', 'kg'),
    ],
  },
  /* ───────────────────────── transport ───────────────────────── */
  ...(['TRN-01', 'TRN-02'] as const).map((code): RegisterDef => ({
    code, name: code === 'TRN-01' ? 'Incoming transport register' : 'Outgoing transport register', module: 'Transportation', group: 'Transport', frequency: 'Daily',
    description: `Vehicles ${code === 'TRN-01' ? 'bringing purchases in' : 'taking finished goods and waste out'}. Net = gross - tare; transport work (tonne-km) = net tonnes x distance. `
      + 'Own vehicles count in Scope 1 (their fuel); hired vehicles count in Scope 3, so the same fuel is never counted twice.',
    columns: ['vehicle_no', 'ownership', code === 'TRN-01' ? 'material' : 'customer', 'net_kg', 'distance_km', 'tonne_km'],
    fields: [
      text('vehicle_no', 'Vehicle no.', { required: true, suggest: true }), pick('vehicle_category', 'Vehicle category', ['Truck / lorry', 'Tanker', 'Container', 'Tempo / light vehicle', 'Car / van', 'Two-wheeler', 'Other']),
      pick('ownership', 'Vehicle', ['Own', 'Hired'], { required: true }), text('transporter', 'Transporter', { suggest: true }),
      code === 'TRN-01' ? text('supplier', 'Supplier', { suggest: true }) : text('customer', 'Customer / destination', { suggest: true }),
      text('material', code === 'TRN-01' ? 'Material' : 'Product / waste', { suggest: true }),
      num('gross_kg', 'Gross weight', 'kg'), num('tare_kg', 'Tare weight', 'kg'), calc('net_kg', 'Net quantity carried', 'kg', 'gross_kg - tare_kg'),
      num('distance_km', 'Distance travelled', 'km'), calc('tonne_km', 'Transport work', 'tonne-km', 'net_kg / 1000 * distance_km'),
      pick('fuel_type', 'Fuel', ['Diesel', 'Petrol', 'CNG', 'LPG', 'Electric', 'Other']), num('fuel_l', 'Fuel used', 'L or kWh'),
      calc('km_per_l', 'Vehicle fuel efficiency', 'km per L', 'distance_km / fuel_l'), num('freight_cost', 'Transport cost', '₹'), calc('freight_per_tonne', 'Freight per tonne', '₹ per tonne', 'freight_cost / (net_kg / 1000)'),
      text('document_ref', code === 'TRN-01' ? 'Invoice / e-way bill' : 'Challan / invoice / e-way bill'), text('weighbridge_slip', 'Weighbridge slip no.'),
    ],
  })),
  /* ───────────────────────── water and wastewater ───────────────────────── */
  {
    code: 'WAT-01', name: 'Water source and consumption register', module: 'Water', group: 'Water', frequency: 'Daily',
    description: 'Water taken in from each source and water used by each department. Total input = fresh water + recycled water. Meter readings, if given, work out the quantity.',
    columns: ['kind', 'name', 'qty_kl', 'meter_opening', 'meter_closing'], splitBy: 'name',
    fields: [
      pick('kind', 'Record', ['Intake (source)', 'Use (department)'], { required: true }),
      text('name', 'Source or department', { required: true, suggest: true, hint: 'Source: Borewell, Municipal supply, Tanker water, Surface water, Rainwater harvesting, Recycled water. Department: Domestic, Drinking, Process, Boiler, Cooling tower, Washing, Gardening, Laboratory, ETP/STP, Firefighting.' }),
      num('meter_opening', 'Meter opening', 'KL', { agg: 'last' }), num('meter_closing', 'Meter closing', 'KL', { agg: 'last' }), num('qty_kl', 'Quantity', 'KL', { hint: 'Leave empty to use closing - opening.' }),
      text('invoice_ref', 'Water bill / tanker invoice'),
    ],
  },
  {
    code: 'WAT-02', name: 'Wastewater and ETP / STP register', module: 'ETP / STP', group: 'Water', frequency: 'Daily',
    description: 'Treatment plant flows, quality and sludge, with the water balance outputs. Water balance difference = input - (product water + evaporation + wastewater + other losses + change in storage).',
    columns: ['etp_in_kl', 'etp_out_kl', 'stp_in_kl', 'reuse_kl', 'discharge_kl', 'ph', 'cod'],
    fields: [
      num('etp_in_kl', 'ETP inlet', 'KL'), num('etp_out_kl', 'ETP outlet', 'KL'), num('stp_in_kl', 'STP inlet', 'KL'), num('stp_out_kl', 'STP outlet', 'KL'),
      num('reuse_kl', 'Treated water reused', 'KL'), num('discharge_kl', 'Final discharge', 'KL'), num('sludge_kg', 'Sludge generated', 'kg'),
      num('ph', 'pH', 'units', { agg: 'avg' }), num('bod', 'BOD', 'mg/L', { agg: 'avg' }), num('cod', 'COD', 'mg/L', { agg: 'avg' }), num('tss', 'TSS', 'mg/L', { agg: 'avg' }),
      num('tds', 'TDS', 'mg/L', { agg: 'avg' }), num('oil_grease', 'Oil and grease', 'mg/L', { agg: 'avg' }),
      text('sample_location', 'Sample location'), text('lab_ref', 'Laboratory / method / report no.'),
      num('wastewater_kl', 'Wastewater generated', 'KL'), num('product_water_kl', 'Water in product', 'KL'), num('evaporation_kl', 'Evaporation', 'KL'),
      num('other_loss_kl', 'Other losses', 'KL'), num('storage_change_kl', 'Change in water storage', 'KL'),
    ],
  },
  /* ───────────────────────── energy ───────────────────────── */
  {
    code: 'ENR-01', name: 'Electricity register', module: 'Energy', group: 'Energy', frequency: 'Daily',
    description: 'Meter readings and the split of the electricity used. Consumption = (closing - opening) x meter multiplier. Grid electricity is what counts in Scope 2.',
    columns: ['meter_opening', 'meter_closing', 'consumption', 'grid_kwh', 'solar_kwh', 'dg_kwh'],
    fields: [
      text('meter_name', 'Meter / department'), num('meter_opening', 'Opening reading', 'kWh', { agg: 'last' }), num('meter_closing', 'Closing reading', 'kWh', { agg: 'last' }),
      num('multiplier', 'Meter multiplier', 'x', { agg: 'last' }), calc('consumption', 'Total consumption', 'kWh', '(meter_closing - meter_opening) * multiplier'),
      num('grid_kwh', 'Grid electricity', 'kWh', { hint: 'Leave empty if all of it came from the grid.' }), num('solar_kwh', 'Solar generation', 'kWh'), num('renewable_kwh', 'Renewable energy purchased', 'kWh'),
      num('dg_kwh', 'DG generation', 'kWh'), num('export_kwh', 'Electricity exported', 'kWh'), num('max_demand', 'Maximum demand', 'kVA', { agg: 'max' }), num('cost', 'Electricity cost', '₹'),
      text('bill_ref', 'Electricity bill / photo reference'),
    ],
  },
  {
    code: 'ENR-02', name: 'Fuel and energy register', module: 'Energy', group: 'Energy', frequency: 'Daily',
    description: 'Each fuel separately. Consumption = opening stock + purchases - closing stock; transfers and adjustments are entered on their own. Fuel for your own vehicles is entered in the transport registers, not here.',
    columns: ['fuel', 'opening_stock', 'purchased', 'closing_stock', 'consumed', 'purpose'], splitBy: 'fuel',
    fields: [
      pick('fuel', 'Fuel', ['Diesel', 'Petrol', 'LPG', 'PNG', 'Furnace oil', 'Biomass', 'Coal', 'Other'], { required: true, hint: 'Units: Diesel, Petrol, Furnace oil in L; LPG, Biomass, Coal in kg; PNG in SCM.' }),
      pick('purpose', 'Used for', ['Boiler / process heat', 'DG set', 'Other equipment (stationary)'], { required: true }),
      num('opening_stock', 'Opening stock', 'fuel unit', { agg: 'last' }), num('purchased', 'Purchased', 'fuel unit', { zero: true }), num('closing_stock', 'Closing stock', 'fuel unit', { agg: 'last' }),
      num('adjustment', 'Transfers / adjustments (+ in, - out)', 'fuel unit', { zero: true }), calc('consumed', 'Fuel consumed', 'fuel unit', 'opening_stock + purchased + adjustment - closing_stock'),
      num('cost', 'Fuel cost', '₹'), text('invoice_ref', 'Purchase invoice'),
    ],
  },
  /* ───────────────────────── waste ───────────────────────── */
  {
    code: 'WST-01', name: 'Solid waste register', module: 'Waste', group: 'Waste', frequency: 'Daily',
    description: 'Non-hazardous waste generated, by stream, with where it is stored. Where it went (reuse, recycling, recovery, disposal) is recorded in WST-03 and WST-04.',
    columns: ['waste_type', 'name', 'department', 'qty_kg', 'storage_location'], splitBy: 'waste_type',
    fields: [
      pick('waste_type', 'Waste stream', ['Non-hazardous solid waste', 'Metal waste', 'Textile waste', 'Organic waste', 'E-waste', 'Battery waste', 'Biomedical waste', 'Packaging waste', 'Other'], { required: true }),
      text('name', 'Waste name and code', { suggest: true }), text('department', 'Generating department / process', { suggest: true }), num('qty_kg', 'Quantity generated', 'kg'),
      num('moisture_pct', 'Moisture content', '%', { agg: 'avg' }), pick('physical', 'Physical condition', ['Solid', 'Liquid', 'Sludge']), text('storage_location', 'Storage location'), num('storage_kg', 'Quantity in storage now', 'kg', { agg: 'last' }),
    ],
  },
  {
    code: 'WST-02', name: 'Hazardous waste register', module: 'Waste', group: 'Waste', frequency: 'Daily',
    description: 'Hazardous waste generated (chemical sludge, used oil, solvent residue ...) with its hazard class and storage.',
    columns: ['name', 'category_code', 'department', 'qty_kg', 'storage_kg'], splitBy: 'name',
    fields: [
      text('name', 'Waste name', { required: true, suggest: true }), text('category_code', 'Category / schedule code (HW Rules 2016)'), text('department', 'Generating department / process', { suggest: true }),
      num('qty_kg', 'Quantity generated', 'kg'), text('hazard_class', 'Hazard classification'), pick('physical', 'Physical condition', ['Solid', 'Liquid', 'Sludge']), text('storage_location', 'Designated storage area'),
      num('storage_kg', 'Quantity in storage now', 'kg', { agg: 'last' }),
    ],
  },
  {
    code: 'WST-03', name: 'Waste recycling and recovery register', module: 'Waste', group: 'Waste', frequency: 'Daily',
    description: 'Waste that was reused, recycled or recovered, and through whom. Reuse, recycling, recovery and disposal are separate destinations.',
    columns: ['waste_type', 'name', 'route', 'qty_kg', 'recycler'], splitBy: 'route',
    fields: [
      pick('waste_type', 'Waste stream', ['Hazardous', 'Non-hazardous solid waste', 'Metal waste', 'Textile waste', 'Organic waste', 'E-waste', 'Battery waste', 'Packaging waste', 'Wastewater sludge', 'Other'], { required: true }),
      text('name', 'Waste name', { suggest: true }), pick('route', 'Destination', ['Reuse', 'Recycling', 'Recovery'], { required: true }), num('qty_kg', 'Quantity', 'kg'),
      text('recycler', 'Authorised recycler / recovery facility', { suggest: true }), text('certificate_ref', 'Certificate / challan no.'),
    ],
  },
  {
    code: 'WST-04', name: 'Waste disposal and manifest register', module: 'Waste', group: 'Waste', frequency: 'Daily',
    description: 'Waste sent out for treatment or disposal, with the manifest, vehicle, facility and disposal certificate. Disposal by method feeds the Scope 3 waste emissions.',
    columns: ['waste_type', 'name', 'method', 'qty_kg', 'facility', 'manifest_no'], splitBy: 'method',
    fields: [
      pick('waste_type', 'Waste stream', ['Hazardous', 'Non-hazardous solid waste', 'Metal waste', 'Textile waste', 'Organic waste', 'E-waste', 'Battery waste', 'Packaging waste', 'Wastewater sludge', 'Other'], { required: true }),
      text('name', 'Waste name', { suggest: true }), pick('method', 'Treatment / disposal method', ['Landfill / TSDF', 'Incineration', 'Co-processing', 'Treatment', 'Other'], { required: true }),
      num('qty_kg', 'Quantity', 'kg'), text('facility', 'Authorised disposal facility', { suggest: true }), text('manifest_no', 'Manifest / challan no.'), text('vehicle_no', 'Vehicle no.'),
      text('destination', 'Final destination'), text('certificate_ref', 'Disposal certificate'),
    ],
  },
  /* ───────────────────────── GHG ───────────────────────── */
  {
    code: 'GHG-01', name: 'GHG emissions register (other activity data)', module: 'GHG', group: 'GHG', frequency: 'Monthly',
    description: 'Activity data that no other register holds: refrigerant leakage, process emissions, purchased steam or heat, employee commuting, business travel. '
      + 'Fuel, electricity, transport and waste emissions are worked out from their own registers. Emissions = activity x emission factor (the administrator\'s register).',
    columns: ['activity', 'ef_code', 'quantity', 'note'],
    fields: [
      pick('activity', 'Activity', ['Refrigerant leakage', 'Process emission', 'Purchased steam / heat', 'Employee commuting', 'Business travel', 'Purchased goods (other)', 'Other'], { required: true }),
      { key: 'ef_code', label: 'Emission factor', type: 'select', dynamic: 'ef', required: true, hint: 'Chosen from the administrator\'s emission-factor register. If it is not there, ask the administrator to add it.' },
      num('quantity', 'Activity quantity', 'unit of the factor'), text('note', 'Basis / source (for example: 12 staff x 22 days x 14 km by bus)'),
    ],
  },
  /* ───────────────────────── audit and compliance ───────────────────────── */
  {
    code: 'AUD-01', name: 'Material balance and reconciliation', module: 'Audit', group: 'Audit and compliance', frequency: 'Monthly',
    description: 'The balance of what went in and what came out. The measured part (input, finished product, waste) is picked up from the other registers; enter here only what they do not hold. '
      + 'Closure = (measured output + accumulation) / measured input. An unexplained difference must be investigated, not written off as process loss.',
    columns: ['period_label', 'byproducts_kg', 'wastewater_material_kg', 'other_loss_kg', 'accumulation_kg', 'investigation'],
    fields: [
      text('period_label', 'Period this covers', { required: true }), num('byproducts_kg', 'Reusable by-products', 'kg'), num('wastewater_material_kg', 'Material carried in wastewater', 'kg'),
      num('other_loss_kg', 'Other measured losses / emissions', 'kg'), num('accumulation_kg', 'Change in work-in-progress, stock and tanks', 'kg'), area('investigation', 'Investigation of the unexplained difference'),
    ],
  },
  {
    code: 'CAPA-01', name: 'Corrective and preventive action register', module: 'Audit', group: 'Audit and compliance', frequency: 'As it happens',
    description: 'Findings from audits, inspections, complaints and incidents with the action, owner, due date and whether it worked.',
    columns: ['reference', 'source', 'finding', 'owner', 'due_date', 'action_status'],
    fields: [
      text('reference', 'CAPA no.'), pick('source', 'Source', ['Audit', 'Internal inspection', 'Complaint', 'Incident', 'Statutory inspection', 'Other']), area('finding', 'Finding', { required: true }), area('root_cause', 'Root cause'),
      area('action', 'Corrective / preventive action'), text('owner', 'Responsible person', { suggest: true }), date('due_date', 'Due date'),
      pick('action_status', 'Status', ['Open', 'In progress', 'Closed'], { required: true }), date('closed_on', 'Closed on'), area('effectiveness', 'Effectiveness check'),
    ],
  },
  {
    code: 'CMP-01', name: 'Statutory compliance register', module: 'Compliance', group: 'Audit and compliance', frequency: 'As it happens',
    description: 'Consents, authorisations, licences and returns with their validity and status, using the actual consent conditions and formats that apply to the facility.',
    columns: ['requirement', 'authority', 'reference_no', 'valid_until', 'compliance_status'],
    fields: [
      text('requirement', 'Consent / authorisation / licence / return', { required: true, suggest: true }), text('authority', 'Authority', { suggest: true }), text('reference_no', 'Reference / licence no.'),
      date('valid_from', 'Valid from'), date('valid_until', 'Valid until'), pick('compliance_status', 'Status', ['Compliant', 'Due', 'Overdue', 'Not applicable'], { required: true }),
      area('next_action', 'Next action'), text('evidence_ref', 'Evidence / document reference'),
    ],
  },
  {
    code: 'EHS-01', name: 'Safety and environmental incident register', module: 'Compliance', group: 'Audit and compliance', frequency: 'As it happens',
    description: 'Safety and environmental incidents of the day (the daily operational record also asks for these).',
    columns: ['incident_type', 'severity', 'description', 'action_taken'],
    fields: [
      pick('incident_type', 'Type', ['Safety incident', 'Environmental incident', 'Near miss', 'Spillage / leakage', 'Fire'], { required: true }), pick('severity', 'Severity', ['Minor', 'Moderate', 'Major']),
      area('description', 'What happened', { required: true }), area('action_taken', 'Action taken'), text('reported_to', 'Reported to'),
    ],
  },
];

export const REGISTER_BY_CODE: Record<string, RegisterDef> = Object.fromEntries(REGISTERS.map((register) => [register.code, register]));

export const REGISTER_GROUPS = [...new Set(REGISTERS.map((register) => register.group))];

/** Normalised aggregation of a field. */
export function aggOf(field: FieldDef): Agg {
  if (field.agg) return field.agg;
  return field.type === 'number' ? 'sum' : 'none';
}
