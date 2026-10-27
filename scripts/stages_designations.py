"""Seed stage: the Designation Master (about 1,000 designations, ten industries) from scripts/fixtures/designations.json.

    python scripts/seed-demo.py designations        (or: npm run db:seed-designations)

The fixture is made from public/documents/Designation Master Structure.docx by `python -I scripts/parse-designations.py`. Safe to re-run: a designation that is
already in the shared master (same industry, group and name) is skipped, and nothing an administrator edited is overwritten. Then it links a few demo employees to a
designation so the employee screens show the link."""
import json
from pathlib import Path

from seed_lib import db, q1, section, sql_text

FIXTURE = Path(__file__).parent / "fixtures" / "designations.json"
COLUMNS = "(employer_id, industry_code, industry_name, group_name, designation_name, department, skill_level, level_inferred, nature_of_work, statutory_category, status, sort_order)"


def stage_designations():
    section("Designation Master")
    rows = json.loads(FIXTURE.read_text(encoding="utf-8"))["designations"]
    existing = {(r[0] or None, r[1] or None, r[2].lower()) for r in db(
        "SELECT COALESCE(industry_code, ''), COALESCE(group_name, ''), designation_name FROM designations WHERE employer_id IS NULL AND deleted_at IS NULL")}
    # mysql prints NULL as the text NULL; the query above turned NULLs into '' so both sides use None for "no value"
    todo = [r for r in rows if (r["industry_code"] or None, r["group_name"] or None, r["designation_name"].lower()) not in existing]
    for start in range(0, len(todo), 60):
        values = ",".join(
            f"(NULL, {sql_text(r['industry_code'])}, {sql_text(r['industry_name'])}, {sql_text(r['group_name'])}, {sql_text(r['designation_name'])}, {sql_text(r['department'])}, "
            f"{sql_text(r['skill_level'])}, {int(r['level_inferred'])}, {sql_text(r['nature_of_work'])}, {sql_text(r['statutory_category'])}, 'active', {int(r['sort_order'])})"
            for r in todo[start:start + 60])
        db(f"INSERT INTO designations {COLUMNS} VALUES {values}")
    total = q1("SELECT COUNT(*) FROM designations WHERE employer_id IS NULL AND deleted_at IS NULL")
    print(f"  {len(todo)} added, {len(rows) - len(todo)} already there; the shared master holds {total}")

    # a few demo employees point at a master designation of the same name (case-insensitive), so the link is visible
    linked = db("UPDATE employees e JOIN designations d ON d.employer_id IS NULL AND d.deleted_at IS NULL AND LOWER(d.designation_name) = LOWER(e.designation) "
                "SET e.designation_id = d.id WHERE e.designation_id IS NULL AND e.deleted_at IS NULL; SELECT ROW_COUNT()")
    print(f"  employees linked to a designation by name: {linked[0][0] if linked else 0}")
