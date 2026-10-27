#!/usr/bin/env python3
"""Follows every internal link found on a panel's own pages and reports the ones
that do not resolve.

`smoke-panels.py` answers "does each sidebar destination render?". This answers
the next question: "do the links *inside* those pages go anywhere?" A register
whose rows point at a route that was never built still renders a green page, so
the two sweeps together are what prove the panels are navigable.

Links carrying an id (a numeric or uuid segment) are reported separately from
fixed destinations: a scoped record may legitimately refuse or hide itself from
the signed-in role, but a fixed path must resolve.

Usage:  python3 scripts/smoke-links.py [base_url]
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
SKIP_PREFIXES = ("/api/", "/_next/", "/login", "/logout", "/verify", "/uploads/", "/files/", "/s/")
DYNAMIC = re.compile(r"^(?:\d+|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|[A-Za-z0-9_-]{16,})$")
BAD_MARKERS = ("__next_error__", "server-side exception", "Internal Server Error", "Application error")


def menu_paths(prefix):
    text = Path("components/navigation/sidebar-menus.tsx").read_text()
    return sorted({href for href in re.findall(r"href: '(/[^']*)'", text) if href.startswith(prefix)})


def links_on(session, path):
    status, body, _ = session._send("GET", path, None, True)
    if status != 200:
        return set()
    text = body.decode("utf-8", "replace") if isinstance(body, bytes) else str(body)
    found = set()
    for href in re.findall(r'href="(/[^"?#]*)"', text):
        href = href.rstrip("/") or "/"
        if href.startswith(SKIP_PREFIXES):
            continue
        found.add(href)
    return found


def main():
    static_failures = []
    scoped = []
    checked = 0
    for panel, creds in LOGINS.items():
        session = Session(creds)
        signed_in, detail = session.login()
        if not signed_in:
            print(f"{panel}: SIGN-IN FAILED {detail}")
            return 1

        prefix = f"/{panel}"
        links = set()
        for page in menu_paths(prefix):
            links |= links_on(session, page)

        own = sorted(link for link in links if link == prefix or link.startswith(prefix + "/"))
        fixed = [link for link in own if not any(DYNAMIC.match(seg) for seg in link.split("/"))]
        dynamic = [link for link in own if link not in fixed]
        ok = 0

        for link in fixed:
            checked += 1
            status, body, _ = session._send("GET", link, None, True)
            text = body.decode("utf-8", "replace") if isinstance(body, bytes) else str(body)
            why = None
            if status != 200:
                why = f"HTTP {status}"
            elif any(marker in text for marker in BAD_MARKERS):
                why = "error overlay"
            elif "This page could not be found" in text and "/_next/static/chunks/app" not in text:
                why = "not-found page served"
            if why:
                static_failures.append((panel, link, why))
            else:
                ok += 1

        for link in dynamic:
            status, _, _ = session._send("GET", link, None, True)
            scoped.append((panel, link, status))

        served = sum(1 for row in scoped if row[2] == 200)
        served -= 0  # counts below are per panel
        print(
            f"{panel:9s} {ok}/{len(fixed)} fixed links resolve  ·  "
            f"{len(dynamic)} scoped links followed ({sum(1 for row in scoped if row[0] == panel and row[2] == 200)} answered 200)"
        )

    print(f"\n{checked - len(static_failures)}/{checked} fixed links resolve")
    if static_failures:
        print("\nBroken destinations:")
        for panel, link, why in static_failures:
            print(f"  • [{panel}] {link} — {why}")

    odd = [row for row in scoped if row[2] not in (200, 307, 403)]
    if odd:
        print("\nScoped links worth a look (404/500 means the record or route is missing):")
        for panel, link, status in odd:
            print(f"  • [{panel}] {link} — HTTP {status}")
    return 1 if static_failures or odd else 0


if __name__ == "__main__":
    sys.exit(main())
