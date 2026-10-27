"""Seed stage: the client's reference documents and images, filed in the CMS resource library and media library.

Every PDF becomes a downloadable resource with a category (Water, Environment and ETP, Energy and GHG, Safety, Legal, Textile
Standards, Social Compliance, Payroll, Reference), so the administrator can re-title, re-categorise, replace the file, publish or
hide it from Admin > CMS > Resources. Documents that hold employee names or wages are filed as drafts (not on the public site).
Every image goes to the media library with a title, a folder and alt text.

Source folder: SEED_SOURCE env var, default C:/Users/kisho/Desktop/Antony/Socio/source
"""
import os
import re
from pathlib import Path

from seed_common import admin
from seed_lib import multipart, q1, section, sql_text

SOURCE = Path(os.environ.get("SEED_SOURCE", r"C:\Users\kisho\Desktop\Antony\Socio\source"))

# (substrings in the lower-case file name, category, resource type, private?)   first match wins
RULES = [
    (("bbg", "combain ia", "comparision", "f1 report", "22054", "ctc calculation", "wages", "employee.pdf"), "Payroll and Wages", "Report", True),
    (("payroll",), "Payroll and Wages", "Checklist", False),
    (("gots", "grs", "ocs ", "rcs ", "rws ", "ocs-", "f007", "f425", "f422", "chemcheck", "archroma"), "Textile Standards", "Checklist", False),
    (("etp", "assessemetn", "assessment", "cap.pdf", "capar", "cap template", "report and cap", "envir", "certified compliance", "ground water", "waste", "wste", "environmental"), "Environment and ETP", "Report", False),
    (("ghg", "carbon", "energy", "electricity", "fuels", "refrigerants", "freight", "flight", "business", "bioenrgy", "owned", "home office", "wtt", "baseline",
      "data collection", "definations", "disclimere", "target", "calculation", "2017", "2022", "2023", "sheet2", "matrial", "working", "steps", "your organization", "info.pdf", "master", "guide", "data.pdf", "chart"), "Energy and GHG", "Template", False),
    (("water", "boiler", "borewe", "canteen", "toilet", "hydrant", "ro ", "ro.", "lab", "stp", "guest", "gardening", "gardeingings", "food", "bore"), "Water", "Template", False),
    (("safety", "oh and", "oh&s", "risk engineering", "traingng", "training"), "Safety and OH&S", "Report", False),
    (("legal", "13 x 19", "factory profile", "register"), "Legal Registers", "Checklist", False),
    (("wrap", "sedex", "site info", "recruit", "social", "minutes", "audit and requirement"), "Social Compliance", "Checklist", False),
]


def classify(name):
    low = name.lower()
    for needles, category, rtype, private in RULES:
        if any(needle in low for needle in needles):
            return category, rtype, private
    return "Client Reference Documents", "Guide", False


def title_of(path):
    stem = re.sub(r"\s*\(\d+\)$", "", path.stem.replace("_", " "))
    stem = re.sub(r"\s+", " ", stem).strip()
    if stem.islower():
        stem = stem.title()
    if len(stem) < 4 or stem.lower() in {"employee", "report", "reports", "login", "admin", "about", "contact", "services", "resources"}:
        stem = f"{stem} - client document"
    return stem[:240]


IMAGES = {
    "3.04.22 PM (1)": ("Full and Final Settlement Statement - sheet format", "Payroll and F&F formats"),
    "3.04.22 PM": ("Full and Final Settlement - rules, components and format", "Payroll and F&F formats"),
    "3.04.23 PM": ("Full and Final Settlement Letter format", "Payroll and F&F formats"),
    "3.05.13 PM": ("HR, payroll and employee management software overview", "Brochures"),
    "3.05.15 PM (1)": ("Compliance calendar - major legal compliances for factories and industries", "Compliance calendars"),
    "3.05.15 PM": ("Legal compliance calendar and legal documents checklist", "Compliance calendars"),
    "3.05.21 PM (1)": ("Safety compliance calendar - 70 requirements", "Compliance calendars"),
    "3.05.21 PM": ("HAZOP study and risk assessment", "Safety and risk references"),
    "3.05.22 PM (1)": ("Environmental compliance calendar for EHS professionals in India", "Compliance calendars"),
    "3.05.22 PM (2)": ("Fire safety audit and risk assessment (Tamil Nadu)", "Safety and risk references"),
    "3.05.22 PM": ("Lockout / Tagout (LOTO)", "Safety and risk references"),
    "3.05.23 PM (1)": ("Social security compliance calendar for employers in India", "Compliance calendars"),
    "3.05.23 PM (2)": ("Safety compliance calendar - 50 requirements", "Compliance calendars"),
    "3.05.23 PM": ("Safety compliance calendar as per OSHW Code and Factories Act", "Compliance calendars"),
    "3.05.24 PM (1)": ("LWG environmental stewardship audit certificate (sample)", "Certificates"),
    "3.05.24 PM": ("Factory audit (internal and external) under the Factories Act", "Safety and risk references"),
    "3.05.25 PM (1)": ("Fire alarm design", "Calculations and formulas"),
    "3.05.25 PM (2)": ("Lifting calculation formula sheet", "Calculations and formulas"),
    "3.05.25 PM": ("Safety calculations - LTIFR, TRIR, AFR, ASR and more", "Calculations and formulas"),
    "3.05.26 PM (1)": ("NextGen brochure - integrated safety, environment and compliance solutions", "Brochures"),
    "3.05.26 PM": ("NextGen website home page design", "Brand and website designs"),
    "3.05.28 PM (1)": ("NextGen professional services poster", "Brochures"),
    "3.05.28 PM": ("One Legal Culture website home page design", "Brand and website designs"),
    "3.05.29 PM (1)": ("NextGen core compliance services brochure", "Brochures"),
    "3.05.29 PM": ("Risk rating matrix and standard risk heat map", "Calculations and formulas"),
    "3.05.30 PM (1)": ("NextGen services brochure - factory and statutory compliance", "Brochures"),
    "3.05.30 PM (2)": ("Fire pump flow calculation", "Calculations and formulas"),
    "3.05.30 PM": ("What is a safety audit and its types", "Safety and risk references"),
    "3.05.31 PM (1)": ("Sustainability and environment in industry - controls and measures", "Safety and risk references"),
    "3.05.31 PM": ("HIRA versus risk assessment", "Safety and risk references"),
    "3.05.32 PM": ("Smart employee ID card and workforce management software", "Brochures"),
    "10.30.39 AM (1)": ("NextGen website home page design (full page)", "Brand and website designs"),
    "10.30.39 AM": ("One Legal Culture website home page design (full page)", "Brand and website designs"),
}


def image_meta(path):
    for key, value in IMAGES.items():
        if path.name.startswith("WhatsApp Image") and path.stem.endswith(key):
            return value
    return (path.stem, "Client reference images")


def stage_library():
    if not SOURCE.exists():
        print(f"  source folder not found: {SOURCE}")
        return

    section("Reference documents -> CMS resources")
    pdfs = sorted(p for p in SOURCE.iterdir() if p.is_file() and (p.suffix.lower() == ".pdf" or p.read_bytes()[:4] == b"%PDF"))
    created = 0
    for index, path in enumerate(pdfs, start=1):
        title = title_of(path)
        if q1(f"SELECT id FROM cms_resources WHERE title={sql_text(title)} AND deleted_at IS NULL"):
            continue
        category, rtype, private = classify(path.name)
        uploaded = admin.upload(path.name if path.suffix else path.name + ".pdf", path.read_bytes(), "OTHER", 0, "Resource")
        file_id = (uploaded or {}).get("id")
        if not file_id:
            continue
        result = admin.call("POST", "/api/admin/cms/resources", {
            "title": title, "resource_type": rtype, "category": category, "file_id": int(file_id),
            "description": f"Client document: {path.name}", "requires_login": True,
            "status": "draft" if private else "published"}, what=f"resource {title}")
        if result:
            created += 1
        if index % 20 == 0:
            print(f"  ... {index}/{len(pdfs)}")
    print(f"  {created} resource(s) created")

    section("Images -> media library")
    images = sorted(p for p in SOURCE.iterdir() if p.is_file() and p.suffix.lower() in (".jpg", ".jpeg", ".png"))
    done = 0
    for path in images:
        title, folder = image_meta(path) if path.name != "logo.png" else ("NextGen logo", "Brand and website designs")
        if q1(f"SELECT id FROM cms_media WHERE title={sql_text(title)} AND deleted_at IS NULL"):
            continue
        body, ctype = multipart([("folder", folder), ("alt_text", title), ("tags", folder.lower().replace(" ", "-"))],
                                [("files", path.name.replace(" ", "_"), "image/png" if path.suffix.lower() == ".png" else "image/jpeg", path.read_bytes())])
        status, payload = admin.send("POST", "/api/admin/cms/media/upload", body, content_type=ctype)
        if status not in (200, 201):
            print(f"  ! media {path.name}: {status} {payload.get('message') if isinstance(payload, dict) else payload}")
            continue
        created_ids = (payload.get("created") or (payload.get("data") or {}).get("created") or []) if isinstance(payload, dict) else []
        if created_ids:
            admin.call("PUT", f"/api/admin/cms/media/{int(created_ids[0])}", {"title": title, "alt_text": title, "folder": folder}, what=f"media title {title}")
            done += 1
    print(f"  {done} image(s) filed")
