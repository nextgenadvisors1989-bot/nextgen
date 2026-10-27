#!/usr/bin/env python3
"""Walks every sidebar link of every panel as its own role and reports anything
that fails to render a real page.

Reuses the verification suite's Session so the cookie/CSRF handling is the same
one the suite proves works. A page passes when it answers 200 and the HTML shows
no Next.js error overlay and is not the framework's not-found document.

Usage:  python3 scripts/smoke-panels.py [base_url]
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from importlib import import_module

suite = import_module("verify-selfservice")
Session, BASE = suite.Session, suite.BASE

LOGINS = {
    "admin": (__import__("os").environ.get("VERIFY_ADMIN_EMAIL", "admin@complianceos.local"), __import__("os").environ.get("VERIFY_ADMIN_PASSWORD", "Admin@2026")),
    "auditor": ("auditor.test@complianceos.local", "Auditor@2026"),
    "verifier": ("verifier.test@complianceos.local", "Verifier@2026"),
    "employer": ("employer.test@complianceos.local", "Employer@2026"),
}
BAD_MARKERS = ("__next_error__", "server-side exception", "Internal Server Error", "Application error")


def menu_paths(prefix):
    text = Path("components/navigation/sidebar-menus.tsx").read_text()
    return sorted({href for href in re.findall(r"href: '(/[^']*)'", text) if href.startswith(prefix)})


def main():
    failures = []
    total = 0
    for panel, creds in LOGINS.items():
        session = Session(creds)
        signed_in, detail = session.login()
        if not signed_in:
            print(f"{panel}: SIGN-IN FAILED {detail}")
            failures.append((panel, "*", "sign-in"))
            continue

        paths = menu_paths(f"/{panel}")
        ok = 0
        for path in paths:
            status, body, _ = session._send("GET", path, None, True)
            text = body.decode("utf-8", "replace") if isinstance(body, bytes) else str(body)
            total += 1
            problem = None
            if status != 200:
                problem = f"HTTP {status}"
            else:
                marker = next((m for m in BAD_MARKERS if m in text), None)
                # Next embeds its not-found chunk in every page; only a real
                # not-found response lacks the page's own app chunk.
                if marker:
                    problem = f"error overlay: {marker}"
                elif "This page could not be found" in text and "/_next/static/chunks/app" not in text:
                    problem = "not-found page served"
            if problem:
                failures.append((panel, path, problem))
            else:
                ok += 1
        print(f"{panel:9s} {ok}/{len(paths)} pages rendered")

    print(f"\n{total - len(failures)}/{total} pages rendered")
    if failures:
        print("\nFailures:")
        for panel, path, problem in failures:
            print(f"  • [{panel}] {path} — {problem}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
