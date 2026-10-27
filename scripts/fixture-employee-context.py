#!/usr/bin/env python3
"""Employee-suite context bootstrap.

The employee screens need an employer that has at least one unit and one
department; on a freshly seeded database there is none. This helper finds or
creates that context through the real admin API and prints shell assignments:

    eval "$(python3 scripts/fixture-employee-context.py)"
    # EMPLOYER_ID=1 UNIT_ID=1 DEPARTMENT_ID=1

It is idempotent: re-running reuses whatever already exists, so the suites can
call it on every run without leaving fixtures behind.
"""
import json
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3001").rstrip("/")
ADMIN = (__import__("os").environ.get("VERIFY_ADMIN_EMAIL", "admin@complianceos.local"), __import__("os").environ.get("VERIFY_ADMIN_PASSWORD", "Admin@2026"))

cookies: dict[str, str] = {}


def call(method: str, path: str, body: dict | None = None):
    headers = {"Cookie": "; ".join(f"{k}={v}" for k, v in cookies.items())}
    if method not in ("GET", "HEAD") and "cos_csrf" in cookies:
        headers["x-csrf-token"] = cookies["cos_csrf"]
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"

    request = urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request) as response:
            absorb(response)
            return response.status, json.loads(response.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as error:
        absorb(error)
        text = error.read().decode("utf-8", "replace")
        try:
            return error.code, json.loads(text)
        except json.JSONDecodeError:
            return error.code, {"raw": text}


def absorb(response):
    for header in response.headers.get_all("Set-Cookie") or []:
        pair = header.split(";")[0]
        if "=" in pair:
            key, value = pair.split("=", 1)
            cookies[key] = value


def fail(message: str):
    print(f"# {message}", file=sys.stderr)
    sys.exit(1)


status, payload = call("GET", "/api/auth/session")
status, payload = call("POST", "/api/auth/login", {"identifier": ADMIN[0], "password": ADMIN[1]})
if status not in (200, 201):
    fail(f"could not sign in: {status} {payload}")

# ── an employer ──────────────────────────────────────────────────────────────
status, payload = call("GET", "/api/admin/employers?limit=1&sortBy=created_at&sortDir=asc")
if status != 200:
    fail(f"could not list employers: {status} {payload}")

employer_id = 0
rows = payload.get("data") or []
if rows:
    employer_id = int(rows[0]["id"])
else:
    stamp = datetime.now().strftime("%Y%m%d%H%M%S")
    status, payload = call("POST", "/api/admin/employers", {
        "company_name": f"Verification Industries {stamp}",
        "employer_code": f"VER{stamp}",
        "industry_type": "Manufacturing",
        "company_type": "Private Limited",
        "email": f"hr.{stamp}@verification.example",
        "mobile": "9840012345",
        "address_line_1": "12, Industrial Estate",
        "city": "Chennai",
        "state": "Tamil Nadu",
        "pincode": "600032",
    })
    if status not in (200, 201):
        fail(f"could not create the fixture employer: {status} {payload}")
    employer_id = int(payload.get("employerId") or 0)

if not employer_id:
    fail("no employer id available")

# ── a unit ───────────────────────────────────────────────────────────────────
status, payload = call("GET", f"/api/admin/employers/{employer_id}")
if status != 200:
    fail(f"could not read the employer: {status} {payload}")

unit_id = int((payload.get("units") or [{}])[0].get("id") or 0) if payload.get("units") else 0
if not unit_id:
    status, unit_payload = call("POST", f"/api/admin/employers/{employer_id}/units", {
        "unit_name": "Head Office",
        "unit_code": "HO",
        "location": "Chennai",
        "state": "Tamil Nadu",
    })
    if status not in (200, 201):
        fail(f"could not create the fixture unit: {status} {unit_payload}")
    unit_id = int(unit_payload.get("unitId") or 0)

# ── a department inside that unit ────────────────────────────────────────────
department_id = 0
for department in payload.get("departments") or []:
    if int(department.get("unit_id") or 0) == unit_id:
        department_id = int(department["id"])
        break

if not department_id:
    status, department_payload = call("POST", f"/api/admin/employers/{employer_id}/departments", {
        "unit_id": unit_id,
        "department_name": "Administration",
        "department_code": "ADMIN",
    })
    if status not in (200, 201):
        fail(f"could not create the fixture department: {status} {department_payload}")
    department_id = int(department_payload.get("departmentId") or 0)

if not unit_id or not department_id:
    fail("no unit/department id available")

print(f"EMPLOYER_ID={employer_id} UNIT_ID={unit_id} DEPARTMENT_ID={department_id}")
