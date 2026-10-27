"""Seed stage: the employee profile particulars of the client's sketch.

Gives every demo employee an employee status (State local / Migrant) and a working status (Permanent / Temporary / Contract) when they have none,
and files two permission requests for the demo employee so the employer's queue has something to decide. Safe to re-run.
"""
from datetime import date, timedelta

from seed_lib import db, q1, section

ORIGINS = ["State local", "State local", "Migrant"]
TYPES = ["Permanent", "Permanent", "Contract", "Temporary"]


def stage_workday():
    section("Employee status and working status")
    rows = db("SELECT id FROM employees WHERE deleted_at IS NULL AND (workforce_origin IS NULL OR employment_type IS NULL) ORDER BY id")
    for i, (employee_id,) in enumerate(rows):
        db(f"UPDATE employees SET workforce_origin = COALESCE(workforce_origin, '{ORIGINS[i % len(ORIGINS)]}'), employment_type = COALESCE(employment_type, '{TYPES[i % len(TYPES)]}') WHERE id = {int(employee_id)}")
    print(f"  {len(rows)} employee(s) updated")

    section("Permission requests")
    target = q1("SELECT e.id FROM employees e JOIN users u ON u.id = e.user_id WHERE u.email = 'employee.test@complianceos.local'")
    if not target:
        print("  demo employee not found, skipped")
        return
    employee_id = int(target)
    employer_id = int(q1(f"SELECT employer_id FROM employees WHERE id = {employee_id}"))
    if int(q1(f"SELECT COUNT(*) FROM employee_permissions WHERE employee_id = {employee_id}", 0)) > 0:
        print("  already present")
        return
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    last_week = (date.today() - timedelta(days=6)).isoformat()
    db(f"INSERT INTO employee_permissions (employer_id, employee_id, permission_date, from_time, to_time, minutes, reason, status) VALUES "
       f"({employer_id}, {employee_id}, '{tomorrow}', '15:00:00', '16:30:00', 90, 'Bank work - passbook update', 'Pending'), "
       f"({employer_id}, {employee_id}, '{last_week}', '10:00:00', '11:00:00', 60, 'Doctor appointment', 'Approved')")
    print("  2 request(s) added")
