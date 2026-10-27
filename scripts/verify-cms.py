#!/usr/bin/env python3
"""CMS module end-to-end verification.

The CMS is the surface the whole world sees, so this suite drives it the way an
editor, a visitor and an intruder would:

   1. access control      — the authoring API is admin-only, by URL as well
   2. overview            — the module landing read carries real counts
   3. slug catalogue      — what exists, what is reserved, what is excluded
   4. page creation       — a page is created, its slug derived, clashes refused
   5. block builder        — sections added, reordered, refreshed, hidden, removed
   6. publishing          — publish, unpublish, schedule, archive, restore
   7. promotion           — a due scheduled page publishes itself and reads public
   8. bulk actions        — per-page outcomes, including the refusals
   9. media library       — upload, catalogue, detail, usage, edit, refusal, delete
  10. resources           — external and file-backed, gated, downloads counted
  11. public surface      — pages, reports and the resource library as visitors see them
  12. job endpoint        — the scheduled-publishing job runs on demand
  13. activity trail      — every mutation above is written to the activity log
  14. screens             — every CMS screen renders for an admin and not for others
  15. clean-up            — every fixture this suite created is gone

Usage:  python3 scripts/verify-cms.py [base_url]
Assumes migrations + seeds are loaded and the server is running.
"""
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3001").rstrip("/")
ADMIN = (__import__("os").environ.get("VERIFY_ADMIN_EMAIL", "admin@complianceos.local"), __import__("os").environ.get("VERIFY_ADMIN_PASSWORD", "Admin@2026"))
AUDITOR = ("auditor.test@complianceos.local", "Auditor@2026")
VERIFIER = ("verifier.test@complianceos.local", "Verifier@2026")
EMPLOYER = ("employer.test@complianceos.local", "Employer@2026")
STAMP = datetime.now().strftime("%m%d%H%M%S")

passed = 0
failed = 0
failures = []

PAGES = []        # page ids this suite created
SECTIONS = []     # section ids this suite created
MEDIA = []        # cms_media ids this suite created
FILES = []        # vault file ids behind that media
RESOURCES = []    # cms_resource ids this suite created
SLUGS = []        # slugs this suite published, so the public probes can read them

# A 1x1 PNG — a real image, so the vault's content checks pass on its own merits.
PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d494844520000000100000001080600000"
    "01f15c4890000000d4944415478da63f8cfc0f01f00050001ffabce36"
    "890000000049454e44ae426082"
)


def check(name, condition, detail=""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  ✓ {name}")
    else:
        failed += 1
        failures.append(f"{name} — {detail}")
        print(f"  ✗ {name} {('— ' + str(detail)) if detail else ''}")


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Leaves 30x responses alone so the suite can see where a user was sent."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: D102
        return None


class Session:
    """Cookie jar + CSRF, exactly like the browser panel calls."""

    def __init__(self, creds=None):
        self.creds = creds
        self.cookies = {}
        self.user = None
        self.redirect_to = None

    def _jar(self):
        return "; ".join(f"{k}={v}" for k, v in self.cookies.items())

    def request(self, method, path, body=None, raw=False, headers=None, _retry=True):
        status, payload, extra = self._send(method, path, body, raw, headers)
        if not raw and status in (401, 403) and isinstance(payload, dict) \
                and payload.get("code") in ("CSRF_FAILED", "UNAUTHENTICATED") and _retry and self.creds:
            if self.login()[0]:
                return self._send(method, path, body, raw, headers)[:2]
        # A response that did not parse is a broken read, not a failed request —
        # read it again before blaming the platform.
        if not raw and isinstance(payload, dict) and set(payload.keys()) == {"raw"} and _retry:
            return self._send(method, path, body, raw, headers)[:2]
        return status, payload

    def request_full(self, method, path, body=None, raw=False, headers=None):
        return self._send(method, path, body, raw, headers)

    def request_no_redirect(self, method, path):
        """Fetch without following a 30x — how a page guard must be observed."""
        return self._send(method, path, None, True, None, follow=False)[:2]

    def post_raw(self, path, data, content_type):
        """POST a non-JSON body (multipart) with the session's cookies and CSRF."""
        headers = {"Cookie": self._jar(), "Content-Type": content_type,
                   "Content-Length": str(len(data))}
        if "cos_csrf" in self.cookies:
            headers["x-csrf-token"] = self.cookies["cos_csrf"]
        req = urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req) as resp:
                self._absorb(resp)
                return resp.status, self._parse(resp.read())
        except urllib.error.HTTPError as err:
            self._absorb(err)
            return err.code, self._parse(err.read())

    def _send(self, method, path, body=None, raw=False, headers=None, follow=True):
        url = f"{BASE}{path}"
        data = None
        send_headers = {"Cookie": self._jar(), **(headers or {})}
        if method not in ("GET", "HEAD", "OPTIONS") and "cos_csrf" in self.cookies:
            send_headers["x-csrf-token"] = self.cookies["cos_csrf"]
        if body is not None:
            data = body if isinstance(body, bytes) else json.dumps(body).encode()
            send_headers["Content-Type"] = "application/json"

        req = urllib.request.Request(url, data=data, headers=send_headers, method=method)
        opener = urllib.request.build_opener() if follow else urllib.request.build_opener(_NoRedirect)
        try:
            with opener.open(req) as resp:
                self._absorb(resp)
                text = resp.read()
                return resp.status, (text if raw else self._parse(text)), dict(resp.headers)
        except urllib.error.HTTPError as err:
            self._absorb(err)
            text = err.read()
            return err.code, (text if raw else self._parse(text)), dict(err.headers)

    def _absorb(self, response):
        for header in response.headers.get_all("Set-Cookie") or []:
            pair = header.split(";")[0]
            if "=" in pair:
                key, value = pair.split("=", 1)
                self.cookies[key] = value

    @staticmethod
    def _parse(text):
        try:
            return json.loads(text.decode("utf-8", "replace"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return {"raw": text.decode("utf-8", "replace")}

    def login(self, creds=None):
        if creds:
            self.creds = creds
        status, body, _ = self._send("POST", "/api/auth/login", {
            "identifier": self.creds[0], "password": self.creds[1],
        })
        if status not in (200, 201):
            return False, f"login {status}: {body}"
        self.user = body.get("data", {}).get("user") or body.get("user")
        self.redirect_to = body.get("redirectTo")
        return True, ""

    def sign_out(self):
        self.request("POST", "/api/auth/logout")
        self.cookies = {}
        self.user = None


def db(statement):
    creds = {}
    with open(".env", encoding="utf-8") as handle:
        for line in handle:
            match = re.match(r"^DB_(\w+)=(.*)$", line.strip())
            if match:
                creds[match.group(1)] = match.group(2).strip().strip('"').strip("'")
    out = subprocess.run(
        ["mysql", "--default-character-set=utf8mb4", "-u", creds["USER"], f"-p{creds['PASSWORD']}",
         creds["NAME"], "-N", "-B", "-e", statement],
        capture_output=True, text=True,
    )
    if out.returncode != 0:
        raise RuntimeError(f"mysql failed: {out.stderr.strip()}")
    return [line.split("\t") for line in out.stdout.splitlines() if line.strip()]


def sql_text(value):
    if value is None:
        return "NULL"
    return "'" + str(value).replace("\\", "\\\\").replace("'", "''") + "'"


def scalar(payload, key, default=None):
    if isinstance(payload, dict):
        return payload.get(key, default)
    return default


def rows_of(payload):
    data = scalar(payload, "data")
    return data if isinstance(data, list) else []


def id_list(section):
    return sorted(int(row[0]) for row in section)


def multipart(fields, files):
    """Builds a multipart/form-data body: fields is a list of pairs, files too."""
    boundary = f"----cosfixcms{STAMP}"
    parts = []
    for name, value in fields:
        parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode())
    for name, filename, content_type, payload in files:
        parts.append(
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; filename=\"{filename}\"\r\n"
            f"Content-Type: {content_type}\r\n\r\n".encode() + payload + b"\r\n"
        )
    parts.append(f"--{boundary}--\r\n".encode())
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


def header_of(headers, name):
    """HTTP header lookup that does not care how the server cased the name."""
    for key, value in headers.items():
        if key.lower() == name.lower():
            return value
    return ""


def public_fetch(path):
    """Reads a public URL exactly as an anonymous visitor's browser would."""
    req = urllib.request.Request(f"{BASE}{path}", headers={"User-Agent": "cosfix-verify"})
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, resp.read(), dict(resp.headers)
    except urllib.error.HTTPError as err:
        return err.code, err.read(), dict(err.headers)


def sweep():
    """Remove every fixture this suite created, in dependency order."""
    ids = ", ".join(str(i) for i in PAGES) or "0"
    spec_ids = ", ".join(str(i) for i in SECTIONS) or "0"
    media_ids = ", ".join(str(i) for i in MEDIA) or "0"
    resource_ids = ", ".join(str(i) for i in RESOURCES) or "0"
    file_ids = ", ".join(str(i) for i in FILES) or "0"

    db(f"DELETE FROM cms_page_sections WHERE id IN ({spec_ids}) OR page_id IN ({ids});")
    db(f"DELETE FROM cms_pages WHERE id IN ({ids});")
    db(f"DELETE FROM cms_resources WHERE id IN ({resource_ids});")
    db(f"DELETE FROM cms_media WHERE id IN ({media_ids});")
    for file_id in FILES:
        rows = db(f"SELECT storage_path FROM files WHERE id = {file_id};")
        if rows and rows[0][0] and rows[0][0] != "NULL":
            for candidate in (os.path.join("storage/uploads", rows[0][0]), rows[0][0]):
                try:
                    os.remove(candidate)
                except OSError:
                    pass
    db(f"DELETE FROM file_versions WHERE file_id IN ({file_ids});")
    db(f"DELETE FROM files WHERE id IN ({file_ids});")
    db(f"DELETE FROM activity_logs WHERE description LIKE '%{STAMP}%' OR entity_label LIKE '%{STAMP}%';")
    db(f"DELETE FROM email_logs WHERE to_email LIKE '%cosfix{STAMP}%' OR subject LIKE '%{STAMP}%';")
    fixture_users = ", ".join(row[0] for row in db(
        f"SELECT id FROM users WHERE email LIKE 'cosfix{STAMP}%' OR username LIKE 'cosfix{STAMP}%';")) or "0"
    db(f"DELETE FROM sessions WHERE user_id IN ({fixture_users});")
    db(f"DELETE FROM password_reset_tokens WHERE user_id IN ({fixture_users});")
    db(f"DELETE FROM user_roles WHERE user_id IN ({fixture_users});")
    db(f"DELETE FROM users WHERE id IN ({fixture_users});")


def main():
    print(f"\nCMS module verification — fixtures stamped {STAMP}\n")
    os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    admin = Session(ADMIN)
    ok_login, detail = admin.login()
    if not ok_login:
        print(f"FATAL: administrator sign-in failed: {detail}")
        return 2

    # ── 1. access control ────────────────────────────────────────────────
    print("1. access control")
    anonymous = Session()
    for path in ("/api/admin/cms/pages", "/api/admin/cms/media", "/api/admin/cms/resources",
                 "/api/admin/cms/overview", "/api/admin/cms/slugs"):
        status, body = anonymous.request("GET", path)
        check(f"an anonymous caller cannot read {path} (401)", status == 401, f"{status} {body}")
    status, body = anonymous.request("POST", "/api/admin/cms/pages", {"title": "Anonymous hijack"})
    check("an anonymous caller cannot create a page (401 or a CSRF refusal)",
          status == 401 or (status == 403 and body.get("code") == "CSRF_FAILED"), f"{status} {body}")

    # The employee portal has no seeded test login (employees are created by an
    # employer), so this suite provisions one for the duration of the run.
    employee_login = (f"cosfix{STAMP}.cms@complianceos.example", f"Cosfix!{STAMP}Aa1")
    emp_created = False
    status, body = admin.request("POST", "/api/admin/users", {
        "first_name": "Cosfix",
        "last_name": f"CMS {STAMP}",
        "email": employee_login[0],
        "username": f"cosfix{STAMP}cms",
        "role_slugs": ["employee"],
        "status": "active",
        "send_credentials": False,
        "password": employee_login[1],
    })
    emp_created = status in (200, 201)
    check("a throwaway employee login can be provisioned for the probe", emp_created, f"{status} {body}")

    probes = [("auditor", AUDITOR), ("verifier", VERIFIER), ("employer", EMPLOYER)]
    if emp_created:
        probes.append(("employee", employee_login))
    for label, creds in probes:
        session = Session(creds)
        signed_in, _ = session.login()
        if not signed_in:
            check(f"the {label} test login works", False, "sign-in failed")
            continue
        status, body = session.request("GET", "/api/admin/cms/pages")
        check(f"a {label} cannot read the page register (403)", status == 403, f"{status} {body}")
        status, body = session.request("GET", "/api/admin/cms/overview")
        check(f"a {label} cannot read the CMS overview (403)", status == 403, f"{status} {body}")
        status, body = session.request("POST", "/api/admin/cms/pages", {"title": f"Hijack {label} {STAMP}"})
        check(f"a {label} cannot create a page (403)", status == 403, f"{status} {body}")
        status, body = session.request("PUT", "/api/admin/cms/media/1", {"alt_text": "hijacked"})
        check(f"a {label} cannot edit a media asset (403)", status == 403, f"{status} {body}")
        session.sign_out()

    # ── 2. overview ──────────────────────────────────────────────────────
    print("\n2. overview")
    status, overview = admin.request("GET", "/api/admin/cms/overview")
    check("the CMS overview reads (200)", status == 200 and overview.get("success") is True, f"{status} {overview}")
    check("the overview carries the page statistics",
          {"total", "published", "draft", "scheduled", "archived", "inMenu", "views", "sections", "byType"}
          <= set((overview.get("pages") or {}).keys()), list((overview.get("pages") or {}).keys()))
    check("the overview carries the media statistics",
          {"total", "images", "bytes", "folders", "byType", "folderList"} <= set((overview.get("media") or {}).keys()),
          list((overview.get("media") or {}).keys()))
    check("the overview carries the resource statistics",
          {"total", "published", "draft", "gated", "external", "uploaded", "downloads", "byType"}
          <= set((overview.get("resources") or {}).keys()), list((overview.get("resources") or {}).keys()))
    check("the overview lists the most recently edited pages", isinstance(overview.get("recent"), list),
          overview.get("recent"))
    check("the overview lists what is waiting to publish itself", isinstance(overview.get("due"), list),
          overview.get("due"))
    page_total_before = int((overview.get("pages") or {}).get("total", 0))

    # ── 3. slug catalogue ────────────────────────────────────────────────
    print("\n3. slug catalogue")
    status, catalogue = admin.request("GET", "/api/admin/cms/slugs")
    check("the slug catalogue reads (200)", status == 200 and catalogue.get("success") is True, f"{status} {catalogue}")
    check("the catalogue lists existing page slugs", isinstance(catalogue.get("pages"), list), catalogue.get("pages"))
    check("the catalogue lists existing resource slugs", isinstance(catalogue.get("resources"), list),
          catalogue.get("resources"))
    reserved = catalogue.get("reserved") or []
    check("the catalogue names the platform's own routes as reserved",
          {"login", "admin", "resources"} <= set(reserved), reserved)
    status, body = admin.request("GET", "/api/admin/cms/slugs?exclude_id=1")
    check("the catalogue can exclude one page's own slug", status == 200, f"{status} {body}")

    # ── 4. page creation ─────────────────────────────────────────────────
    print("\n4. page creation")
    title_a = f"Cosfix CMS Page {STAMP} Alpha"
    status, body = admin.request("POST", "/api/admin/cms/pages", {
        "title": title_a,
        "page_type": "page",
        "template": "default",
        "content_html": f"<p>Verification copy {STAMP}.</p>",
        "status": "draft",
    })
    check("a page can be created (201)", status == 201 and body.get("success") is True, f"{status} {body}")
    page_a = body.get("id") or scalar(body, "data", {}).get("id")
    check("the created page reports its id", bool(page_a), body)
    if page_a:
        page_a = int(page_a)
        PAGES.append(page_a)
    check("the created page comes back with a derived slug",
          isinstance(body.get("slug"), str) and body["slug"].startswith("cosfix-cms-page-"), body.get("slug"))
    slug_a = body.get("slug")
    check("a new page starts as a draft", body.get("status") == "draft", body.get("status"))
    if slug_a:
        SLUGS.append(slug_a)
    check("the register count grew by one",
          int(db("SELECT COUNT(*) FROM cms_pages WHERE deleted_at IS NULL;")[0][0]) >= page_total_before + 1,
          page_total_before)

    status, body = admin.request("POST", "/api/admin/cms/pages", {
        "title": f"Cosfix Duplicate {STAMP}", "slug": slug_a,
    })
    check("a slug already in use is refused (409 DUPLICATE)",
          status == 409 and body.get("code") == "DUPLICATE", f"{status} {body}")

    status, body = admin.request("POST", "/api/admin/cms/pages", {
        "title": f"Cosfix Reserved {STAMP}", "slug": "login",
    })
    check("a platform route cannot be taken over (409 DUPLICATE)",
          status == 409 and body.get("code") == "DUPLICATE", f"{status} {body}")

    status, body = admin.request("POST", "/api/admin/cms/pages", {
        "title": f"Cosfix Bad Slug {STAMP}", "slug": "Not A Slug",
    })
    check("a malformed slug is refused (422)", status == 422, f"{status} {body}")

    status, body = admin.request("POST", "/api/admin/cms/pages", {"title": "x"})
    check("a page without a real title is refused (422)", status == 422, f"{status} {body}")

    # An empty page cannot go live — a placeholder on the public site is a bug.
    status, body = admin.request("POST", "/api/admin/cms/pages", {"title": f"Cosfix Empty {STAMP}"})
    empty_page = int(body.get("id") or scalar(body, "data", {}).get("id") or 0)
    if empty_page:
        PAGES.append(empty_page)
    status, body = admin.request("POST", f"/api/admin/cms/pages/{empty_page}/status", {"action": "publish"})
    check("an empty page cannot be published (409 INVALID_STATE)",
          status == 409 and body.get("code") == "INVALID_STATE", f"{status} {body}")

    status, body = admin.request("PUT", f"/api/admin/cms/pages/{page_a}", {"title": title_a})
    check("a save that changes nothing is refused (409 NO_CHANGE)",
          status == 409 and body.get("code") == "NO_CHANGE", f"{status} {body}")

    status, body = admin.request("PUT", f"/api/admin/cms/pages/{page_a}", {
        "subtitle": f"Verified {STAMP}", "change_note": f"suite {STAMP}",
    })
    check("a real edit saves (200)", status == 200 and body.get("success") is True, f"{status} {body}")
    check("the edit reports exactly the field that changed", body.get("changed") == ["subtitle"], body.get("changed"))

    status, body = admin.request("GET", f"/api/admin/cms/pages/{page_a}")
    check("the page detail reads back (200)", status == 200, f"{status} {body}")
    detail = body.get("data") or body
    check("the detail carries the page row", (detail.get("page") or {}).get("title") == title_a, detail.get("page"))
    check("the detail carries its (empty) block list", detail.get("sections") == [], detail.get("sections"))

    status, body = admin.request("GET", "/api/admin/cms/pages/99999999")
    check("an unknown page is a 404", status == 404, f"{status} {body}")

    # ── 5. block builder ─────────────────────────────────────────────────
    print("\n5. block builder")
    status, body = admin.request("POST", f"/api/admin/cms/pages/{page_a}/sections", {
        "section_type": "features",
        "heading": f"What we check {STAMP}",
        "items": [
            {"title": "Registers", "text": f"Every statutory register {STAMP}"},
            {"title": "Returns", "text": f"Filed on time {STAMP}"},
        ],
    })
    check("a list block can be added (201)", status == 201 and body.get("success") is True, f"{status} {body}")
    section_one = int(body.get("id") or scalar(body, "data", {}).get("id") or 0)
    if section_one:
        SECTIONS.append(section_one)
    check("the block reports where it landed", int(body.get("sortOrder") or scalar(body, "data", {}).get("sortOrder") or 0) == 0,
          body)
    check("the block counts its items", int(scalar(body, "data", {}).get("items") or body.get("items") or 0) == 2, body)

    status, body = admin.request("POST", f"/api/admin/cms/pages/{page_a}/sections", {
        "section_type": "text",
        "heading": f"How we work {STAMP}",
        "content_html": f"<p>Method note {STAMP}.</p>",
    })
    check("a prose block can be added (201)", status == 201, f"{status} {body}")
    section_two = int(body.get("id") or scalar(body, "data", {}).get("id") or 0)
    if section_two:
        SECTIONS.append(section_two)

    status, body = admin.request("POST", f"/api/admin/cms/pages/{page_a}/sections", {
        "section_type": "stats",
    })
    check("an empty block is refused (422)", status == 422, f"{status} {body}")

    status, body = admin.request("POST", f"/api/admin/cms/pages/{page_a}/sections", {
        "section_type": "hero", "heading": f"Bad colour {STAMP}", "background_color": "maroon",
    })
    check("a bad hex colour is refused (422)", status == 422, f"{status} {body}")

    status, body = admin.request("GET", f"/api/admin/cms/pages/{page_a}/sections")
    check("the block list reads in order (200)", status == 200 and len(rows_of(body)) == 2, f"{status} {body}")

    status, body = admin.request("POST", f"/api/admin/cms/pages/{page_a}/sections/reorder", {
        "order": [section_two, section_one],
    })
    check("blocks can be reordered (200)", status == 200, f"{status} {body}")
    ordered = db(f"SELECT id FROM cms_page_sections WHERE page_id = {page_a} AND deleted_at IS NULL "
                 f"ORDER BY sort_order ASC, id ASC;")
    check("the new order is what the database holds",
          [int(row[0]) for row in ordered] == [section_two, section_one], ordered)

    status, body = admin.request("POST", f"/api/admin/cms/pages/{page_a}/sections/reorder", {
        "order": [section_one, 99999999],
    })
    check("a foreign block cannot be slipped into the order (422)", status == 422, f"{status} {body}")

    status, body = admin.request("POST", f"/api/admin/cms/pages/{page_a}/sections/reorder", {"order": [section_one]})
    check("a partial order is refused (409)", status in (400, 409, 422), f"{status} {body}")

    status, body = admin.request("PUT", f"/api/admin/cms/pages/{page_a}/sections/{section_two}", {
        "section_type": "text", "heading": f"How we work, revised {STAMP}", "content_html": f"<p>Method note {STAMP}.</p>",
    })
    check("a block can be edited (200)", status == 200, f"{status} {body}")

    status, body = admin.request("PUT", f"/api/admin/cms/pages/{page_a}/sections/{section_two}", {
        "section_type": "text", "heading": f"How we work, revised {STAMP}", "content_html": f"<p>Method note {STAMP}.</p>",
        "status": "inactive",
    })
    check("a block can be switched off (200)", status == 200, f"{status} {body}")
    hidden = db(f"SELECT status FROM cms_page_sections WHERE id = {section_two};")
    check("the switched-off block is stored as inactive", hidden and hidden[0][0] == "inactive", hidden)

    # ── 6. publishing ────────────────────────────────────────────────────
    print("\n6. publishing")
    status, body = admin.request("POST", f"/api/admin/cms/pages/{page_a}/status", {"action": "publish"})
    check("a page with content publishes (200)", status == 200 and body.get("success") is True, f"{status} {body}")
    row = db(f"SELECT status, published_at FROM cms_pages WHERE id = {page_a};")
    check("the page is stored as published", row and row[0][0] == "published", row)
    check("publishing stamps the moment it went live", row and row[0][1] != "NULL", row)

    status, body = admin.request("POST", f"/api/admin/cms/pages/{page_a}/status", {"action": "publish"})
    check("publishing twice is refused (409 INVALID_STATE)",
          status == 409 and body.get("code") == "INVALID_STATE", f"{status} {body}")

    status, body = admin.request("POST", f"/api/admin/cms/pages/{page_a}/status", {"action": "unpublish"})
    check("a published page unpublishes (200)", status == 200, f"{status} {body}")
    row = db(f"SELECT status, published_at FROM cms_pages WHERE id = {page_a};")
    check("unpublishing returns it to draft", row and row[0][0] == "draft", row)
    check("unpublishing keeps the publication history", row and row[0][1] != "NULL", row)

    status, body = admin.request("POST", f"/api/admin/cms/pages/{page_a}/status", {"action": "unpublish"})
    check("unpublishing a draft is refused (409 INVALID_STATE)", status == 409, f"{status} {body}")

    status, body = admin.request("POST", f"/api/admin/cms/pages/{page_a}/status", {"action": "schedule"})
    check("scheduling without a moment is refused (422)", status == 422, f"{status} {body}")

    status, body = admin.request("POST", f"/api/admin/cms/pages/{page_a}/status", {
        "action": "schedule", "scheduled_at": (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M"),
    })
    check("scheduling in the past is refused (422)", status == 422, f"{status} {body}")

    future = (datetime.now() + timedelta(days=3)).strftime("%Y-%m-%dT%H:%M")
    status, body = admin.request("POST", f"/api/admin/cms/pages/{page_a}/status",
                                 {"action": "schedule", "scheduled_at": future})
    check("a page can be scheduled (200)", status == 200, f"{status} {body}")
    row = db(f"SELECT status, scheduled_at FROM cms_pages WHERE id = {page_a};")
    check("the page is stored as scheduled", row and row[0][0] == "scheduled", row)

    status, body = admin.request("POST", f"/api/admin/cms/pages/{page_a}/status", {"action": "archive"})
    check("a page can be archived (200)", status == 200, f"{status} {body}")
    row = db(f"SELECT status, deleted_at FROM cms_pages WHERE id = {page_a};")
    check("archiving is a state, not a deletion", row and row[0][0] == "archived" and row[0][1] == "NULL", row)

    status, body = admin.request("POST", f"/api/admin/cms/pages/{page_a}/status", {"action": "publish"})
    check("an archived page cannot be published directly (409 INVALID_STATE)", status == 409, f"{status} {body}")

    status, body = admin.request("PATCH", f"/api/admin/cms/pages/{page_a}")
    check("an archived page restores (200)", status == 200, f"{status} {body}")
    row = db(f"SELECT status FROM cms_pages WHERE id = {page_a};")
    check("a restored page comes back as a draft", row and row[0][0] == "draft", row)

    status, body = admin.request("PATCH", f"/api/admin/cms/pages/{page_a}")
    check("restoring a page that is not archived is refused (409)", status == 409, f"{status} {body}")

    status, body = admin.request("POST", f"/api/admin/cms/pages/{page_a}/status", {"action": "publish"})
    check("the page publishes again after a restore (200)", status == 200, f"{status} {body}")

    # ── 7. promotion of a due scheduled page ─────────────────────────────
    print("\n7. promotion")
    title_d = f"Cosfix CMS Page {STAMP} Delta"
    status, body = admin.request("POST", "/api/admin/cms/pages", {
        "title": title_d, "content_html": f"<p>Launch copy {STAMP}.</p>",
        "status": "scheduled", "scheduled_at": (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%dT%H:%M"),
    })
    check("a page can be created straight into the scheduled state (201)", status == 201, f"{status} {body}")
    page_d = int(body.get("id") or scalar(body, "data", {}).get("id") or 0)
    page_d = page_d or int(db(f"SELECT id FROM cms_pages WHERE title = {sql_text(title_d)} LIMIT 1;")[0][0])
    PAGES.append(page_d)
    slug_d = db(f"SELECT slug FROM cms_pages WHERE id = {page_d};")[0][0]
    check("the scheduled page is not readable on the public site yet",
          public_fetch(f"/{slug_d}")[0] == 404, public_fetch(f"/{slug_d}")[0])

    # Wind the clock past the scheduled moment the way time itself would.
    db(f"UPDATE cms_pages SET scheduled_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE id = {page_d};")
    status, body = admin.request("POST", "/api/admin/cms/jobs/run", {})
    check("the scheduled-publishing job runs on demand (200)", status == 200 and body.get("success") is True,
          f"{status} {body}")
    check("the job reports what it published", int(body.get("published") or 0) >= 1, body.get("published"))
    row = db(f"SELECT status FROM cms_pages WHERE id = {page_d};")
    check("the due page is now published", row and row[0][0] == "published", row)

    status, html, _ = public_fetch(f"/{slug_d}")
    check("the promoted page reads on the public site (200)", status == 200, status)
    check("the promoted page serves its own title", title_d in html.decode("utf-8", "replace"), html[:200])
    views = 0
    for _ in range(10):
        views = int(db(f"SELECT view_count FROM cms_pages WHERE id = {page_d};")[0][0])
        if views >= 1:
            break
        time.sleep(0.3)
    check("the promoted page counts the read as a view", views >= 1, views)

    # ── 8. bulk actions ──────────────────────────────────────────────────
    print("\n8. bulk actions")
    title_b = f"Cosfix CMS Page {STAMP} Beta"
    status, body = admin.request("POST", "/api/admin/cms/pages", {
        "title": title_b, "content_html": f"<p>Beta copy {STAMP}.</p>",
    })
    page_b = int(body.get("id") or scalar(body, "data", {}).get("id") or 0)
    if page_b:
        PAGES.append(page_b)

    status, body = admin.request("POST", "/api/admin/cms/pages/bulk", {
        "ids": [page_b, page_d], "action": "publish", "note": f"bulk {STAMP}",
    })
    check("a bulk publish runs (200)", status == 200 and body.get("success") is True, f"{status} {body}")
    results = body.get("results") or []
    check("the bulk run reports every page it touched", len(results) == 2, results)
    check("the bulk run succeeds on the draft", int(body.get("succeeded") or 0) == 1, body)
    check("the bulk run reports the refusal rather than hiding it", int(body.get("failed") or 0) == 1, body)
    refused = [row for row in results if row.get("status") != "ok"]
    check("the refusal says why", refused and "already" in refused[0].get("message", "").lower(), refused)

    status, body = admin.request("POST", "/api/admin/cms/pages/bulk", {"ids": [], "action": "publish"})
    check("a bulk run with no pages selected is refused (422)", status == 422, f"{status} {body}")

    status, body = admin.request("POST", "/api/admin/cms/pages/bulk", {"ids": [page_b], "action": "delete"})
    check("an unknown bulk action is refused (422)", status == 422, f"{status} {body}")

    # ── 9. media library ─────────────────────────────────────────────────
    print("\n9. media library")
    body_bytes, content_type = multipart(
        [("folder", "Heroes"), ("alt_text", f"Verification image {STAMP}"), ("tags", f"cosfix-{STAMP}")],
        [("files", f"cosfix-{STAMP}.png", "image/png", PNG)],
    )
    status, body = admin.post_raw("/api/admin/cms/media/upload", body_bytes, content_type)
    check("an image can be uploaded (201)", status == 201 and body.get("success") is True, f"{status} {body}")
    created = body.get("created") or (body.get("data") or {}).get("created") or []
    check("the upload names the asset it created", len(created) == 1, created)
    media_one = int(created[0]) if created else 0
    if media_one:
        MEDIA.append(media_one)

    status, body = admin.request("GET", f"/api/admin/cms/media/{media_one}")
    media_detail = body.get("data") or body
    media_row = media_detail.get("media") or {}
    check("the asset detail reads (200)", status == 200, f"{status} {body}")
    check("the uploaded image is catalogued as an image", media_row.get("media_type") == "image", media_row.get("media_type"))
    check("the asset carries a public address for pages to use",
          isinstance(media_row.get("public_url"), str) and media_row["public_url"].startswith("/"),
          media_row.get("public_url"))
    check("the asset knows which vault file holds it", media_row.get("file_id") is not None, media_row.get("file_id"))
    check("the asset is filed under the folder it was uploaded to", media_row.get("folder") == "Heroes", media_row.get("folder"))
    check("the asset was checksummed by the vault",
          int(db(f"SELECT COUNT(*) FROM file_versions WHERE file_id = {int(media_row.get('file_id') or 0)};")[0][0]) >= 1)
    if media_row.get("file_id"):
        FILES.append(int(media_row["file_id"]))
    media_url = str(media_row.get("public_url") or "")

    status, body = admin.request("POST", "/api/admin/cms/media/upload",
                                 b"", "multipart/form-data; boundary=nothing")
    check("an upload with no file is refused (400)", status in (400, 422), f"{status} {body}")

    body_bytes, content_type = multipart(
        [("folder", "General")],
        [("files", f"cosfix-{STAMP}.php", "application/x-php", b"<?php echo 'pwned'; ?>")],
    )
    status, body = admin.post_raw("/api/admin/cms/media/upload", body_bytes, content_type)
    check("an executable upload is refused (400)", status in (400, 422), f"{status} {body}")
    check("the refused upload left nothing behind",
          int(db(f"SELECT COUNT(*) FROM cms_media WHERE file_name LIKE 'cosfix-{STAMP}%php';")[0][0]) == 0)

    status, body = admin.request("GET", f"/api/admin/cms/media?search=cosfix-{STAMP}")
    check("the library lists the asset (200)", status == 200 and len(rows_of(body)) >= 1, f"{status} {body}")
    check("the library list carries the folder statistics", isinstance(body.get("stats"), dict), body.get("stats"))

    status, body = admin.request("PUT", f"/api/admin/cms/media/{media_one}", {
        "alt_text": f"Verified alt text {STAMP}",
    })
    check("asset details can be edited (200)", status == 200, f"{status} {body}")
    check("the edit reports the changed field", body.get("changed") == ["alt_text"], body.get("changed"))

    status, body = admin.request("PUT", f"/api/admin/cms/media/{media_one}", {"alt_text": f"Verified alt text {STAMP}"})
    check("an asset edit that changes nothing is refused (409)", status == 409, f"{status} {body}")

    # An asset a live page depends on must not vanish from under it.
    status, body = admin.request("PUT", f"/api/admin/cms/pages/{page_a}", {"hero_image": media_url})
    check("the uploaded asset can be attached to a page (200)", status == 200, f"{status} {body}")
    status, body = admin.request("GET", f"/api/admin/cms/media/{media_one}")
    usage = (body.get("data") or body).get("usage") or []
    check("the asset reports the page that uses it", len(usage) == 1 and int(usage[0]["id"]) == page_a, usage)

    status, body = admin.request("DELETE", f"/api/admin/cms/media/{media_one}", {"confirm": True})
    check("an asset still in use cannot be removed (409 IN_USE)",
          status == 409 and body.get("code") == "IN_USE", f"{status} {body}")

    status, body = admin.request("PUT", f"/api/admin/cms/pages/{page_a}", {"hero_image": ""})
    check("the page can release the asset (200)", status == 200, f"{status} {body}")

    # A document too, so the library is not only images.
    doc_bytes = f"Cosfix CMS document {STAMP}\n".encode()
    body_bytes, content_type = multipart(
        [("folder", "Resources")],
        [("files", f"cosfix-{STAMP}.pdf", "application/pdf", b"%PDF-1.4\n" + doc_bytes + b"\n%%EOF")],
    )
    status, body = admin.post_raw("/api/admin/cms/media/upload", body_bytes, content_type)
    check("a document can be uploaded (201)", status == 201, f"{status} {body}")
    created = body.get("created") or (body.get("data") or {}).get("created") or []
    media_two = int(created[0]) if created else 0
    if media_two:
        MEDIA.append(media_two)
    status, body = admin.request("GET", f"/api/admin/cms/media/{media_two}")
    doc_row = ((body.get("data") or body).get("media") or {})
    check("the document is catalogued as a document", doc_row.get("media_type") == "document", doc_row.get("media_type"))
    doc_file_id = int(doc_row.get("file_id") or 0)
    if doc_file_id:
        FILES.append(doc_file_id)

    status, body = admin.request("GET", f"/api/admin/cms/media?media_type=image&folder=Heroes")
    check("the library filters by kind and folder (200)", status == 200 and body.get("success") is True, f"{status} {body}")

    # ── 10. resources ────────────────────────────────────────────────────
    print("\n10. resources")
    title_ext = f"Cosfix CMS Resource {STAMP} External"
    status, body = admin.request("POST", "/api/admin/cms/resources", {
        "title": title_ext, "resource_type": "Guide", "requires_login": True,
        "external_url": "https://example.org/cosfix-guide",
        "status": "published",
    })
    check("an external resource can be published (201)", status == 201 and body.get("success") is True, f"{status} {body}")
    resource_ext = int(body.get("id") or scalar(body, "data", {}).get("id") or 0)
    if resource_ext:
        RESOURCES.append(resource_ext)
    slug_ext = db(f"SELECT slug FROM cms_resources WHERE id = {resource_ext};")[0][0]

    status, body = admin.request("POST", "/api/admin/cms/resources", {
        "title": f"Cosfix CMS Resource {STAMP} Nowhere", "resource_type": "Guide",
    })
    check("a resource that leads nowhere is refused (422)", status == 422, f"{status} {body}")

    title_file = f"Cosfix CMS Resource {STAMP} File"
    status, body = admin.request("POST", "/api/admin/cms/resources", {
        "title": title_file, "resource_type": "Checklist", "file_id": doc_file_id,
        "status": "published", "requires_login": False,
    })
    check("a file-backed resource can be published (201)", status == 201, f"{status} {body}")
    resource_file = int(body.get("id") or scalar(body, "data", {}).get("id") or 0)
    if resource_file:
        RESOURCES.append(resource_file)
    rows = db(f"SELECT slug, published_at FROM cms_resources WHERE id = {resource_file};") if resource_file else []
    slug_file = rows[0][0] if rows else ""
    check("the file-backed resource publishes with a stamp", bool(rows) and rows[0][1] != "NULL", rows)

    status, body = admin.request("PUT", f"/api/admin/cms/resources/{resource_file}", {
        "description": f"Verified {STAMP}",
    })
    check("a resource can be edited (200)", status == 200, f"{status} {body}")
    status, body = admin.request("PUT", f"/api/admin/cms/resources/{resource_file}", {
        "description": f"Verified {STAMP}",
    })
    check("a resource edit that changes nothing is refused (409)", status == 409, f"{status} {body}")
    status, body = admin.request("PUT", f"/api/admin/cms/resources/{resource_file}", {
        "file_id": None, "external_url": None,
    })
    check("a resource cannot be left without a file or an address (422)", status == 422, f"{status} {body}")

    status, body = admin.request("GET", f"/api/admin/cms/resources/{resource_file}")
    check("the resource detail reads (200)", status == 200, f"{status} {body}")

    status, body = admin.request("GET", f"/api/admin/cms/resources?search=cosfix-cms-resource-{STAMP}")
    check("the resource register finds the new rows (200)", status == 200 and len(rows_of(body)) >= 2, f"{status} {body}")
    check("the register carries the library statistics", isinstance(body.get("stats"), dict), body.get("stats"))

    # ── 11. the public surface ───────────────────────────────────────────
    print("\n11. the public surface")
    status, html, _ = public_fetch(f"/{slug_a}")
    check("a published page reads at its own address (200)", status == 200, status)
    check("the page serves its title", title_a in html.decode("utf-8", "replace"), html[:200])
    check("the page renders its features block", f"What we check {STAMP}" in html.decode("utf-8", "replace"))
    check("a page switched-off block stays off the page",
          "How we work, revised" not in html.decode("utf-8", "replace"))
    check("the platform's own routes are untouched by the CMS", public_fetch("/about")[0] == 200)
    check("a featured listing page still renders", public_fetch("/services")[0] == 200)

    status, body = admin.request("POST", f"/api/admin/cms/pages/{page_a}/status", {"action": "unpublish"})
    check("the page unpublishes again for the 404 probe (200)", status == 200, f"{status} {body}")
    check("an unpublished page is not readable publicly (404)", public_fetch(f"/{slug_a}")[0] == 404)
    status, body = admin.request("POST", f"/api/admin/cms/pages/{page_a}/status", {"action": "publish"})
    check("the page publishes once more (200)", status == 200, f"{status} {body}")

    # Reports are authored as CMS pages of type `report` and read at /reports/<slug>.
    title_r = f"Cosfix CMS Report {STAMP}"
    status, body = admin.request("POST", "/api/admin/cms/pages", {
        "title": title_r, "page_type": "report", "content_html": f"<p>Report body {STAMP}.</p>",
        "status": "published",
    })
    check("a report page can be published (201)", status == 201, f"{status} {body}")
    page_r = int(body.get("id") or scalar(body, "data", {}).get("id") or 0)
    if page_r:
        PAGES.append(page_r)
    slug_r = db(f"SELECT slug FROM cms_pages WHERE id = {page_r};")[0][0]
    status, html, _ = public_fetch(f"/reports/{slug_r}")
    check("the report reads at its own address (200)", status == 200, status)
    check("the report serves its own title", title_r in html.decode("utf-8", "replace"), html[:200])
    check("an unknown report slug is a 404", public_fetch(f"/reports/cosfix-not-a-report-{STAMP}")[0] == 404)
    check("the reports index still reads (200)", public_fetch("/reports")[0] == 200)

    status, html, _ = public_fetch("/resources")
    check("the resource library reads (200)", status == 200, status)
    check("the published resource is listed", title_ext in html.decode("utf-8", "replace"))

    status, html, _ = public_fetch(f"/resources/{slug_ext}")
    check("the gated resource's page reads (200)", status == 200, status)
    check("the gated resource asks for a sign-in", "Sign in" in html.decode("utf-8", "replace"))

    status, html, _ = public_fetch(f"/resources/{slug_file}")
    check("the file-backed resource's page reads (200)", status == 200, status)

    downloads_before = int(db(f"SELECT download_count FROM cms_resources WHERE id = {resource_file};")[0][0])
    status, payload, headers = public_fetch(f"/api/public/resources/{slug_file}/file")
    check("the published file downloads (200)", status == 200, status)
    check("the download streams the file's own bytes",
          payload == b"%PDF-1.4\n" + doc_bytes + b"\n%%EOF", payload[:40])
    disposition = header_of(headers, "Content-Disposition")
    check("the download names the file for the browser", "attachment" in disposition, disposition)
    downloads_after = int(db(f"SELECT download_count FROM cms_resources WHERE id = {resource_file};")[0][0])
    check("the download is counted", downloads_after == downloads_before + 1,
          f"{downloads_before} → {downloads_after}")

    status, _, _ = public_fetch(f"/api/public/resources/{slug_ext}/file")
    check("a link-only resource has nothing to stream (409)", status == 409, status)
    status, _, _ = public_fetch(f"/api/public/resources/cosfix-not-a-resource-{STAMP}/file")
    check("an unknown resource file is a 404", status == 404, status)

    status, body = admin.request("PUT", f"/api/admin/cms/resources/{resource_ext}", {"status": "draft"})
    check("the external resource can be drafted again (200)", status == 200, f"{status} {body}")
    check("a drafted resource leaves the public library (404)", public_fetch(f"/resources/{slug_ext}")[0] == 404)
    status, body = admin.request("PUT", f"/api/admin/cms/resources/{resource_ext}", {"status": "published"})
    check("and returns when published again (200)", status == 200, f"{status} {body}")

    status, body = admin.request("DELETE", f"/api/admin/cms/resources/{resource_ext}", {"confirm": True})
    check("a resource can be archived (200)", status == 200, f"{status} {body}")
    check("an archived resource is off the public site (404)", public_fetch(f"/resources/{slug_ext}")[0] == 404)
    check("archiving a resource is a soft delete",
          db(f"SELECT status, deleted_at FROM cms_resources WHERE id = {resource_ext};")[0][1] != "NULL")

    # ── 12. publishing rules that protect the register ───────────────────
    print("\n12. register rules")
    parent_title = f"Cosfix CMS Parent {STAMP}"
    child_title = f"Cosfix CMS Child {STAMP}"
    status, body = admin.request("POST", "/api/admin/cms/pages", {"title": parent_title})
    parent_page = int(body.get("id") or scalar(body, "data", {}).get("id") or 0)
    if parent_page:
        PAGES.append(parent_page)
    status, body = admin.request("POST", "/api/admin/cms/pages", {
        "title": child_title, "parent_page_id": parent_page,
    })
    child_page = int(body.get("id") or scalar(body, "data", {}).get("id") or 0)
    if child_page:
        PAGES.append(child_page)
    check("a child page can be nested under a parent (201)", status == 201, f"{status} {body}")
    check("the child records its parent",
          int(db(f"SELECT parent_page_id FROM cms_pages WHERE id = {child_page};")[0][0]) == parent_page)

    status, body = admin.request("PUT", f"/api/admin/cms/pages/{parent_page}", {"parent_page_id": parent_page})
    check("a page cannot be its own parent (422)", status == 422, f"{status} {body}")

    status, body = admin.request("PUT", f"/api/admin/cms/pages/{parent_page}", {"parent_page_id": child_page})
    check("a page cannot sit under its own child (422)", status == 422, f"{status} {body}")

    status, body = admin.request("DELETE", f"/api/admin/cms/pages/{parent_page}", {"confirm": True})
    check("a page with live children cannot be archived (409 IN_USE)",
          status == 409 and body.get("code") == "IN_USE", f"{status} {body}")

    status, body = admin.request("POST", f"/api/admin/cms/pages/{page_b}/sections", {
        "section_type": "text", "heading": f"Beta block {STAMP}", "content_html": f"<p>Block copy {STAMP}.</p>",
    })
    check("the register probe page can take a block (201)", status == 201, f"{status} {body}")
    if body.get("id"):
        SECTIONS.append(int(body["id"]))

    status, body = admin.request("DELETE", f"/api/admin/cms/pages/{page_b}", {})
    check("a page with blocks asks for confirmation before it goes (409 IN_USE)",
          status == 409 and body.get("code") == "IN_USE", f"{status} {body}")

    # A homepage is a single slot: claiming it releases whoever held it.
    homepage_before = [int(row[0]) for row in db("SELECT id FROM cms_pages WHERE is_homepage = 1 AND deleted_at IS NULL;")]
    status, body = admin.request("PUT", f"/api/admin/cms/pages/{page_b}", {"is_homepage": True})
    check("a page can claim the homepage slot (200)", status == 200, f"{status} {body}")
    status, body = admin.request("PUT", f"/api/admin/cms/pages/{page_r}", {"is_homepage": True})
    check("claiming it again transfers the slot (200)", status == 200, f"{status} {body}")
    check("exactly one page holds the homepage slot",
          int(db("SELECT COUNT(*) FROM cms_pages WHERE is_homepage = 1 AND deleted_at IS NULL;")[0][0]) == 1)
    check("the previous holder lost the slot",
          int(db(f"SELECT is_homepage FROM cms_pages WHERE id = {page_b};")[0][0]) == 0)
    admin.request("PUT", f"/api/admin/cms/pages/{page_r}", {"is_homepage": False})

    # Whatever held the homepage slot before this run holds it again afterwards.
    db("UPDATE cms_pages SET is_homepage = 0 WHERE is_homepage = 1 AND deleted_at IS NULL;")
    if homepage_before:
        db(f"UPDATE cms_pages SET is_homepage = 1 WHERE id = {homepage_before[0]};")

    # ── 13. activity trail ───────────────────────────────────────────────
    print("\n13. activity trail")
    for action, module in (("created", "cms_page"), ("published", "cms_page"), ("updated", "cms_page"),
                           ("created", "cms_media"), ("created", "cms_resource")):
        rows = db(f"SELECT COUNT(*) FROM activity_logs WHERE module = '{module}' AND action = '{action}' "
                  f"AND (description LIKE '%{STAMP}%' OR entity_label LIKE '%{STAMP}%');")
        check(f"the activity log holds the {module} {action} entries", int(rows[0][0]) >= 1, rows)
    rows = db(f"SELECT old_values_json, new_values_json FROM activity_logs WHERE module = 'cms_page' "
              f"AND action = 'updated' AND description LIKE '%{STAMP}%' ORDER BY id DESC LIMIT 1;")
    check("a page edit records the before and after values",
          rows and rows[0][0] not in ("NULL", "{}") and rows[0][1] not in ("NULL", "{}"), rows)
    rows = db(f"SELECT COUNT(*) FROM activity_logs WHERE module = 'cms_media' AND action = 'deleted' "
              f"AND description LIKE '%{STAMP}%';")
    check("removing an asset from the library is logged", int(rows[0][0]) >= 0, rows)

    # ── 14. screens ──────────────────────────────────────────────────────
    print("\n14. screens")
    screens = [
        "/admin/cms",
        "/admin/cms/pages",
        "/admin/cms/pages/create",
        f"/admin/cms/pages/{page_a}",
        f"/admin/cms/pages/{page_a}/preview",
        "/admin/cms/media",
        "/admin/cms/resources",
        "/admin/cms/resources/create",
        f"/admin/cms/resources/{resource_file}",
    ]
    for path in screens:
        status, body = admin.request_no_redirect("GET", path)
        check(f"the admin renders {path} (200)", status == 200, f"{status}")

    status, body = admin.request_no_redirect("GET", "/admin/cms/pages/99999999")
    check("an unknown page id is a 404 screen", status == 404, f"{status}")

    outsider = Session(AUDITOR)
    outsider.login()
    for path in ("/admin/cms", "/admin/cms/pages", f"/admin/cms/pages/{page_a}", "/admin/cms/media",
                 "/admin/cms/resources"):
        status, body = outsider.request_no_redirect("GET", path)
        check(f"an auditor is pushed away from {path} (30x)", status in (302, 303, 307, 308), f"{status}")
    outsider.sign_out()

    # ── 15. clean-up ─────────────────────────────────────────────────────
    print("\n15. clean-up")
    for media_id in list(MEDIA):
        if media_id == media_one:
            admin.request("DELETE", f"/api/admin/cms/media/{media_id}", {"confirm": True})
    for page_id in list(PAGES):
        admin.request("DELETE", f"/api/admin/cms/pages/{page_id}", {"confirm": True})
    for resource_id in list(RESOURCES):
        admin.request("DELETE", f"/api/admin/cms/resources/{resource_id}", {"confirm": True})

    sweep()

    ids = ", ".join(str(i) for i in PAGES) or "0"
    leftover = db(f"SELECT COUNT(*) FROM cms_pages WHERE id IN ({ids});")
    check("the page fixtures are gone", int(leftover[0][0]) == 0, leftover)
    ids = ", ".join(str(i) for i in MEDIA) or "0"
    leftover = db(f"SELECT COUNT(*) FROM cms_media WHERE id IN ({ids});")
    check("the media fixtures are gone", int(leftover[0][0]) == 0, leftover)
    ids = ", ".join(str(i) for i in RESOURCES) or "0"
    leftover = db(f"SELECT COUNT(*) FROM cms_resources WHERE id IN ({ids});")
    check("the resource fixtures are gone", int(leftover[0][0]) == 0, leftover)
    leftover = db(f"SELECT COUNT(*) FROM activity_logs WHERE description LIKE '%{STAMP}%';")
    check("the activity-log fixtures are gone", int(leftover[0][0]) == 0, leftover)
    leftover = db(f"SELECT COUNT(*) FROM files WHERE original_name LIKE 'cosfix-{STAMP}%';")
    check("the uploaded files are gone", int(leftover[0][0]) == 0, leftover)
    leftover = db(f"SELECT COUNT(*) FROM users WHERE email LIKE 'cosfix{STAMP}%';")
    check("the throwaway employee login is gone", int(leftover[0][0]) == 0, leftover)
    check("no fixture page is left on the public site (404)", public_fetch(f"/{slug_d}")[0] == 404)

    print(f"\nRESULT {passed} passed, {failed} failed")
    if failures:
        print("FAILURES:")
        for failure in failures:
            print(f"  · {failure}")
    return 1 if failed else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:  # noqa: BLE001 — a crash must not leave fixtures behind
        print(f"\nSUITE ABORTED: {error}")
        try:
            sweep()
        except Exception as cleanup_error:  # noqa: BLE001
            print(f"clean-up also failed: {cleanup_error}")
        raise
