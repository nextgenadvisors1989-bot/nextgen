"""Times how long pages take to arrive, as each role, twice (cold, then warm): python scripts/time-pages.py

Shows where the app is slow without opening a browser. A page that is slow both times is slow on the server (a heavy query);
one that is slow only the first time is compiling (the dev server) or warming a cache."""
import sys
import time

sys.path.insert(0, __file__.rsplit("scripts", 1)[0] + "scripts")
from seed_lib import PASSWORDS, Session  # noqa: E402

PAGES = {
    ("demo.admin@complianceos.local", "admin"): ["/admin/dashboard", "/admin/employers", "/admin/employees", "/admin/audit-reports", "/admin/capar", "/admin/water-noc", "/admin/dynamic-modules", "/admin/users", "/admin/files", "/admin/cms/pages"],
    ("priya.auditor@demo.complianceos.local", "auditor"): ["/auditor/dashboard", "/auditor/audits", "/auditor/capar", "/auditor/modules"],
    ("karthik.auditor@demo.complianceos.local", "auditor"): ["/auditor/water-noc", "/auditor/water-noc/2"],
    ("balaji.hr@demo.complianceos.local", "employer"): ["/employer/dashboard", "/employer/employees", "/employer/payroll", "/employer/capar", "/employer/water-noc"],
    ("verifier.test@complianceos.local", "verifier"): ["/verifier/dashboard", "/verifier/capar"],
}
APIS = ["/api/capar", "/api/water-noc", "/api/auth/session"]


def timed(session, path):
    start = time.perf_counter()
    status, blob = session.send("GET", path, raw=True)
    return status, time.perf_counter() - start, len(blob)


rows, total_cold, total_warm = [], 0.0, 0.0
for (email, role), paths in PAGES.items():
    session = Session((email, PASSWORDS[role]))
    ok, detail = session.login()
    if not ok:
        print(f"cannot sign in as {email}: {detail}")
        continue
    for path in paths:
        status, cold, size = timed(session, path)
        _, warm, _ = timed(session, path)
        total_cold += cold
        total_warm += warm
        rows.append((role, path, status, cold, warm, size))
    if role in ("auditor", "employer", "admin"):
        for path in APIS:
            status, cold, size = timed(session, path)
            if status == 200:
                _, warm, _ = timed(session, path)
                rows.append((role, path, status, cold, warm, size))

print(f"{'role':9} {'path':34} {'http':>4} {'first':>8} {'second':>8} {'size':>8}")
for role, path, status, cold, warm, size in rows:
    flag = "  <-- slow" if warm > 1.0 else ""
    print(f"{role:9} {path:34} {status:>4} {cold:7.2f}s {warm:7.2f}s {size // 1024:6d} KB{flag}")
print(f"\n{len(rows)} requests. Pages: first visit {total_cold:.1f}s in total, repeat visit {total_warm:.1f}s in total.")
