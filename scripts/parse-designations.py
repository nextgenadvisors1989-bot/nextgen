"""Reads public/documents/Designation Master Structure.docx and writes scripts/fixtures/designations.json.

    python -I scripts/parse-designations.py

The document lists ten industry sections (A to J) in three layouts: a numbered table (No | Designation | Department | Level | Nature of Work),
"Name - Department - Level - Nature" lines, and plain names under a level heading (or, in section J, under a function heading). Where the document
gives no level for a name, the level is worked out from the words of the name and the row is flagged `level_inferred` so the screen can say so.
Only the designation lists are read: the wage-mapping tables at the end are blank templates. Run it again after the document changes."""
import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "public" / "documents" / "Designation Master Structure.docx"
TARGET = ROOT / "scripts" / "fixtures" / "designations.json"
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"

LEVELS = ["Unskilled", "Semi-skilled", "Skilled", "Supervisory", "Junior Executive", "Senior Executive", "Chief Executive"]
LEVEL_HEADINGS = {"Unskilled": "Unskilled", "Skilled": "Skilled", "Semi-skilled": "Semi-skilled", "Supervisory": "Supervisory"}
MIXED_HEADINGS = {"Supervisory / Executive", "Executive / Senior / Chief", "Semi-skilled / Supervisory", "Executive / Management", "Production / Sewing / Cutting"}
J_HEADINGS = {
    "HR / Industrial Relations", "Payroll / Labour Compliance", "EHS / Safety", "Environment", "Quality", "Maintenance", "Stores / Warehouse", "Procurement", "Finance / Accounts",
    "Administration", "Security / Fire", "Transport / Logistics", "Production Planning", "Engineering / Projects", "Legal / Statutory", "Sustainability / ESG", "GHG / Carbon Management",
    "Occupational Health", "Training", "Internal Audit / Management Systems", "Information Technology / MIS", "Sales / Commercial", "Merchandising", "R&D / Technical", "Utility / Energy",
    "Fire / Emergency / Disaster Management", "Contractor Management", "Social Compliance", "Industrial Relations", "Labour Welfare", "Corporate Sustainability / CSR",
    "Operations Management", "Manufacturing Management", "Plant Management", "Corporate Executive", "Chief Executive Level",
}
STATUTORY = {"Unskilled": "As per notification", "Semi-skilled": "As per notification", "Skilled": "As per notification", "Supervisory": "Check applicability",
             "Junior Executive": "Check applicability", "Senior Executive": "Check applicability", "Chief Executive": "Contract / appointment basis"}


def infer_level(name: str) -> str:
    n = name.lower()
    if re.search(r"\bchief\b|\bhead\b|director|\bceo\b|\bcoo\b|president", n):
        return "Chief Executive"
    if re.search(r"general manager|\bmanager\b|senior (?:\w+ )*executive", n):
        return "Senior Executive"
    if re.search(r"supervisor|foreman|charge ?hand", n):
        return "Supervisory"
    if re.search(r"executive|officer|coordinator|engineer|analyst|specialist|programmer|chemist|scientist|planner|designer", n):
        return "Junior Executive"
    if re.search(r"assistant|clerk|trainee|storekeeper|cashier|receptionist", n):
        return "Semi-skilled"
    if re.search(r"helper|worker|labourer|cleaner|watcher|loader|sweeper", n):
        return "Unskilled"
    return "Skilled"


def normal_level(text: str) -> str | None:
    t = text.strip().lower()
    table = {"unskilled": "Unskilled", "semi-skilled": "Semi-skilled", "skilled": "Skilled", "supervisory": "Supervisory", "junior executive": "Junior Executive",
             "senior executive": "Senior Executive", "chief executive": "Chief Executive"}
    return table.get(t)


def read_lines() -> list[str]:
    root = ET.fromstring(zipfile.ZipFile(SOURCE).read("word/document.xml"))
    body = root.find(W + "body")
    text = lambda p: "".join((r.text or "") for r in p.iter(W + "t"))  # noqa: E731
    out: list[str] = []
    for el in body:
        if el.tag == W + "p":
            if text(el).strip():
                out.append(text(el).strip())
        elif el.tag == W + "tbl":
            for tr in el.iter(W + "tr"):
                out.append(" | ".join(" ".join(text(p) for p in tc.iter(W + "p")).strip() for tc in tr.findall(W + "tc")))
    return out


def main() -> None:
    lines = read_lines()
    end = next(i for i, l in enumerate(lines) if l.startswith("Minimum-Wage Master"))
    rows: list[dict] = []
    claims: dict[str, int] = {}
    code = name = None
    level_heading: str | None = None
    group: str | None = None
    order = 0

    def add(designation, department=None, level=None, nature=None, grp=None):
        nonlocal order
        order += 1
        explicit = normal_level(level) if level else None
        resolved = explicit or level_heading or infer_level(designation)
        rows.append({"industry_code": code, "industry_name": name, "group_name": grp or group, "designation_name": designation.strip(), "department": (department or "").strip() or None,
                     "skill_level": resolved, "level_inferred": 0 if (explicit or level_heading) else 1, "nature_of_work": (nature or "").strip() or None,
                     "statutory_category": STATUTORY[resolved], "sort_order": order})

    for line in lines[:end]:
        m = re.match(r"^([A-J])\. (.+?) — (\d+) Designations$", line)
        if m:
            code, name = m.group(1), m.group(2)
            claims[code] = int(m.group(3))
            level_heading, group = None, None
            continue
        if code is None or line.startswith(("Line |", "Line ", "Do not automatically", "Wage mapping", "Because ", "To bring ", "No. |")):
            continue
        if re.match(r"^\d+ \| ", line):
            _, designation, department, level, nature = [c.strip() for c in line.split("|")][:5]
            add(designation, department, level, nature, group)
            continue
        if code == "J":
            if line in J_HEADINGS:
                group = line
                continue
            add(line, department=group, grp=group)
            continue
        if line in LEVEL_HEADINGS:
            level_heading, group = LEVEL_HEADINGS[line], None
            continue
        if line in MIXED_HEADINGS:
            level_heading, group = None, line
            continue
        parts = [p.strip() for p in re.split(r"\s+[—–]\s+", line)]
        if len(parts) >= 4:
            add(parts[0], parts[1], parts[2], " - ".join(parts[3:]))
        elif len(parts) == 2:
            add(parts[0], None, parts[1])
        else:
            add(parts[0])

    # the same name twice in the same industry and group is one designation
    seen, unique = set(), []
    for row in rows:
        key = (row["industry_code"], row["group_name"], row["designation_name"].lower())
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(json.dumps({"source": SOURCE.name, "levels": LEVELS, "designations": unique}, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"{len(unique)} designations written to {TARGET.relative_to(ROOT)} ({len(rows) - len(unique)} exact duplicates dropped)")
    for c in sorted(claims):
        found = sum(1 for r in unique if r["industry_code"] == c)
        print(f"  {c}  document says {claims[c]:4d}  found {found:4d}  {'' if found == claims[c] else '<-- differs'}")
    print(f"  total document says {sum(claims.values())}, found {len(unique)}; level inferred from the name for {sum(r['level_inferred'] for r in unique)}")


if __name__ == "__main__":
    sys.exit(main())
