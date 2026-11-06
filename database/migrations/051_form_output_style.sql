-- 051 - A form can print as a report: a cover page, a table of contents, numbered chapters and question / answer tables, the way the
--   client's audit reports read, instead of the plain form layout. 'standard' (every existing form) is unchanged.
SET NAMES utf8mb4;

ALTER TABLE dynamic_forms ADD COLUMN output_style VARCHAR(20) NOT NULL DEFAULT 'standard' AFTER form_type;

-- the client's audit reports print as reports
UPDATE dynamic_forms f JOIN dynamic_modules m ON m.id = f.module_id
   SET f.output_style = 'report'
 WHERE m.name IN ('ETP Assessment Document List', 'Environmental Aspects and Impacts Register', 'Risk Engineering Compliance Report', 'Environmental Audit Report');
