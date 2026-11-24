-- 059 - The old product name "ComplianceOS" is not shown anywhere (client's message, 2026-11-24, with the screenshot of the sign-in page): the name in the logo,
--       "NextGen Socio & Enviro Advisors", is used instead. The sign-in page took it from APP_NAME in the server's .env (a copy of .env.example said ComplianceOS); the code now ignores
--       that value. This migration changes the stored settings (application name, e-mail sender name, the sample company name and addresses of the first seed) and the wording of
--       the e-mail and notification history that the delivery logs show. Real addresses that a person typed are not touched.
SET NAMES utf8mb4;

UPDATE settings SET setting_value = 'NextGen Socio & Enviro Advisors' WHERE setting_key IN ('app_name', 'from_name') AND setting_value = 'ComplianceOS';
UPDATE settings SET setting_value = 'NextGen Socio and Enviro Advisors' WHERE setting_key = 'company_name' AND setting_value = 'ComplianceOS Technologies Private Limited';
UPDATE settings SET setting_value = '' WHERE setting_key IN ('company_email', 'from_email', 'reply_to') AND setting_value LIKE '%@complianceos.example';
UPDATE settings SET setting_value = REPLACE(setting_value, 'ComplianceOS', 'NextGen Socio & Enviro Advisors') WHERE setting_value LIKE '%ComplianceOS%';

UPDATE email_logs
SET from_email = REPLACE(from_email, '"ComplianceOS"', '"NextGen Socio & Enviro Advisors"'),
    subject = REPLACE(subject, 'ComplianceOS', 'NextGen Socio & Enviro Advisors'),
    body_html = REPLACE(body_html, 'ComplianceOS', 'NextGen Socio & Enviro Advisors')
WHERE CONCAT_WS(' ', from_email, subject, body_html) LIKE '%ComplianceOS%';

UPDATE notification_logs
SET subject = REPLACE(subject, 'ComplianceOS', 'NextGen Socio & Enviro Advisors'),
    body = REPLACE(body, 'ComplianceOS', 'NextGen Socio & Enviro Advisors')
WHERE CONCAT_WS(' ', subject, body) LIKE '%ComplianceOS%';
