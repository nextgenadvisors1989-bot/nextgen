-- 054 - The client's name for the TSDF audit (message of 2026-11-14: "Integrated Common Hazardous Waste Treatment, Storage and Disposal Facility Audit -
--       Not updated"). Only the name changes; its forms, assignments and reports stay linked because they point at the entry's id.
SET NAMES utf8mb4;

UPDATE audit_types
SET name = 'Integrated Common Hazardous Waste Treatment, Storage and Disposal Facility Audit'
WHERE name = 'Common and Captive TSDF Audit';
