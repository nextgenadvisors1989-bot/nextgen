#!/usr/bin/env python3
"""Walks every link in the employee panel as a real employee and reports anything
that fails to render.

The other sweeps stop at the four back-office panels: `smoke-panels.py` carries
static credentials for admin / auditor / verifier / employer, and an employee
account only exists while the self-service suite is running. So the panel an
actual worker signs into had no sweep of its own. This script builds a small
company with a portal-less HR record, hires one employee with a login, completes
the forced first-login password change, opens every `/employee/...` destination
the sidebar advertises, and then removes the fixture it created — reusing the
suite's own fixture and clean-up helpers so the two never disagree.

Usage:  python3 scripts/smoke-employee-panel.py [base_url]
Assumes migrations + seeds are loaded and the server is running.
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from importlib import import_module

suite = import_module("verify-selfservice")
Session = suite.Session
activate = suite.activate
db = suite.db
sweep_stale = suite.sweep_stale
create_company = suite.create_company
create_unit = suite.create_unit
create_department = suite.create_department
create_employee = suite.create_employee
EMPLOYEE_EMAIL = suite.EMPLOYEE_EMAIL
FIXTURE = suite.FIXTURE
STAMP = suite.STAMP

KEY = "empwalk"
BAD_MARKERS = ("__next_error__", "server-side exception", "Internal Server Error", "Application error")


def menu_paths(prefix):
    text = Path("components/navigation/sidebar-menus.tsx").read_text()
    return sorted({href for href in re.findall(r"href: '(/[^']*)'", text) if href.startswith(prefix)})


def main():
    failures = []
    admin = Session()
    signed_in, detail = admin.login((__import__("os").environ.get("VERIFY_ADMIN_EMAIL", "admin@complianceos.local"), __import__("os").environ.get("VERIFY_ADMIN_PASSWORD", "Admin@2026")))
    if not signed_in:
        print(f"admin sign-in failed: {detail}")
        return 1

    employer_id, detail = create_company(admin, KEY, "Walk", with_login=False, code_suffix="W")
    if not employer_id:
        print(f"could not create the fixture company: {detail}")
        return 1
    unit_id, detail = create_unit(admin, KEY)
    if not unit_id:
        print(f"could not create the fixture unit: {detail}")
        sweep_stale()
        return 1
    department_id, detail = create_department(admin, KEY, unit_id)
    if not department_id:
        print(f"could not create the fixture department: {detail}")
        sweep_stale()
        return 1

    employee_id, detail = create_employee(admin, KEY, "Walk", with_login=True)
    if not employee_id:
        print(f"could not hire the fixture employee: {detail}")
        sweep_stale()
        return 1
    credentials = suite.CREDENTIALS.get("employee")
    if not credentials:
        print("the hire returned no temporary password, so the panel cannot be reached")
        sweep_stale()
        return 1

    employee = Session()
    signed_in, detail = employee.login(credentials)
    if not signed_in:
        print(f"the employee's new login did not work: {detail}")
        sweep_stale()
        return 1
    password, detail = activate(employee, *credentials)
    if not password:
        print(f"the employee could not complete first-login activation: {detail}")
        sweep_stale()
        return 1

    paths = menu_paths("/employee")
    for path in paths:
        status, body, _ = employee._send("GET", path, None, True)
        text = body.decode("utf-8", "replace") if isinstance(body, bytes) else str(body)
        problem = None
        if status != 200:
            problem = f"HTTP {status}"
        else:
            marker = next((m for m in BAD_MARKERS if m in text), None)
            # Next embeds its not-found chunk in every page; only a real
            # not-found response lacks the page's own app chunk.
            if marker:
                problem = f"error overlay: {marker}"
            elif "This page could not be found" in text and "/_next/static/chunks/app" not in text:
                problem = "not-found page served"
        if problem:
            failures.append(f"{path} — {problem}")
            print(f"  ✗ {path} {problem}")

    employee.sign_out()
    sweep_stale()
    leftover = db(f"SELECT COUNT(*) FROM users WHERE email = '{EMPLOYEE_EMAIL}';")
    removed = bool(leftover) and leftover[0][0] == "0"

    print(f"\nemployee {len(paths) - len(failures)}/{len(paths)} pages rendered"
          f"  ·  fixture removed: {'yes' if removed else 'NO'}")
    if failures:
        print("\nBroken destinations:")
        for entry in failures:
            print(f"  • {entry}")
    return 0 if not failures and removed else 1


if __name__ == "__main__":
    sys.exit(main())
