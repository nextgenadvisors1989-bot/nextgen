"""Builds scripts/fixtures/evidence-checklist.json (the employer's pre-audit document checklist) from the client's
"Factory Profile and Legal Register.docx".

    python -I scripts/parse-evidence-checklist.py "<path to the docx>"

Only the clean opening part of that document is used: the Factory Profile list (Factory Profile, Recruitment/Hiring & Termination,
Wages & Benefits, Employee Treatment & Involvement, Health & Safety, Management Systems), the SA8000 list (A to E) and the BSCI list.
The rest of the file (garment checklist, the Legal Register) repeats content or is a different register and is handled separately.
Run with `python -I` because the docx is untrusted input."""
import json
import re
import sys
import zipfile
from pathlib import Path

OUT = Path(__file__).parent / "fixtures" / "evidence-checklist.json"

# heading text as printed in the document -> (section, group)
HEADINGS = {
    "Factory Profile:": ("Factory Profile", None),
    "Recruitment/Hiring & Termination": ("Recruitment / Hiring & Termination", None),
    "Wages & Benefits": ("Wages & Benefits", None),
    "Employee Treatment & Involvement:": ("Employee Treatment & Involvement", None),
    "Health & Safety:": ("Health & Safety", None),
    "Management Systems:": ("Management Systems", None),
    "A) License/ Certificates:": ("SA8000", "A) Licences & certificates"),
    "B) Wages & Personnel Record:": ("SA8000", "B) Wages & personnel records"),
    "C) Registers:": ("SA8000", "C) Registers"),
    "D) Training Reqister:": ("SA8000", "D) Training register"),
    "E) Other Certificate": ("SA8000", "E) Other certificates"),
    "BSCI Audit DOCUMENTS PARTICULAR": ("BSCI", None),
}
STOP = {"SA8000"}  # a bare label line, not an item


def paragraphs(path):
    xml = zipfile.ZipFile(path).read("word/document.xml").decode("utf8")
    for p in re.findall(r"<w:p[ >].*?</w:p>", xml, flags=re.S):
        text = "".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", p))
        yield re.sub(r"\s+", " ", text.replace("&amp;", "&")).strip()


def strip_number(line):
    return re.sub(r"^\d{1,2}\s*[.)]\s*", "", line).strip()


def split_merged(line):
    # "42. Fuel consumption ... 43. Green House Gases" arrives as one paragraph
    parts = re.split(r"(?<=[.\w)])\s+(?=\d{1,2}\.\s+[A-Z])", line)
    return [p for p in parts if p.strip()]


def main(src):
    sections = []
    index = {}
    current = None
    started = False
    for line in paragraphs(src):
        if not line:
            continue
        if line in HEADINGS:
            if started and line == "Factory Profile:":
                break  # the second copy of the list further down the file
            started = True
            name, group = HEADINGS[line]
            section = index.setdefault(name, {"name": name, "items": []})
            if section not in sections:
                sections.append(section)
            current = (section, group)
            continue
        if not started or current is None:
            continue
        if re.match(r"^(Compliance Checklist|Statutory Registers|Form \d|D\) Training Register;)", line):
            break  # a second copy of the SA8000 list, then the garment checklist: not part of this list
        if line in STOP or re.match(r"^(\d\)\s*)?Others:?$", line) or re.match(r"^\d{1,2}\)\s*[A-Z][a-z]+ (Register|register)[;:]$", line):
            continue
        for piece in split_merged(line):
            text = strip_number(piece).replace("orientatior", "orientation")
            if not text or len(text) < 3:
                continue
            section, group = current
            if section["items"] and text[0].islower():
                section["items"][-1]["name"] += " " + text  # a wrapped line
                continue
            if any(i["name"].lower() == text.lower() and i["group"] == group for i in section["items"]):
                continue
            section["items"].append({"group": group, "name": text})
    for sort, section in enumerate(sections, start=1):
        section["sort_order"] = sort * 10
        for n, item in enumerate(section["items"], start=1):
            item["sort_order"] = n * 10
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps({"source": "Factory Profile and Legal Register.docx", "sections": sections}, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"{len(sections)} sections, {sum(len(s['items']) for s in sections)} items")
    for s in sections:
        print(f"  {s['name']}: {len(s['items'])}")


if __name__ == "__main__":
    main(sys.argv[1])
