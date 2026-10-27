-- 030 - The personal file checklist now carries the client's own 16 contents (cover sheet of the Shakthi Knitting personal file),
-- in the same order, instead of the generic list. Codes and ids are unchanged, so every employee's ticks stay attached to the same row.
SET NAMES utf8mb4;

UPDATE personal_file_checklist_items SET item_label = 'Employee Details' WHERE item_code = 'PF01';
UPDATE personal_file_checklist_items SET item_label = 'Application with Employee Information and Skill Assessment Details' WHERE item_code = 'PF02';
UPDATE personal_file_checklist_items SET item_label = 'Bio-data Form with Photographs' WHERE item_code = 'PF03';
UPDATE personal_file_checklist_items SET item_label = 'Appointment Order' WHERE item_code = 'PF04';
UPDATE personal_file_checklist_items SET item_label = 'Confirmation Order' WHERE item_code = 'PF05';
UPDATE personal_file_checklist_items SET item_label = 'Rules & Regulations' WHERE item_code = 'PF06';
UPDATE personal_file_checklist_items SET item_label = 'Nomination Form - No. 34' WHERE item_code = 'PF07';
UPDATE personal_file_checklist_items SET item_label = 'Form F - Fresh Nomination' WHERE item_code = 'PF08';
UPDATE personal_file_checklist_items SET item_label = 'Personal Nomination' WHERE item_code = 'PF09';
UPDATE personal_file_checklist_items SET item_label = 'Service Record' WHERE item_code = 'PF10';
UPDATE personal_file_checklist_items SET item_label = 'Age Proof Documents (Aadhaar Card / Voter ID / Mark Sheet with Photo / Doctor Certificate)' WHERE item_code = 'PF11';
UPDATE personal_file_checklist_items SET item_label = 'PF Declaration Form - Form 2' WHERE item_code = 'PF12';
UPDATE personal_file_checklist_items SET item_label = 'ESI Declaration Form - Form 1' WHERE item_code = 'PF13';
UPDATE personal_file_checklist_items SET item_label = 'Form No. 11' WHERE item_code = 'PF14';
UPDATE personal_file_checklist_items SET item_label = 'Acceptance Letter from Employee to Credit his Wage in Bank' WHERE item_code = 'PF15';
UPDATE personal_file_checklist_items SET item_label = 'Affirmative Statement' WHERE item_code = 'PF16';
