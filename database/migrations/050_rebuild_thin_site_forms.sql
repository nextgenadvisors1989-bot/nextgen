-- 050 - Three forms were first built from short summaries of the client's files. The complete versions (every heading, question and table of
--   the H&M ETP document list, the SR - Form 001 aspects register and the risk engineering report) replace them, so their old sections go.
--   Only forms nobody has filled in are touched; scripts/install-aa-forms.py then writes the complete structure through the form builder API.
SET NAMES utf8mb4;

DELETE s FROM dynamic_form_sections s
  JOIN dynamic_forms f ON f.id = s.form_id
  JOIN dynamic_modules m ON m.id = f.module_id
 WHERE m.name IN ('ETP Assessment Document List', 'Environmental Aspects and Impacts Register', 'Risk Engineering Compliance Report')
   AND NOT EXISTS (SELECT 1 FROM dynamic_form_submissions x WHERE x.form_id = f.id);
