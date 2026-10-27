-- 013_leave_types.sql — platform-default leave types (employers may add their own overrides).
-- Re-runnable: global rows are cleared first because MySQL treats NULLs as distinct in
-- unique keys, which would otherwise allow duplicates on every seed run.
SET NAMES utf8mb4;

DELETE FROM leave_types WHERE employer_id IS NULL;

INSERT INTO leave_types
  (employer_id, code, name, name_ta, is_paid, max_days_per_year, carry_forward, max_carry_forward, encashable, requires_document, min_days_notice, allow_half_day, status)
VALUES
  (NULL, 'EL',  'Earned Leave',     'ஈட்டிய விடுப்பு',   TRUE,  24.00, TRUE,  12.00, TRUE,  FALSE, 3,  TRUE,  'active'),
  (NULL, 'CL',  'Casual Leave',     'சாதாரண விடுப்பு',   TRUE,  12.00, FALSE, 0.00,  FALSE, FALSE, 1,  TRUE,  'active'),
  (NULL, 'SL',  'Sick Leave',       'நோய் விடுப்பு',     TRUE,  12.00, FALSE, 0.00,  FALSE, TRUE,  0,  TRUE,  'active'),
  (NULL, 'ML',  'Maternity Leave',  'மகப்பேறு விடுப்பு', TRUE,  182.00,FALSE, 0.00,  FALSE, TRUE,  30, FALSE, 'active'),
  (NULL, 'PL',  'Paternity Leave',  'தந்தை விடுப்பு',    TRUE,  5.00,  FALSE, 0.00,  FALSE, TRUE,  7,  FALSE, 'active'),
  (NULL, 'LOP', 'Loss of Pay',      'ஊதிய இழப்பு',       FALSE, NULL,  FALSE, 0.00,  FALSE, FALSE, 0,  TRUE,  'active'),
  (NULL, 'CO',  'Compensatory Off', 'ஈடு விடுப்பு',      TRUE,  NULL,  FALSE, 0.00,  FALSE, FALSE, 0,  TRUE,  'active'),
  (NULL, 'MRG', 'Marriage Leave',   'திருமண விடுப்பு',   TRUE,  5.00,  FALSE, 0.00,  FALSE, TRUE,  15, FALSE, 'active');
