-- 012_payroll_heads.sql — statutory Indian payroll heads (earnings, deductions, employer contributions).
SET NAMES utf8mb4;

INSERT INTO payroll_heads
  (head_code, head_name, head_name_ta, head_type, calculation_type, percent_value, is_statutory, is_taxable, is_pf_applicable, is_esi_applicable, show_on_payslip, sort_order, status)
VALUES
  ('BASIC',  'Basic Salary',            'அடிப்படை சம்பளம்',        'Earning',  'Attendance Based', NULL,   FALSE, TRUE,  TRUE,  TRUE,  TRUE, 10, 'active'),
  ('DA',     'Dearness Allowance',      'அகவிலைப்படி',              'Earning',  'Percent of Basic', 0.000,  FALSE, TRUE,  TRUE,  TRUE,  TRUE, 20, 'active'),
  ('HRA',    'House Rent Allowance',    'வீட்டு வாடகை படி',         'Earning',  'Percent of Basic', 0.000,  FALSE, TRUE,  FALSE, TRUE,  TRUE, 30, 'active'),
  ('TA',     'Travel Allowance',        'பயணப்படி',                 'Earning',  'Fixed',            NULL,   FALSE, TRUE,  FALSE, TRUE,  TRUE, 40, 'active'),
  ('PA',     'Personal Allowance',      'தனிப்பட்ட படி',            'Earning',  'Fixed',            NULL,   FALSE, TRUE,  FALSE, TRUE,  TRUE, 50, 'active'),
  ('EA',     'Education Allowance',     'கல்விப் படி',              'Earning',  'Fixed',            NULL,   FALSE, TRUE,  FALSE, TRUE,  TRUE, 60, 'active'),
  ('NPBA',   'Non-Practising Allowance','தொழில் தடை படி',           'Earning',  'Fixed',            NULL,   FALSE, TRUE,  FALSE, TRUE,  TRUE, 70, 'active'),
  ('OTHER',  'Other Allowances',        'இதர படிகள்',               'Earning',  'Fixed',            NULL,   FALSE, TRUE,  FALSE, TRUE,  TRUE, 80, 'active'),
  ('OT',     'Overtime',                'கூடுதல் நேர ஊதியம்',       'Earning',  'Attendance Based', NULL,   FALSE, TRUE,  FALSE, FALSE, TRUE, 90, 'active'),
  ('BONUS',  'Statutory Bonus',         'சட்டப்பூர்வ போனஸ்',        'Earning',  'Formula',          NULL,   TRUE,  TRUE,  FALSE, FALSE, TRUE, 100,'active'),
  ('ARR',    'Arrears',                 'நிலுவைத் தொகை',            'Earning',  'Fixed',            NULL,   FALSE, TRUE,  FALSE, FALSE, TRUE, 110,'active'),

  ('PF',     'Provident Fund (EPF)',    'வருங்கால வைப்பு நிதி',     'Deduction','Percent of Basic', 12.000, TRUE,  FALSE, FALSE, FALSE, TRUE, 200,'active'),
  ('VPF',    'Voluntary Provident Fund','தன்னார்வ வைப்பு நிதி',     'Deduction','Percent of Basic', 0.000,  FALSE, FALSE, FALSE, FALSE, TRUE, 210,'active'),
  ('ESI',    'ESI Contribution',        'ஊழியர் நலன்சார் பங்களிப்பு','Deduction','Percent of Gross', 0.750,  TRUE,  FALSE, FALSE, FALSE, TRUE, 220,'active'),
  ('PT',     'Professional Tax',        'தொழில் வரி',               'Deduction','Fixed',            NULL,   TRUE,  FALSE, FALSE, FALSE, TRUE, 230,'active'),
  ('LWF',    'Labour Welfare Fund',     'தொழிலாளர் நல நிதி',        'Deduction','Fixed',            NULL,   TRUE,  FALSE, FALSE, FALSE, TRUE, 240,'active'),
  ('TDS',    'TDS / Income Tax',        'வரி பிடித்தம்',            'Deduction','Formula',          NULL,   TRUE,  TRUE,  FALSE, FALSE, TRUE, 250,'active'),
  ('ADV',    'Salary Advance Recovery', 'முன்பணம் பிடித்தம்',       'Deduction','Fixed',            NULL,   FALSE, FALSE, FALSE, FALSE, TRUE, 260,'active'),
  ('CANTEEN','Canteen Deduction',       'உணவக கட்டணம்',            'Deduction','Fixed',            NULL,   FALSE, FALSE, FALSE, FALSE, TRUE, 270,'active'),
  ('OTHERD', 'Other Deductions',        'இதர பிடித்தங்கள்',         'Deduction','Fixed',            NULL,   FALSE, FALSE, FALSE, FALSE, TRUE, 280,'active'),

  ('PF_ER',  'Employer PF Contribution','முதலாளி வைப்பு நிதி',      'Employer Contribution','Percent of Basic', 12.000, TRUE, FALSE, FALSE, FALSE, TRUE, 300,'active'),
  ('EPS_ER', 'Employer EPS Contribution','முதலாளி ஓய்வூதியம்',      'Employer Contribution','Percent of Basic', 8.330,  TRUE, FALSE, FALSE, FALSE, TRUE, 310,'active'),
  ('EDLI',   'EDLI Contribution',       'EDLI பங்களிப்பு',          'Employer Contribution','Percent of Basic', 0.500,  TRUE, FALSE, FALSE, FALSE, TRUE, 320,'active'),
  ('PF_ADM', 'PF Administrative Charges','PF நிர்வாக கட்டணம்',      'Employer Contribution','Percent of Basic', 0.500,  TRUE, FALSE, FALSE, FALSE, TRUE, 330,'active'),
  ('ESI_ER', 'Employer ESI Contribution','முதலாளி ESI பங்களிப்பு',  'Employer Contribution','Percent of Gross', 3.250,  TRUE, FALSE, FALSE, FALSE, TRUE, 340,'active')
ON DUPLICATE KEY UPDATE head_name = VALUES(head_name), head_name_ta = VALUES(head_name_ta);
