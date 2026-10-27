-- 003_auditor_types.sql — default auditor categories used when onboarding auditors.
SET NAMES utf8mb4;

INSERT INTO auditor_types (name, code, description, specialization, status) VALUES
  ('Safety Auditor',        'SAFETY',  'Factory, fire and occupational safety audits',            'Manufacturing',        'active'),
  ('Water Auditor',         'WATER',   'Water usage, effluent and pollution control audits',       'Environmental',        'active'),
  ('Food Safety Auditor',   'FOOD',    'HACCP, FSSAI and hygiene audits',                          'Food Safety',          'active'),
  ('Environmental Auditor', 'ENV',     'Environmental clearance and pollution board compliance',   'Environmental',        'active'),
  ('Electrical Auditor',    'ELEC',    'Electrical safety and statutory inspections',              'Electrical Safety',    'active'),
  ('Social Compliance Auditor', 'SOCIAL', 'Labour law, wages and working condition audits',        'Manufacturing',        'active'),
  ('Quality Auditor',       'QUAL',    'ISO 9001, process and quality management audits',          'Pharmaceuticals',      'active'),
  ('Fire Safety Auditor',   'FIRE',    'Fire NOC, fire fighting system and evacuation audits',     'Fire Safety',          'active')
ON DUPLICATE KEY UPDATE description = VALUES(description);
