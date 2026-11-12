-- 052 - Act builder and reader.
--   compliance_acts.subtitle        the line under the Act name in the printed Act ("Arrangement of Sections")
--   compliance_acts.show_on_public  an administrator can hide an unfinished Act from the public site (every existing Act stays visible)
--   act_provisions.body_html        the section text written in the Word-style editor (sanitised HTML); `explanation` keeps the plain text of it, which
--                                   the CAPAR search and the full-text index still read
--   act_provisions.kind             'Schedule' for the schedules, appendices and forms that follow the chapters of an Act or a set of Rules
SET NAMES utf8mb4;

ALTER TABLE compliance_acts
  ADD COLUMN IF NOT EXISTS subtitle VARCHAR(255) NULL AFTER short_name,
  ADD COLUMN IF NOT EXISTS show_on_public TINYINT(1) NOT NULL DEFAULT 1 AFTER status;

ALTER TABLE act_provisions
  ADD COLUMN IF NOT EXISTS body_html LONGTEXT NULL AFTER explanation,
  MODIFY COLUMN kind ENUM('Chapter','Section','Sub Section','Schedule') NOT NULL;
