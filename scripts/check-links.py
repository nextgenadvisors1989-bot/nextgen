#!/usr/bin/env python3
"""Static link audit: every internal path the code navigates to (sidebar hrefs, <Link href>,
router.push, redirect, notification actionUrl) must resolve to an App Router page.

Dynamic segments match any value, so `/employer/audits/${id}` matches `/employer/audits/[assignmentId]`.
Usage:  python scripts/check-links.py
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

routes = []
for page in (ROOT / "app").rglob("page.tsx"):
    rel = page.parent.relative_to(ROOT / "app").as_posix()
    rel = "/" + "/".join(part for part in rel.split("/") if not (part.startswith("(") and part.endswith(")")))
    routes.append((rel, None))


def exists(path):
    path = path.split("?")[0].split("#")[0]
    path = re.sub(r"\$\{[^}]*\}", "X", path)
    if path in ("", "/"):
        return True
    for rel, _ in routes:
        template = re.sub(r"\[\.\.\.[^\]]+\]", ".+", re.sub(r"\[[^\]/]+\]", "[^/]+", rel))
        if re.fullmatch(template, path.rstrip("/") or "/"):
            return True
    return False


INTERNAL = ("/admin", "/employer", "/employee", "/auditor", "/verifier", "/login", "/change-password", "/search")
PATTERNS = [
    r"actionUrl:\s*[`'\"]([^`'\"]+)[`'\"]",
    r"href[=:]\s*\{?[`'\"]([^`'\"]+)[`'\"]",
    r"router\.(?:push|replace)\(\s*[`'\"]([^`'\"]+)[`'\"]",
    r"redirect\(\s*[`'\"]([^`'\"]+)[`'\"]",
    r"redirectBase=[`'\"]([^`'\"]+)[`'\"]",
]
bad = {}
for base in ("app", "components", "services", "lib"):
    for file in (ROOT / base).rglob("*.ts*"):
        if "/api/" in file.as_posix():
            continue
        text = file.read_text(encoding="utf-8", errors="ignore")
        for pattern in PATTERNS:
            for match in re.finditer(pattern, text):
                target = match.group(1)
                if not target.startswith(INTERNAL) or target.startswith("/api"):
                    continue
                if not exists(target):
                    bad.setdefault(target, set()).add(file.relative_to(ROOT).as_posix())

for target, files in sorted(bad.items()):
    print(f"✗ {target}\n    in {', '.join(sorted(files))[:200]}")
print(f"\n{len(bad)} dead internal link(s)")
sys.exit(1 if bad else 0)
