#!/usr/bin/env python3
"""Phase 2 (document vault) end-to-end verification.

Drives the vault the way the admin library does: upload with metadata, list and
filter, download and account for it, upload a new revision and prove the old one
is still served byte-for-byte, edit metadata across the whole version chain,
archive and restore, and finally the activity trail and the panel pages.

Usage:  python3 scripts/verify-files.py [base_url]
Assumes migrations + seeds are loaded and the server is running.
"""
import json
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import date, datetime, timedelta

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3001").rstrip("/")
ADMIN = (__import__("os").environ.get("VERIFY_ADMIN_EMAIL", "admin@complianceos.local"), __import__("os").environ.get("VERIFY_ADMIN_PASSWORD", "Admin@2026"))
EMPLOYER = ("employer.test@complianceos.local", "Employer@2026")

passed = 0
failed = 0
failures = []


def check(name, condition, detail=""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  ✓ {name}")
    else:
        failed += 1
        failures.append(f"{name} — {detail}")
        print(f"  ✗ {name} {('— ' + str(detail)) if detail else ''}")


def multipart(fields, files):
    """Builds a multipart/form-data body; `files` is [(field, filename, bytes, mime)]."""
    boundary = "----COSFIX" + uuid.uuid4().hex
    body = b""
    for key, value in fields.items():
        if value is None or value == "":
            continue
        body += (
            f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'
        ).encode()
    for field, filename, content, mime in files:
        body += (
            f'--{boundary}\r\nContent-Disposition: form-data; name="{field}"; filename="{filename}"\r\n'
            f"Content-Type: {mime}\r\n\r\n"
        ).encode() + content + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    return body, f"multipart/form-data; boundary={boundary}"


class Session:
    """Cookie jar + CSRF, exactly like the browser panel calls."""

    def __init__(self, creds):
        self.creds = creds
        self.cookies = {}
        self.user = None

    def _jar(self):
        return "; ".join(f"{k}={v}" for k, v in self.cookies.items())

    def request(self, method, path, body=None, raw=False, _retry=True):
        status, payload = self._send(method, path, body, raw)
        # A rotated CSRF token or an expired jar shows up as CSRF_FAILED /
        # UNAUTHENTICATED — sign in again and repeat the call once.
        if not raw and status in (401, 403) and isinstance(payload, dict) \
                and payload.get("code") in ("CSRF_FAILED", "UNAUTHENTICATED") and _retry and self.user:
            if self.login()[0]:
                return self._send(method, path, body, raw)
        return status, payload

    def upload(self, path, fields, files):
        return self._send("POST", path, {"__multipart__": (fields, files)}, raw=False)

    def _send(self, method, path, body=None, raw=False):
        url = f"{BASE}{path}"
        data = None
        headers = {"Cookie": self._jar()}
        if method not in ("GET", "HEAD", "OPTIONS") and "cos_csrf" in self.cookies:
            headers["x-csrf-token"] = self.cookies["cos_csrf"]

        if isinstance(body, dict) and "__multipart__" in body:
            fields, files = body["__multipart__"]
            data, content_type = multipart(fields, files)
            headers["Content-Type"] = content_type
        elif body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"

        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req) as resp:
                self._absorb(resp)
                text = resp.read()
                if raw:
                    return resp.status, text
                return resp.status, self._parse(text)
        except urllib.error.HTTPError as err:
            self._absorb(err)
            text = err.read()
            if raw:
                return err.code, text
            return err.code, self._parse(text)

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

    def login(self):
        status, body = self.request("POST", "/api/auth/login", {
            "identifier": self.creds[0], "password": self.creds[1],
        })
        if status not in (200, 201):
            return False, f"login {status}: {body}"
        self.user = body.get("user") or (body.get("data") or {}).get("user")
        return True, ""


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


def reset_fixture():
    """Sweeps anything a previous run left behind, children first (self FK)."""
    db("DELETE FROM files WHERE parent_file_id IS NOT NULL AND original_name LIKE '%COSFIX-%';")
    db("DELETE FROM files WHERE original_name LIKE '%COSFIX-%';")
    db("DELETE FROM files WHERE parent_file_id IS NOT NULL AND category = 'Verification';")
    db("DELETE FROM files WHERE category = 'Verification';")


def data_of(payload):
    if isinstance(payload, dict):
        return payload.get("data")
    return None


def main():
    stamp = datetime.now().strftime("%H%M%S")
    name_v1 = f"COSFIX-{stamp}-licence.pdf"
    name_v2 = f"COSFIX-{stamp}-licence-rev2.pdf"
    renamed = f"COSFIX-{stamp}-renamed.pdf"
    spreadsheet = f"COSFIX-{stamp}-register.csv"
    bytes_v1 = f"%PDF-1.4 fixture revision one {stamp}\n".encode() * 8
    bytes_v2 = f"%PDF-1.4 fixture revision two {stamp} with more content than before\n".encode() * 20
    csv_bytes = b"serial,licence,expiry\n1,TN/PCB/" + stamp.encode() + b",2027-03-31\n"

    print("== Document vault verification")
    print(f"   run stamp {stamp}\n")

    admin = Session(ADMIN)
    ok, error = admin.login()
    if not ok:
        print(f"   cannot sign in as admin: {error}")
        sys.exit(2)

    print("[1] Vault overview and access control")
    reset_fixture()
    status, payload = admin.request("GET", "/api/admin/files?limit=5")
    check("GET /api/admin/files answers 200", status == 200, f"{status} {payload}")
    check("listing carries pagination", isinstance(payload.get("pagination"), dict), str(payload)[:160])
    for key in ("stats", "extensions", "entityBreakdown", "categories", "uploaders", "entityTypes", "accessLevels"):
        check(f"listing carries `{key}`", key in payload, sorted(payload)[:12])
    baseline = int((payload.get("stats") or {}).get("total", 0))
    check("stats expose the vault totals", all(k in (payload.get("stats") or {}) for k in
          ("total", "active", "archived", "totalBytes", "versions", "pdfs", "images")), payload.get("stats"))
    check("entity-type catalogue is complete", len(payload.get("entityTypes") or []) == 16, len(payload.get("entityTypes") or []))

    employer = Session(EMPLOYER)
    eok, eerror = employer.login()
    if not eok:
        print(f"   cannot sign in as employer: {eerror}")
        sys.exit(2)

    status, payload = employer.request("GET", "/api/admin/files")
    check("employer is refused the admin vault", status == 403, f"{status} {payload}")
    status, payload = employer.upload("/api/admin/files", {"entityType": "OTHER"}, [("files", "nope.pdf", b"%PDF nope", "application/pdf")])
    check("employer cannot upload into the admin vault", status == 403, f"{status} {payload}")
    status, payload = admin.request("PATCH", "/api/admin/files/99999999", {"description": "x"})
    check("editing an unknown document answers 404", status == 404, f"{status} {payload}")
    status, payload = admin.request("GET", "/api/admin/files/99999999")
    check("reading an unknown document answers 404", status == 404, f"{status} {payload}")

    print("\n[2] Upload with metadata")
    status, payload = admin.upload(
        "/api/admin/files",
        {
            "entityType": "OTHER", "category": "Verification", "accessLevel": "restricted",
            "description": f"Vault fixture {stamp}", "tags": "fixture,verification", "expiresAt": "2027-03-31",
        },
        [
            ("files", name_v1, bytes_v1, "application/pdf"),
            ("files", spreadsheet, csv_bytes, "text/csv"),
        ],
    )
    check("upload answers 201", status == 201, f"{status} {payload}")
    uploaded = payload.get("files") or []
    check("both files are returned", len(uploaded) == 2, uploaded)
    if len(uploaded) != 2:
        print("   stopping: upload did not return two documents")
        sys.exit(1)
    doc = next(item for item in uploaded if item["original_name"] == name_v1)
    sheet = next(item for item in uploaded if item["original_name"] == spreadsheet)
    check("uploaded payload carries id, url, size and version 1",
          all(k in doc for k in ("id", "url", "size_bytes", "version")) and doc["version"] == 1, doc)
    check("stored byte count matches what was sent", int(doc["size_bytes"]) == len(bytes_v1), f"{doc['size_bytes']} vs {len(bytes_v1)}")
    doc_id = int(doc["id"])
    sheet_id = int(sheet["id"])

    status, payload = admin.request("GET", f"/api/admin/files/{doc_id}")
    check("detail answers 200", status == 200, f"{status} {payload}")
    document = payload.get("document") or {}
    check("metadata persisted exactly as sent",
          document.get("category") == "Verification" and document.get("access_level") == "restricted"
          and document.get("tags") == "fixture,verification" and document.get("description") == f"Vault fixture {stamp}",
          {k: document.get(k) for k in ("category", "access_level", "tags", "description")})
    check("checksum was recorded", bool(re.fullmatch(r"[0-9a-f]{64}", str(document.get("checksum_sha256") or ""))), document.get("checksum_sha256"))
    check("document starts at version 1 of 1",
          int(document.get("version_count", 0)) == 1 and int(document.get("latest_version", 0)) == 1, document.get("version_count"))
    check("download counter starts at zero", int(payload.get("downloadCount", -1)) == 0, payload.get("downloadCount"))
    versions = payload.get("versions") or []
    check("version history holds the initial upload",
          len(versions) == 1 and versions[0]["change_note"] == "Initial upload", versions)
    check("current revision points at the uploaded row", int((payload.get("current") or {}).get("id", 0)) == doc_id, payload.get("current"))

    status, payload = admin.upload("/api/admin/files", {"entityType": "NOT_A_MODULE"}, [("files", "x.pdf", b"%PDF", "application/pdf")])
    check("unknown entity type is refused 422", status == 422, f"{status} {payload}")
    status, payload = admin.upload("/api/admin/files", {"entityType": "OTHER", "accessLevel": "everyone"}, [("files", "x.pdf", b"%PDF", "application/pdf")])
    check("unknown access level is refused 422", status == 422, f"{status} {payload}")
    status, payload = admin.upload("/api/admin/files", {"entityType": "OTHER"}, [])
    check("an upload without a file is refused", status == 400, f"{status} {payload}")

    print("\n[3] Download and access accounting")
    status, body = admin.request("GET", f"/api/files/{doc_id}/download", raw=True)
    check("the current revision downloads", status == 200, f"{status}")
    check("downloaded bytes are identical to the upload", body == bytes_v1, f"{len(body or b'')} vs {len(bytes_v1)}")
    status, body = admin.request("GET", f"/api/files/{sheet_id}/download", raw=True)
    check("the spreadsheet downloads too", status == 200 and body == csv_bytes, f"{status}")
    logs = db(f"SELECT COUNT(*) FROM file_access_logs WHERE file_id = {doc_id} AND action = 'download';")
    check("the download is recorded in file_access_logs", logs and int(logs[0][0]) >= 1, logs)
    status, payload = admin.request("GET", f"/api/admin/files/{doc_id}")
    check("the detail page counts the download", int(payload.get("downloadCount", 0)) >= 1, payload.get("downloadCount"))
    status, payload = admin.request("GET", "/api/admin/files?limit=5")
    check("the vault total grew by the two uploads", int((payload.get("stats") or {}).get("total", 0)) >= baseline + 2,
          f"{payload.get('stats')} baseline {baseline}")

    print("\n[4] New revision")
    status, payload = admin.upload(f"/api/admin/files/{doc_id}/versions", {"changeNote": f"Revision two {stamp}"},
                                   [("files", name_v2, bytes_v2, "application/pdf")])
    check("new revision answers 200", status == 200, f"{status} {payload}")
    check("revision number is 2", int(payload.get("version", 0)) == 2, payload)
    check("revision is attached to the same document", int(payload.get("rootId", 0)) == doc_id, payload)
    new_version_id = int(payload.get("id", 0))

    status, payload = admin.request("GET", f"/api/admin/files/{doc_id}")
    document = payload.get("document") or {}
    check("document now reports two versions", int(document.get("version_count", 0)) == 2, document.get("version_count"))
    check("current revision is v2", int((payload.get("current") or {}).get("version", 0)) == 2, payload.get("current"))
    check("current revision carries the new byte count",
          int(document.get("current_size_bytes", 0)) == len(bytes_v2), f"{document.get('current_size_bytes')} vs {len(bytes_v2)}")
    versions = payload.get("versions") or []
    check("history lists both revisions newest first",
          [int(v["version"]) for v in versions] == [2, 1], [v["version"] for v in versions])
    check("the change note is kept on the revision",
          any(v.get("change_note") == f"Revision two {stamp}" for v in versions), versions)
    check("the uploader is stamped on each revision",
          all(v.get("uploaded_by_name") for v in versions), versions)

    status, body = admin.request("GET", f"/api/files/{doc_id}/download", raw=True)
    check("the old revision is still served (immutability)", status == 200 and body == bytes_v1, f"{status} {len(body or b'')}")
    status, body = admin.request("GET", f"/api/files/{new_version_id}/download", raw=True)
    check("the new revision serves the new bytes", status == 200 and body == bytes_v2, f"{status} {len(body or b'')}")

    status, payload = admin.request("GET", f"/api/admin/files?search={name_v1}&limit=10")
    rows = payload.get("data") or []
    row = next((item for item in rows if int(item["id"]) == doc_id), None)
    check("the listing shows the document once, at its latest revision",
          row is not None and int(row.get("latest_version", 0)) == 2 and int(row.get("version_count", 0)) == 2,
          {"rows": len(rows), "row": row and row.get("latest_version")})
    check("the listing exposes the current revision's id",
          row is not None and int(row.get("current_file_id", 0)) == new_version_id, row and row.get("current_file_id"))

    print("\n[5] Metadata editing")
    status, payload = admin.request("PATCH", f"/api/admin/files/{doc_id}", {
        "original_name": renamed, "category": "Licence", "tags": "renewal-due",
        "description": f"Renamed fixture {stamp}", "access_level": "public", "expires_at": "2028-01-31",
    })
    check("metadata edit answers 200", status == 200, f"{status} {payload}")
    status, payload = admin.request("GET", f"/api/admin/files/{doc_id}")
    document = payload.get("document") or {}
    check("every edited field persisted",
          document.get("original_name") == renamed and document.get("category") == "Licence"
          and document.get("tags") == "renewal-due" and document.get("access_level") == "public"
          and str(document.get("expires_at") or "").startswith("2028-01-31"),
          {k: document.get(k) for k in ("original_name", "category", "tags", "access_level", "expires_at")})
    chain = db(f"SELECT COUNT(*) FROM files WHERE original_name = '{renamed}' AND (id = {doc_id} OR parent_file_id = {doc_id});")
    check("the rename applies to the whole version chain", chain and int(chain[0][0]) == 2, chain)
    status, payload = admin.request("PATCH", f"/api/admin/files/{doc_id}", {})
    check("an empty edit is refused 409", status == 409, f"{status} {payload}")
    status, payload = admin.request("PATCH", f"/api/admin/files/{doc_id}", {"access_level": "owners-only"})
    check("an invalid access level is refused 422", status == 422, f"{status} {payload}")

    print("\n[6] Listing, filters and sorting")
    status, payload = admin.request("GET", f"/api/admin/files?search={stamp}&limit=10")
    rows = payload.get("data") or []
    check("search finds the fixtures by name", len(rows) >= 2, len(rows))
    check("the CSV fixture is in the results", any(int(r["id"]) == sheet_id for r in rows), [r["id"] for r in rows])

    status, payload = admin.request("GET", "/api/admin/files?entity_type=EMPLOYER&search=" + stamp)
    check("filtering by module excludes the OTHER fixtures", not (payload.get("data") or []), payload.get("data"))

    status, payload = admin.request("GET", "/api/admin/files?access_level=public&search=" + stamp)
    check("filtering by access level finds the edited document",
          any(int(r["id"]) == doc_id for r in payload.get("data") or []), payload.get("data"))
    status, payload = admin.request("GET", "/api/admin/files?access_level=private&search=" + stamp)
    check("filtering by a level nothing uses returns nothing", not (payload.get("data") or []), payload.get("data"))

    status, payload = admin.request("GET", "/api/admin/files?kind=pdf&search=" + stamp)
    check("filtering by kind=pdf finds the document",
          any(int(r["id"]) == doc_id for r in payload.get("data") or []), payload.get("data"))
    status, payload = admin.request("GET", "/api/admin/files?kind=sheet&search=" + stamp)
    check("filtering by kind=sheet finds the spreadsheet",
          any(int(r["id"]) == sheet_id for r in payload.get("data") or []), payload.get("data"))
    status, payload = admin.request("GET", "/api/admin/files?kind=image&search=" + stamp)
    check("filtering by kind=image returns nothing", not (payload.get("data") or []), payload.get("data"))

    status, payload = admin.request("GET", "/api/admin/files?category=Licence&search=" + stamp)
    check("filtering by category finds the renamed document",
          any(int(r["id"]) == doc_id for r in payload.get("data") or []), payload.get("data"))

    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    today = date.today().isoformat()
    status, payload = admin.request("GET", f"/api/admin/files?from_date={tomorrow}&search={stamp}")
    check("uploaded-from tomorrow returns nothing", not (payload.get("data") or []), payload.get("data"))
    status, payload = admin.request("GET", f"/api/admin/files?from_date={today}&search={stamp}")
    check("uploaded-from today finds the fixtures", len(payload.get("data") or []) >= 2, payload.get("data"))

    status, payload = admin.request("GET", "/api/admin/files?limit=50&sortBy=size_bytes&sortDir=desc")
    check("sorting by size answers 200", status == 200, f"{status} {payload}")
    sizes = [int(r.get("current_size_bytes") or r.get("size_bytes") or 0) for r in payload.get("data") or []]
    check("sorting by size descending is respected", sizes == sorted(sizes, reverse=True), sizes[:6])
    status, payload = admin.request("GET", "/api/admin/files?limit=50&sortBy=size_bytes&sortDir=asc")
    sizes = [int(r.get("current_size_bytes") or r.get("size_bytes") or 0) for r in payload.get("data") or []]
    check("sorting ascending flips the order", sizes == sorted(sizes), sizes[:6])

    # Every key the library offers must survive the ORDER BY it produces.
    for key in ("original_name", "size_bytes", "version", "created_at", "updated_at",
                "download_count", "entity_type", "access_level", "category", "expires_at"):
        status, payload = admin.request("GET", f"/api/admin/files?limit=5&sortBy={key}&sortDir=asc")
        check(f"sorting by `{key}` is accepted", status == 200 and isinstance(payload.get("data"), list), f"{status} {payload}")

    status, payload = admin.request("GET", f"/api/admin/files?search={stamp}&limit=1")
    check("limit=1 returns a single row", len(payload.get("data") or []) == 1, payload.get("data"))
    check("pagination reports the limit and totals",
          int(payload.get("pagination", {}).get("limit", 0)) == 1 and int(payload.get("pagination", {}).get("total", 0)) >= 2,
          payload.get("pagination"))

    status, payload = admin.request("GET", "/api/admin/files?sortBy=" + urllib.parse.quote("id; DROP TABLE files"))
    check("an unknown sort column falls back instead of failing", status == 200, f"{status} {payload}")
    check("the table survives the sort attempt", bool(db("SHOW TABLES LIKE 'files';")), "files table missing")

    status, payload = admin.request("GET", "/api/admin/files?limit=5")
    uploaders = payload.get("uploaders") or []
    check("the uploader facet lists the admin", any(int(u["id"]) == int(admin.user["id"]) for u in uploaders), uploaders)
    check("the extension facet lists pdf and csv",
          any(e["extension"] == "pdf" for e in payload.get("extensions") or [])
          and any(e["extension"] == "csv" for e in payload.get("extensions") or []),
          payload.get("extensions"))
    check("the category facet includes the fixtures' categories",
          "Licence" in (payload.get("categories") or []) and "Verification" in (payload.get("categories") or []),
          payload.get("categories"))

    print("\n[7] Archive, restore and the activity trail")
    status, payload = admin.request("DELETE", f"/api/admin/files/{doc_id}")
    check("archiving answers 200", status == 200, f"{status} {payload}")
    status, payload = admin.request("GET", f"/api/admin/files?search={stamp}&status=current")
    check("an archived document leaves the active listing",
          not any(int(r["id"]) == doc_id for r in payload.get("data") or []), payload.get("data"))
    status, payload = admin.request("GET", f"/api/admin/files?search={stamp}&status=archived")
    check("the archived filter finds it", any(int(r["id"]) == doc_id for r in payload.get("data") or []), payload.get("data"))
    status, payload = admin.request("GET", f"/api/admin/files?search={stamp}&status=all")
    check("status=all shows active and archived together", any(int(r["id"]) == doc_id for r in payload.get("data") or []), payload.get("data"))
    status, payload = admin.request("GET", f"/api/admin/files/{doc_id}")
    check("an archived document is still readable", status == 200 and bool(payload.get("versions")), f"{status}")
    status, payload = admin.request("PATCH", f"/api/admin/files/{doc_id}", {"is_archived": False})
    check("restoring answers 200", status == 200, f"{status} {payload}")
    status, payload = admin.request("GET", f"/api/admin/files?search={stamp}&status=current")
    check("the restored document is back in the active listing",
          any(int(r["id"]) == doc_id for r in payload.get("data") or []), payload.get("data"))

    status, payload = admin.request("GET", f"/api/admin/activity-logs?entityType=OTHER&entityId={doc_id}&limit=25")
    check("the activity trail answers 200", status == 200, f"{status} {payload}")
    entries = payload.get("data") or []
    actions = {entry.get("action") for entry in entries}
    check("the trail records the upload", "uploaded" in actions, actions)
    check("the trail records the revision", "updated" in actions, actions)
    check("the trail records the archive", "archived" in actions, actions)
    check("the trail records the restore", "restored" in actions, actions)
    check("trail entries carry the acting user", all(entry.get("user_name") for entry in entries), entries[:2])

    print("\n[8] Panel pages")
    for path, needle, label in (
        ("/admin/files", "Document Vault", "vault library"),
        (f"/admin/files/{doc_id}", renamed, "document detail"),
    ):
        status, body = admin.request("GET", path, raw=True)
        text = body.decode("utf-8", "replace") if isinstance(body, bytes) else str(body)
        check(f"{label} renders 200", status == 200, f"{status}")
        check(f"{label} shows its content", needle in text, text[:200])
    status, body = admin.request("GET", "/admin/files/99999999", raw=True)
    check("an unknown document id reaches the 404 page", status == 404, f"{status}")

    print("\n[9] Clean-up")
    reset_fixture()
    left = db("SELECT COUNT(*) FROM files WHERE original_name LIKE '%COSFIX-%';")
    check("the fixture documents were swept", left and int(left[0][0]) == 0, left)
    leftovers = db("SELECT COUNT(*) FROM files WHERE category = 'Verification';")
    check("no fixture categories linger", leftovers and int(leftovers[0][0]) == 0, leftovers)
    orphan = db(f"SELECT COUNT(*) FROM file_versions WHERE file_id = {doc_id};")
    check("the revision history went with the documents", orphan and int(orphan[0][0]) == 0, orphan)
    status, payload = admin.request("GET", "/api/admin/files?limit=5")
    check("the vault still answers after clean-up", status == 200 and isinstance(payload.get("data"), list), status)

    print(f"\n== RESULT: {passed} passed, {failed} failed")
    if failures:
        print("\nFailures:")
        for item in failures:
            print(f"  - {item}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
