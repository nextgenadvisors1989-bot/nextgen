"""Downloads one PDF as a role: python scripts/fetch-pdf.py <role> <path> <out.pdf>   (role: admin, auditor, employer, employee, verifier)"""
import sys

sys.path.insert(0, __file__.rsplit("scripts", 1)[0] + "scripts")
from seed_lib import PASSWORDS, Session  # noqa: E402

LOGINS = {"admin": "demo.admin@complianceos.local", "auditor": "priya.auditor@demo.complianceos.local", "employer": "balaji.hr@demo.complianceos.local",
          "employee": "employee.test@complianceos.local", "verifier": "verifier.test@complianceos.local"}
role, path, out = sys.argv[1:4]
session = Session((LOGINS[role], PASSWORDS[role]))
ok, detail = session.login()
if not ok:
    sys.exit(f"cannot sign in: {detail}")
status, blob = session.send("GET", path, raw=True)
if status != 200 or blob[:4] != b"%PDF":
    sys.exit(f"HTTP {status}: {blob[:200]!r}")
open(out, "wb").write(blob)
print(f"saved {len(blob)} bytes")
