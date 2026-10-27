-- 024 — CMS module support.
--
-- The CMS tables shipped with migration 001 and the public site already reads
-- `cms_pages` for the Resources and Reports sections (`page_type = 'resource'`
-- and `'report'`) — but the enum created back then only allowed
-- ('page','blog','faq','legal','landing'), so those two public sections could
-- never be filled from the authoring screens. The first statement closes that
-- gap.
--
-- Then the grants the module needs to be operable: the Administrator role could
-- read, create and update CMS rows but could not upload a media asset, delete a
-- page, publish one, or download a file-backed resource. Publishing is a
-- separate capability from editing on purpose — an editor role can hold
-- `cms_page.update` without holding `cms_page.approve`.
--
-- Finally the scheduled-publishing job, seeded like the other jobs in 023, and
-- the composite indexes the authoring screens and the public site both read.

ALTER TABLE cms_pages
  MODIFY COLUMN page_type ENUM('page','blog','faq','legal','landing','resource','report') NOT NULL DEFAULT 'page';

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.name IN (
    'cms_page.delete', 'cms_page.approve', 'cms_page.download', 'cms_page.upload',
    'cms_media.delete', 'cms_media.approve', 'cms_media.download', 'cms_media.upload',
    'cms_resource.delete', 'cms_resource.approve', 'cms_resource.download', 'cms_resource.upload'
  )
 WHERE r.slug IN ('super_admin', 'admin');

INSERT INTO scheduled_jobs (job_code, job_name, description, cron_expression, job_type, is_active, next_run_at)
VALUES
  ('cms_scheduled_publish', 'Scheduled content publishing',
   'Promotes every CMS page whose scheduled time has passed from scheduled to published, so a launch date holds without anyone watching the clock.',
   '*/5 * * * *', 'SYNC', TRUE, NULL)
ON DUPLICATE KEY UPDATE job_name = VALUES(job_name), description = VALUES(description),
                        cron_expression = VALUES(cron_expression), job_type = VALUES(job_type);

CREATE INDEX IF NOT EXISTS idx_cms_pages_status ON cms_pages (status, page_type, published_at);
CREATE INDEX IF NOT EXISTS idx_cms_pages_menu ON cms_pages (show_in_menu, sort_order);
CREATE INDEX IF NOT EXISTS idx_cms_sections_page ON cms_page_sections (page_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_cms_media_folder ON cms_media (folder, created_at);
CREATE INDEX IF NOT EXISTS idx_cms_resources_status ON cms_resources (status, resource_type);
