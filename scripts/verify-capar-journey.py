"""The whole life of a CAPAR report, end to end through the API, with every role that takes part.

    python scripts/verify-capar-journey.py       (server on http://127.0.0.1:3001 with the demo data seeded)

It runs scripts/seed-live-demo-report.py under a throw-away title: the auditor starts the report from an assigned audit, ticks
categories, records findings with photos, signs and submits; the employer replies and answers every issue with proof and a
signature; the auditor declines one answer, approves the rest; the employer answers that one again and the report closes.
Every step of that script checks its own result and stops on the first failure. The report is removed afterwards.
Exit code 1 if the journey fails."""
import os
import subprocess
import sys

HERE = __file__.rsplit("scripts", 1)[0]
sys.path.insert(0, HERE + "scripts")
from seed_lib import PASSWORDS, db  # noqa: E402

TITLE = "ZZ TEST CAPAR journey"
ENV = dict(os.environ, SAMPLE_TITLE=TITLE,
           AUDITOR_EMAIL=os.environ.get("JOURNEY_AUDITOR_EMAIL", "priya.auditor@demo.complianceos.local"),
           AUDITOR_PASSWORD=os.environ.get("JOURNEY_AUDITOR_PASSWORD", PASSWORDS["auditor"]),
           EMPLOYER_EMAIL=os.environ.get("JOURNEY_EMPLOYER_EMAIL", "greenfield.hr@demo.complianceos.local"),
           EMPLOYER_PASSWORD=os.environ.get("JOURNEY_EMPLOYER_PASSWORD", PASSWORDS["employer"]),
           PYTHONIOENCODING="utf-8")

db(f"DELETE FROM capar_reports WHERE title = '{TITLE}'")
run = subprocess.run([sys.executable, HERE + "scripts/seed-live-demo-report.py"], env=ENV, capture_output=True, text=True, encoding="utf-8")
print(run.stdout[-1800:])
if run.returncode != 0:
    print(run.stderr[-800:])
status = db(f"SELECT status FROM capar_reports WHERE title = '{TITLE}'")
ok = run.returncode == 0 and bool(status) and status[0][0] == "Approved"
db(f"DELETE FROM capar_reports WHERE title = '{TITLE}'")
print("RESULT: the CAPAR journey " + ("completed and the report closed as Approved" if ok else "FAILED"))
sys.exit(0 if ok else 1)
