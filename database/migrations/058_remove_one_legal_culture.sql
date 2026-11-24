-- 058 - The client does not want the words "One Legal Culture" anywhere on the website (message of 2026-11-24); the name in the logo, "NextGen Socio & Enviro Advisors", takes their place.
--   "One Legal Culture / NextGen Socio & Enviro Advisors" (an old company-name value) becomes the plain company name; every other use of the phrase becomes the company name.
--   Saved pages, page blocks (the home banner heading), downloadable resources, media captions, settings and the consultancy name printed on CAPAR reports are changed.
--   The activity log is history and is left as it was.
SET NAMES utf8mb4;

UPDATE settings
SET setting_value = REPLACE(REPLACE(REPLACE(setting_value, 'One Legal Culture / ', ''), 'ONE LEGAL CULTURE', 'NextGen Socio & Enviro Advisors'), 'One Legal Culture', 'NextGen Socio & Enviro Advisors')
WHERE setting_value LIKE '%legal culture%';

UPDATE cms_pages
SET title = REPLACE(REPLACE(REPLACE(title, 'One Legal Culture / ', ''), 'ONE LEGAL CULTURE', 'NextGen Socio & Enviro Advisors'), 'One Legal Culture', 'NextGen Socio & Enviro Advisors'),
    subtitle = REPLACE(REPLACE(REPLACE(subtitle, 'One Legal Culture / ', ''), 'ONE LEGAL CULTURE', 'NextGen Socio & Enviro Advisors'), 'One Legal Culture', 'NextGen Socio & Enviro Advisors'),
    meta_title = REPLACE(REPLACE(REPLACE(meta_title, 'One Legal Culture / ', ''), 'ONE LEGAL CULTURE', 'NextGen Socio & Enviro Advisors'), 'One Legal Culture', 'NextGen Socio & Enviro Advisors'),
    meta_description = REPLACE(REPLACE(REPLACE(meta_description, 'One Legal Culture / ', ''), 'ONE LEGAL CULTURE', 'NextGen Socio & Enviro Advisors'), 'One Legal Culture', 'NextGen Socio & Enviro Advisors'),
    content_html = REPLACE(REPLACE(REPLACE(content_html, 'One Legal Culture / ', ''), 'ONE LEGAL CULTURE', 'NextGen Socio & Enviro Advisors'), 'One Legal Culture', 'NextGen Socio & Enviro Advisors')
WHERE CONCAT_WS(' ', title, subtitle, meta_title, meta_description, content_html) LIKE '%legal culture%';

UPDATE cms_page_sections
SET heading = REPLACE(REPLACE(REPLACE(heading, 'One Legal Culture / ', ''), 'ONE LEGAL CULTURE', 'NextGen Socio & Enviro Advisors'), 'One Legal Culture', 'NextGen Socio & Enviro Advisors'),
    subheading = REPLACE(REPLACE(REPLACE(subheading, 'One Legal Culture / ', ''), 'ONE LEGAL CULTURE', 'NextGen Socio & Enviro Advisors'), 'One Legal Culture', 'NextGen Socio & Enviro Advisors'),
    content_html = REPLACE(REPLACE(REPLACE(content_html, 'One Legal Culture / ', ''), 'ONE LEGAL CULTURE', 'NextGen Socio & Enviro Advisors'), 'One Legal Culture', 'NextGen Socio & Enviro Advisors'),
    content_json = REPLACE(REPLACE(REPLACE(content_json, 'One Legal Culture / ', ''), 'ONE LEGAL CULTURE', 'NextGen Socio & Enviro Advisors'), 'One Legal Culture', 'NextGen Socio & Enviro Advisors')
WHERE CONCAT_WS(' ', heading, subheading, content_html, content_json) LIKE '%legal culture%';

UPDATE cms_resources
SET title = REPLACE(REPLACE(REPLACE(title, 'One Legal Culture / ', ''), 'ONE LEGAL CULTURE', 'NextGen Socio & Enviro Advisors'), 'One Legal Culture', 'NextGen Socio & Enviro Advisors'),
    description = REPLACE(REPLACE(REPLACE(description, 'One Legal Culture / ', ''), 'ONE LEGAL CULTURE', 'NextGen Socio & Enviro Advisors'), 'One Legal Culture', 'NextGen Socio & Enviro Advisors')
WHERE CONCAT_WS(' ', title, description) LIKE '%legal culture%';

UPDATE cms_media
SET title = REPLACE(REPLACE(REPLACE(title, 'One Legal Culture / ', ''), 'ONE LEGAL CULTURE', 'NextGen Socio & Enviro Advisors'), 'One Legal Culture', 'NextGen Socio & Enviro Advisors'),
    alt_text = REPLACE(REPLACE(REPLACE(alt_text, 'One Legal Culture / ', ''), 'ONE LEGAL CULTURE', 'NextGen Socio & Enviro Advisors'), 'One Legal Culture', 'NextGen Socio & Enviro Advisors'),
    caption = REPLACE(REPLACE(REPLACE(caption, 'One Legal Culture / ', ''), 'ONE LEGAL CULTURE', 'NextGen Socio & Enviro Advisors'), 'One Legal Culture', 'NextGen Socio & Enviro Advisors')
WHERE CONCAT_WS(' ', title, alt_text, caption) LIKE '%legal culture%';

UPDATE capar_reports
SET audit_firm = REPLACE(REPLACE(REPLACE(audit_firm, 'One Legal Culture / ', ''), 'ONE LEGAL CULTURE', 'NextGen Socio & Enviro Advisors'), 'One Legal Culture', 'NextGen Socio & Enviro Advisors')
WHERE audit_firm LIKE '%legal culture%';
