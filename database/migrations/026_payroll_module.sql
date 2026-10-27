-- 026 — Payroll engine support.
--
-- The payroll tables shipped with migration 013 (`salary_structures`,
-- `salary_structure_items`, `payroll_heads`, `payroll_runs`, `payroll_items`,
-- `payslips`) and 014 (`bonus_records`, `gratuity_records`,
-- `full_final_settlements`); the heads are seeded by `scripts/run-seeds.ts` from
-- the 25-row catalogue. What the engine needs on top of the schema:
--
--   * the job that reminds the office a payroll month has closed — it dispatches
--     through the same idempotent `reminder_dispatches` ledger as every other
--     reminder, which is why `PAYROLL_PENDING` already exists in that enum;
--   * the composite indexes the run engine and every payroll screen read on the
--     hot path (a run per employer/month, a payslip per employee/month, the
--     items behind a payslip, an employee's live structure, and attendance by
--     employee-month because the engine counts days from it).
--
-- The `payroll.*` / `payslip.*` / `salary_structure.*` / `attendance.*` grants
-- are **not** written here: this platform generates permissions and role grants
-- from `lib/auth/rbac.ts` in `scripts/run-seeds.ts`, so the matrix stays in step
-- with the checks that enforce it.

-- The monthly nudge: on the first of the month, if last month has no run yet.
INSERT INTO scheduled_jobs (job_code, job_name, description, cron_expression, job_type, is_active, next_run_at)
VALUES
  ('payroll_month_reminder', 'Payroll month reminder',
   'On the first of every month, reminds the administrators and every employer portal user of any company whose payroll for the month just ended has not been run. Each dispatch is claimed once, so a re-run never nudges twice.',
   '0 7 1 * *', 'REMINDER', TRUE, NULL)
ON DUPLICATE KEY UPDATE job_name = VALUES(job_name), description = VALUES(description),
                        cron_expression = VALUES(cron_expression), job_type = VALUES(job_type);

-- The run remembers who the operator left out, so a recalculation three weeks
-- later computes the same people as the first pass instead of quietly adding
-- back the leaver whose settlement is still open.
ALTER TABLE payroll_runs
  ADD COLUMN IF NOT EXISTS excluded_employee_ids JSON NULL AFTER calculation_notes,
  ADD COLUMN IF NOT EXISTS payslips_generated_at DATETIME NULL AFTER bank_file_generated_at;

CREATE INDEX IF NOT EXISTS idx_pr_employer_period ON payroll_runs (employer_id, year, month, status);
CREATE INDEX IF NOT EXISTS idx_pr_status ON payroll_runs (status, period_to);
CREATE INDEX IF NOT EXISTS idx_ps_run ON payslips (payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_ps_employee_period ON payslips (employee_id, year, month);
CREATE INDEX IF NOT EXISTS idx_ps_employer_status ON payslips (employer_id, payment_status, year, month);
CREATE INDEX IF NOT EXISTS idx_pi_payslip ON payroll_items (payslip_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_pi_run ON payroll_items (payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_ss_employee_live ON salary_structures (employee_id, is_active, effective_from);
CREATE INDEX IF NOT EXISTS idx_br_employer_year ON bonus_records (employer_id, bonus_year, payment_status);
CREATE INDEX IF NOT EXISTS idx_gr_employee ON gratuity_records (employee_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_ffs_employer_status ON full_final_settlements (employer_id, status);
CREATE INDEX IF NOT EXISTS idx_att_employee_month ON attendance (employee_id, year, month, status);
