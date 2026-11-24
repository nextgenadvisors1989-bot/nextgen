"""Home page editor check: what the client's staff can change on the public home page, through the API and the page itself.

    python scripts/verify-home-editor.py      (server on http://127.0.0.1:3001 with the demo data seeded)

Covers: the editor lists every block; saving changes the public page at once; a hidden block disappears and comes back;
a list the editor emptied stays empty; "back to the standard text" restores the default; unsafe links (javascript:) and
unsafe photo addresses are refused; the photo upload accepts only images; only people with the page permission can save.
The blocks it touches are put back to the standard text at the end. Exit code 1 if any check fails."""
import re
import struct
import sys
import zlib

sys.path.insert(0, __file__.rsplit("scripts", 1)[0] + "scripts")
from seed_lib import PASSWORDS, Session, multipart  # noqa: E402

PASS, FAIL = [], []


def check(name, condition, detail=""):
    (PASS if condition else FAIL).append(name)
    print(("  ok  " if condition else "  FAIL") + f" {name}" + (f"  -> {detail}" if not condition and detail else ""))


def login(email, role):
    session = Session((email, PASSWORDS[role]))
    ok, detail = session.login()
    if not ok:
        sys.exit(f"cannot sign in as {email}: {detail}")
    return session


def data(response):
    return response[1].get("data") if isinstance(response[1], dict) else None


def png(width=40, height=50, colour=(11, 30, 54)):
    raw = b"".join(b"\x00" + bytes(colour) * width for _ in range(height))
    def chunk(kind, payload):
        body = kind + payload
        return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


admin = login("demo.admin@complianceos.local", "admin")
employer = login("balaji.hr@demo.complianceos.local", "employer")
anon = Session(("nobody@example.com", "x"))

TOUCHED = ["services", "spotlight", "proof", "pillars", "hero", "acts"]


def home():
    status, body = anon.send("GET", "/", raw=True)
    return status, body.decode("utf-8", "replace")


print("== the editor")
status, body = admin.send("GET", "/api/admin/cms/home")
state = body if isinstance(body, dict) else {}
blocks = {b["key"]: b for b in state.get("blocks", [])}
check("the administrator can open the editor", status == 200 and blocks, f"{status}")
check("every block of the home page is listed", {"hero", "gateways", "pillars", "proof", "services", "spotlight", "statutory", "acts", "links_central",
                                                   "links_state", "reports_grid", "expertise", "industries", "certifications", "enquiry"} <= set(blocks), sorted(blocks))
check("the principal block exists with the name Kannan until it is changed", blocks.get("spotlight", {}).get("heading") == "Kannan", blocks.get("spotlight"))
check("an employer cannot open the editor", employer.send("GET", "/api/admin/cms/home")[0] in (401, 403))
check("a visitor cannot open the editor", anon.send("GET", "/api/admin/cms/home")[0] in (401, 403))
check("an employer cannot save a block", employer.send("PUT", "/api/admin/cms/home/services", {"heading": "Hacked"})[0] in (401, 403))

print("== saving shows on the public page")
original_services = blocks["services"]
status, body = admin.send("PUT", "/api/admin/cms/home/services", {
    "heading": "ZZ TEST services heading", "subheading": "ZZ TEST sub", "hidden": False,
    "items": [{"title": "ZZ TEST service one", "text": "First description", "link": "/services", "linkLabel": "Open"},
              {"title": "ZZ TEST service two", "text": "Second <script>alert(1)</script>", "link": "https://example.org/x"}]})
check("a block saves", status == 200, f"{status} {body}")
_, html = home()
check("the public home page shows the new heading", "ZZ TEST services heading" in html)
check("the public home page shows both rows", "ZZ TEST service one" in html and "ZZ TEST service two" in html)
check("pasted script is shown as words, not run", "<script>alert(1)</script>" not in html and "alert(1)" in html)
check("the footer service list follows the same block", html.count("ZZ TEST service one") >= 2, html.count("ZZ TEST service one"))

print("== hide and show")
admin.send("PUT", "/api/admin/cms/home/services", {"heading": "ZZ TEST services heading", "hidden": True, "items": [{"title": "ZZ TEST service one"}]})
_, html = home()
check("a hidden block is not on the page", "ZZ TEST services heading" not in html)
check("hiding does not bring the default text back", "Our Core Advisory Services" not in html)
admin.send("PUT", "/api/admin/cms/home/services", {"heading": "ZZ TEST services heading", "hidden": False, "items": [{"title": "ZZ TEST service one"}]})
_, html = home()
check("showing it again brings it back", "ZZ TEST services heading" in html)
status, body = admin.send("PUT", "/api/admin/cms/home/hero", {"heading": "NextGen Socio & Enviro Advisors", "hidden": True})
check("the top banner cannot be hidden (it stays visible)", status == 200 and "NextGen Socio &amp; Enviro Advisors" in home()[1])

print("== an emptied list stays empty")
admin.send("PUT", "/api/admin/cms/home/proof", {"hidden": False, "items": []})
_, html = home()
check("the numbers strip disappears when its rows are removed", "The company in figures" not in html)

print("== unsafe input is refused")
status, body = admin.send("PUT", "/api/admin/cms/home/services", {"heading": "x", "items": [{"title": "Bad link", "link": "javascript:alert(1)"}]})
check("a javascript: link is refused", status == 422, f"{status} {body}")
status, _ = admin.send("PUT", "/api/admin/cms/home/spotlight", {"heading": "Kannan", "imageUrl": "javascript:alert(1)"})
check("an unsafe photo address is refused", status == 422)
status, _ = admin.send("PUT", "/api/admin/cms/home/spotlight", {"heading": "", "items": []})
check("the principal's name is required", status == 422)
status, _ = admin.send("PUT", "/api/admin/cms/home/nope", {"heading": "x"})
check("an unknown block is a 404", status == 404)
many = [{"title": f"Service {i}"} for i in range(40)]
check("too many rows are refused", admin.send("PUT", "/api/admin/cms/home/services", {"heading": "x", "items": many})[0] == 422)

print("== the principal")
status, _ = admin.send("PUT", "/api/admin/cms/home/spotlight", {"heading": "ZZ TEST Principal", "subheading": "Founder", "html": "A short message.\nSecond line.", "items": [{"title": "Chartered Engineer"}]})
check("the principal block saves", status == 200)
_, html = home()
check("name, designation, message and highlight are on the page", all(t in html for t in ("ZZ TEST Principal", "Founder", "A short message.", "Chartered Engineer")))
check("the principal's own portrait ships with the site (no monogram, no broken image)", '/brand/kannan.jpg' in html and "photo to be added" not in html)
check("the portrait file is served", anon.send("GET", "/brand/kannan.jpg", raw=True)[0] == 200)
body, content_type = multipart([], [("file", "note.txt", "text/plain", b"hello")])
status, _ = admin.send("POST", "/api/admin/cms/home/photo", body, content_type=content_type)
check("the photo upload refuses a text file", status == 422, status)
body, content_type = multipart([], [("file", "portrait.png", "image/png", png())])
status, result = admin.send("POST", "/api/admin/cms/home/photo", body, content_type=content_type)
url = (result or {}).get("url") if isinstance(result, dict) else None
check("the photo upload accepts a PNG and returns its address", status == 200 and bool(url), f"{status} {result}")
if url:
    admin.send("PUT", "/api/admin/cms/home/spotlight", {"heading": "ZZ TEST Principal", "imageUrl": url})
    _, html = home()
    check("the photo is on the home page", url in html and "photo to be added" not in html, url)
    image_status, _ = anon.send("GET", url, raw=True)
    check("a visitor can load the photo", image_status == 200, image_status)

print("== back to the standard text")
for key in TOUCHED:
    admin.send("DELETE", f"/api/admin/cms/home/{key}")
_, html = home()
check("the standard services heading is back", "Our Core Advisory Services" in html)
check("the test text is gone", "ZZ TEST" not in html)
check("the standard principal block is back (Kannan, with the portrait)", ">Kannan<" in html and '/brand/kannan.jpg' in html)
check("a block that was never saved can be reset without error", admin.send("DELETE", "/api/admin/cms/home/services")[0] == 200)

print(f"\nRESULT {len(PASS)} passed, {len(FAIL)} failed")
if FAIL:
    print("FAILURES:")
    for name in FAIL:
        print("  -", name)
    sys.exit(1)
