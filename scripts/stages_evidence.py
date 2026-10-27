"""Seed stage: the employer pre-audit document checklist (sections and items) from scripts/fixtures/evidence-checklist.json.

    python scripts/seed-demo.py evidence        (or: npm run db:seed-evidence)

The fixture is made from the client's "Factory Profile and Legal Register.docx" by `python -I scripts/parse-evidence-checklist.py`.
Safe to re-run: a section or item that already exists (same name) is left alone, so nothing an administrator edited is overwritten.
Every active auditor is then given every section, so the demo flow works; the administrator narrows it per auditor."""
import json
from pathlib import Path

from seed_lib import db, q1, section, sql_text

FIXTURE = Path(__file__).parent / "fixtures" / "evidence-checklist.json"


def stage_evidence():
    section("Evidence checklist")
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))["sections"]
    sections_added = items_added = 0
    for sec in data:
        sid = q1(f"SELECT id FROM evidence_sections WHERE name = {sql_text(sec['name'])} AND deleted_at IS NULL")
        if not sid:
            db(f"INSERT INTO evidence_sections (name, sort_order) VALUES ({sql_text(sec['name'])}, {int(sec['sort_order'])})")
            sid = q1(f"SELECT id FROM evidence_sections WHERE name = {sql_text(sec['name'])} AND deleted_at IS NULL")
            sections_added += 1
        have = {(r[0] or "", r[1].lower()) for r in db(f"SELECT COALESCE(group_name, ''), name FROM evidence_items WHERE section_id = {sid} AND deleted_at IS NULL")}
        todo = [i for i in sec["items"] if ((i["group"] or ""), i["name"].lower()) not in have]
        for start in range(0, len(todo), 60):
            values = ",".join(f"({sid}, {sql_text(i['group'])}, {sql_text(i['name'])}, {int(i['sort_order'])})" for i in todo[start:start + 60])
            db(f"INSERT INTO evidence_items (section_id, group_name, name, sort_order) VALUES {values}")
        items_added += len(todo)
    total = q1("SELECT COUNT(*) FROM evidence_items WHERE deleted_at IS NULL")
    print(f"  {sections_added} sections and {items_added} items added; the checklist holds {total} items")
    db("INSERT IGNORE INTO auditor_evidence_sections (auditor_id, section_id) "
       "SELECT a.id, s.id FROM auditors a CROSS JOIN evidence_sections s WHERE a.deleted_at IS NULL AND s.deleted_at IS NULL")
    print(f"  auditors with access to sections: {q1('SELECT COUNT(DISTINCT auditor_id) FROM auditor_evidence_sections')}")
