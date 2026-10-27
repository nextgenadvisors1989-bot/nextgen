-- 011_employee_checklist.sql — the 16-item personal file checklist used by the
-- employee PDF (page 7) and the employee detail page.
SET NAMES utf8mb4;

INSERT INTO personal_file_checklist_items (item_code, item_label, sort_order, is_mandatory) VALUES
  ('PF01', 'Application / Resume',                                  1,  TRUE),
  ('PF02', 'Interview Assessment Sheet',                            2,  TRUE),
  ('PF03', 'Offer / Appointment Letter (signed copy)',              3,  TRUE),
  ('PF04', 'Educational Certificates (attested copies)',            4,  TRUE),
  ('PF05', 'Previous Experience / Relieving Certificates',          5,  TRUE),
  ('PF06', 'Aadhaar Card Copy',                                     6,  TRUE),
  ('PF07', 'PAN Card Copy',                                         7,  TRUE),
  ('PF08', 'Passport Size Photographs (2)',                         8,  TRUE),
  ('PF09', 'Bank Account Details / Cancelled Cheque',               9,  TRUE),
  ('PF10', 'PF Form 2 — Nomination',                                10, TRUE),
  ('PF11', 'Gratuity Form F — Nomination',                          11, TRUE),
  ('PF12', 'ESI Form 1 — Declaration',                              12, FALSE),
  ('PF13', 'Medical Fitness Certificate',                           13, FALSE),
  ('PF14', 'Police Verification Report',                            14, FALSE),
  ('PF15', 'Signed Employee Handbook Acknowledgement',              15, FALSE),
  ('PF16', 'Service Rules / Standing Orders Acknowledgement',       16, TRUE)
ON DUPLICATE KEY UPDATE item_label = VALUES(item_label), sort_order = VALUES(sort_order);
