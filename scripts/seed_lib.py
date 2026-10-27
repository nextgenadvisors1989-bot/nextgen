"""Shared helpers for the demo seed: an API session (cookies + CSRF), a DB shortcut,
a tiny valid-PDF writer and a multipart encoder. Standard library only."""
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# 127.0.0.1, not localhost: on Windows urllib tries ::1 first and waits ~2 s for it to fail on every request.
BASE = os.environ.get("SEED_BASE", "http://127.0.0.1:3001").rstrip("/")

PASSWORDS = {
    "admin": "Admin@2026",
    "employer": "Employer@2026",
    "auditor": "Auditor@2026",
    "verifier": "Verifier@2026",
    "employee": "Employee@2026",
}


def _env():
    creds = {}
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        match = re.match(r"^DB_(\w+)=(.*)$", line.strip())
        if match:
            creds[match.group(1)] = match.group(2).strip().strip('"').strip("'")
    return creds


def db(statement):
    """Runs one SQL statement through the mysql CLI and returns rows as lists of strings."""
    creds = _env()
    exe = "mysql"
    for candidate in (r"C:\xampp\mysql\bin\mysql.exe",):
        if os.path.exists(candidate):
            exe = candidate
    out = subprocess.run(
        [exe, "--default-character-set=utf8mb4", "-h", creds.get("HOST", "127.0.0.1"), "-u", creds["USER"],
         f"-p{creds['PASSWORD']}", creds["NAME"], "-N", "-B", "-e", statement],
        capture_output=True, text=True, encoding="utf-8",
    )
    if out.returncode != 0:
        raise RuntimeError(f"mysql failed: {out.stderr.strip()}")
    return [line.split("\t") for line in out.stdout.splitlines() if line.strip()]


def q1(statement, default=None):
    rows = db(statement)
    return rows[0][0] if rows and rows[0] else default


def sql_text(value):
    if value is None:
        return "NULL"
    return "'" + str(value).replace("\\", "\\\\").replace("'", "''") + "'"


class Session:
    """Cookie jar + CSRF exactly like the browser panels."""

    def __init__(self, creds=None):
        self.creds = creds
        self.cookies = {}
        self.user = None

    def _jar(self):
        return "; ".join(f"{k}={v}" for k, v in self.cookies.items())

    def _absorb(self, response):
        for header in response.headers.get_all("Set-Cookie") or []:
            pair = header.split(";")[0]
            if "=" in pair:
                key, value = pair.split("=", 1)
                self.cookies[key] = value

    @staticmethod
    def _parse(blob):
        try:
            return json.loads(blob.decode("utf-8", "replace"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return {"raw": blob.decode("utf-8", "replace")[:500]}

    def send(self, method, path, body=None, raw=False, content_type=None):
        headers = {"Cookie": self._jar()}
        if method not in ("GET", "HEAD", "OPTIONS") and "cos_csrf" in self.cookies:
            headers["x-csrf-token"] = self.cookies["cos_csrf"]
        data = None
        if body is not None:
            if isinstance(body, bytes):
                data = body
                headers["Content-Type"] = content_type or "application/octet-stream"
            else:
                data = json.dumps(body).encode()
                headers["Content-Type"] = "application/json"
        request = urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                self._absorb(response)
                blob = response.read()
                return response.status, (blob if raw else self._parse(blob))
        except urllib.error.HTTPError as error:
            self._absorb(error)
            blob = error.read()
            return error.code, (blob if raw else self._parse(blob))

    def login(self, creds=None):
        if creds:
            self.creds = creds
        self.send("GET", "/api/auth/session")
        status, body = self.send("POST", "/api/auth/login", {"identifier": self.creds[0], "password": self.creds[1]})
        if status not in (200, 201):
            return False, f"login {status}: {body}"
        self.user = body.get("user") or (body.get("data") or {}).get("user")
        return True, ""

    def call(self, method, path, body=None, expect=(200, 201), what=""):
        """Sends a request and returns the JSON body; prints a warning when it is refused."""
        status, payload = self.send(method, path, body)
        if status == 401 and self.creds:
            self.login()
            status, payload = self.send(method, path, body)
        if status not in expect:
            message = payload.get("message") if isinstance(payload, dict) else payload
            errors = payload.get("errors") if isinstance(payload, dict) else None
            print(f"  ! {what or method + ' ' + path}: HTTP {status} {message} {json.dumps(errors)[:300] if errors else ''}")
            return None
        return payload

    def upload(self, filename, content, entity_type, entity_id, category, content_type="application/pdf", extra=None):
        fields = [("entityType", entity_type), ("entityId", str(entity_id)), ("category", category)]
        fields += list((extra or {}).items())
        body, ctype = multipart(fields, [("files", filename, content_type, content)])
        status, payload = self.send("POST", "/api/files/upload", body, content_type=ctype)
        if status not in (200, 201):
            print(f"  ! upload {filename}: HTTP {status} {payload.get('message') if isinstance(payload, dict) else payload}")
            return None
        files = payload.get("files") or (payload.get("data") or {}).get("files") or []
        return files[0] if files else payload


def multipart(fields, files):
    boundary = "----cosseed7f3a9c"
    parts = []
    for name, value in fields:
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
    for name, filename, content_type, payload in files:
        parts.append(
            f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'
            f"Content-Type: {content_type}\r\n\r\n".encode() + payload + b"\r\n"
        )
    parts.append(f"--{boundary}--\r\n".encode())
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


def make_pdf(title, lines):
    """A valid one-page A4 PDF (Helvetica) carrying a title and body lines."""
    def esc(text):
        return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)").encode("latin-1", "replace").decode("latin-1")

    content = ["BT /F2 18 Tf 50 790 Td (" + esc(title) + ") Tj ET", "0.8 w 50 778 m 545 778 l S"]
    y = 750
    for line in lines[:45]:
        content.append("BT /F1 11 Tf 50 " + str(y) + " Td (" + esc(line) + ") Tj ET")
        y -= 17
    stream = "\n".join(content).encode("latin-1", "replace")
    objects = [
        b"<</Type/Catalog/Pages 2 0 R>>",
        b"<</Type/Pages/Kids[3 0 R]/Count 1>>",
        b"<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R/F2 6 0 R>>>>>>",
        b"<</Length " + str(len(stream)).encode() + b">>\nstream\n" + stream + b"\nendstream",
        b"<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
        b"<</Type/Font/Subtype/Type1/BaseFont/Helvetica-Bold>>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{index} 0 obj\n".encode() + obj + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode() + b"0000000000 65535 f \n"
    for offset in offsets:
        out += f"{offset:010d} 00000 n \n".encode()
    out += f"trailer<</Size {len(objects) + 1}/Root 1 0 R>>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out)


def section(title):
    print(f"\n== {title}")
