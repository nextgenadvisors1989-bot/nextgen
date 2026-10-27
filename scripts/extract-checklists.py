#!/usr/bin/env python3
"""One-off extractor: turns the client's audit-requirement PDFs into checklist item lists.

The GOTS / GRS / OCS / RCS / RWS "Audit Requirements" sheets, the ETP document list, the factory-profile
register and the payroll checklist are lists of documents or questions an auditor ticks off. This reads
their text (pdftotext) and writes scripts/fixtures/client-checklists.json, which the form catalogue turns
into checklist forms. Re-run only if the source PDFs change.

Usage:  python scripts/extract-checklists.py "C:/Users/kisho/Desktop/Antony/Socio/source"
"""
import json
import re
import subprocess
import sys
from pathlib import Path

SRC = Path(sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\kisho\Desktop\Antony\Socio\source")
OUT = Path(__file__).resolve().parent / "fixtures" / "client-checklists.json"


def text_of(name):
    out = subprocess.run(["pdftotext", "-layout", str(SRC / name), "-"], capture_output=True, text=True, encoding="utf-8", errors="replace")
    return out.stdout


def clean(line):
    return re.sub(r"\s+", " ", line.replace("\ufffd", "").replace("\u2022", "-")).strip()


def requirement_items(name):
    """Document bullets after the 'Documents Name' column header of a standards requirement sheet."""
    lines = text_of(name).splitlines()
    start = next((i for i, line in enumerate(lines) if "Documents Name" in line), None)
    if start is None:
        return []
    items, current = [], None
    for raw in lines[start + 1:]:
        line = clean(raw)
        if not line:
            continue
        low = line.lower()
        if "additional document" in low or "falsification" in low or "any manual alteration" in low:
            continue
        if line.startswith("-"):
            if current:
                items.append(current)
            current = line.lstrip("- ").strip()
        elif current is not None and not line.startswith("*"):
            # wrapped continuation of the previous bullet, or an un-bulleted last entry
            current += " " + line
    if current:
        items.append(current)
    # a sheet's last un-bulleted lines (policies) arrive glued to the final bullet; split on sentence-case restarts
    cleaned = []
    for item in items:
        item = re.sub(r"\s+", " ", item)
        if len(item) > 420:
            item = item[:417] + "..."
        if len(item) > 6 and item not in cleaned:
            cleaned.append(item)
    return cleaned


def numbered_items(name, stop=None):
    """'1. Something' style lines, with lettered sub-items folded into their parent."""
    items = []
    for raw in text_of(name).splitlines():
        line = clean(raw)
        if not line:
            continue
        if re.match(r"^\d+\.\s", line):
            items.append(re.sub(r"^\d+\.\s*", "", line))
        elif re.match(r"^[a-j]\.\s", line) and items:
            items[-1] += "; " + re.sub(r"^[a-j]\.\s*", "", line)
        elif items and not line.endswith(":") and not line[0].isupper() and len(line) < 140:
            items[-1] += " " + line
    return items


def grouped_items(name):
    """Factory profile register: 'Heading:' lines followed by numbered entries."""
    groups, current = {}, None
    for raw in text_of(name).splitlines():
        line = clean(raw)
        if not line:
            continue
        if line.endswith(":") and not re.match(r"^\d", line):
            current = line.rstrip(":")
            groups[current] = []
        elif current and re.match(r"^\d+\.\s", line):
            groups[current].append(re.sub(r"^\d+\.\s*", "", line))
        elif current and groups[current] and not re.match(r"^\d", line):
            groups[current][-1] += " " + line
    return {k: v for k, v in groups.items() if v}


REQUIREMENT_SHEETS = {
    "gots_manufacturing": "GOTS Manufacturing - Audit Requirements.pdf",
    "gots_trading_storage": "GOTS Trading with storage.pdf",
    "gots_trading_nostorage": "GOTS Trading without storage - Audit Requirements.pdf",
    "grs_manufacturing": "GRS Manufacturing - Audit Requirements.pdf",
    "grs_trading_storage": "GRS Trading With storage - Audit Requirements.pdf",
    "grs_trading_nostorage": "GRS Trading without storage - Audit Requirements.pdf",
    "ocs_manufacturing": "OCS Manufacturing - Audit Requirements.pdf",
    "ocs_trading": "OCS trading - Audit Requirements.pdf",
    "rcs_manufacturing": "RCS Manufacturing - Audit Requirements.pdf",
    "rcs_trading": "RCS trading - Audit Requirements.pdf",
    "rws_manufacturing": "RWS Manufacturing - Audit Requirements.pdf",
    "rws_trading": "RWS trading - Audit Requirements.pdf",
}

result = {key: requirement_items(name) for key, name in REQUIREMENT_SHEETS.items()}
result["etp_documents"] = numbered_items("H&M_ETP Assessment Document List 1.pdf")
result["factory_profile"] = grouped_items("Factory Profile and Legal Register.pdf")
OUT.parent.mkdir(exist_ok=True)
OUT.write_text(json.dumps(result, indent=1, ensure_ascii=False), encoding="utf-8")
for key, value in result.items():
    print(f"{key:28s} {len(value) if isinstance(value, list) else {k: len(v) for k, v in value.items()}}")
