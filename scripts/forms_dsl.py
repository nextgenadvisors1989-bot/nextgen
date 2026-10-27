"""A tiny DSL for describing audit forms in the shape the form builder API (PUT /api/admin/dynamic-forms/:id) takes.

    sec("Water requirements", num("process", "Process (KLD)"), formula("total", "Total (KLD)", "process + cooling"))
    table_sec("Cooling towers", "cooling_towers", [col("tower", "Cooling tower"), colnum("circulation", "Circulation (KL/hr)")])

Keys are generated from labels when not given, so a checklist of 70 requirements is one call to `checklist()`.
"""
import re

YES_NO_NA = ["Yes", "No", "Not applicable"]
AVAILABLE = ["Available", "Partly available", "Not available", "Not applicable"]
COMPLIANCE = ["Compliant", "Non-compliant", "Partly compliant", "Not applicable"]
RATING = ["Excellent", "Good", "Satisfactory", "Needs improvement", "Critical"]

_used = {}


def slug(text, prefix="f"):
    base = re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")[:44] or prefix
    if not re.match(r"^[a-z]", base):
        base = f"{prefix}_{base}"
    return base


def reset_keys():
    _used.clear()


def unique(key):
    n = _used.get(key, 0)
    _used[key] = n + 1
    return key if n == 0 else f"{key}_{n + 1}"


def opts(values):
    """Plain labels, (label, score) pairs, or ready-made option dicts (a calculated grade needs the key "3" to print as "Green")."""
    out = []
    for v in values:
        if isinstance(v, dict):
            out.append(v)
        elif isinstance(v, tuple):
            out.append({"option_key": slug(str(v[0]), "o"), "option_label": str(v[0])[:250], "score": v[1]})
        else:
            out.append({"option_key": slug(str(v), "o"), "option_label": str(v)[:250]})
    return out


YES_NO_SCORED = [("Yes", 1), ("No", 0)]
GRADE_RYG = [{"option_key": "1", "option_label": "Red"}, {"option_key": "2", "option_label": "Yellow"}, {"option_key": "3", "option_label": "Green"}]


def _field(label, ftype, key=None, w=6, req=False, help=None, options=None, formula=None, placeholder=None, default=None, readonly=False, pdf=True):
    f = {"field_key": key or unique(slug(label)), "label": label, "field_type": ftype, "column_width": w, "is_required": req, "show_in_pdf": pdf}
    if help:
        f["help_text"] = help
    if options:
        f["options"] = opts(options)
    if formula:
        f["formula_expression"] = formula
    if placeholder:
        f["placeholder"] = placeholder
    if default is not None:
        f["default_value"] = str(default)
    if readonly:
        f["is_readonly"] = True
    return f


def text(label, **kw):
    return _field(label, "text", **kw)


def area(label, **kw):
    kw.setdefault("w", 12)
    return _field(label, "textarea", **kw)


def num(label, **kw):
    return _field(label, "decimal", **kw)


def date(label, **kw):
    return _field(label, "date", **kw)


def select(label, options, **kw):
    return _field(label, "select", options=options, **kw)


def yesno(label, **kw):
    return _field(label, "select", options=YES_NO_NA, **kw)


def multi(label, options, **kw):
    return _field(label, "multi_select", options=options, **kw)


def formula(label, expression, **kw):
    return _field(label, "formula", formula=expression, readonly=True, **kw)


def upload(label, **kw):
    kw.setdefault("w", 12)
    return _field(label, "multi_file", **kw)


def note(textual):
    return {"field_key": unique("note"), "label": textual, "field_type": "paragraph", "column_width": 12, "show_in_pdf": True}


def col(label, key=None, ctype="text", width=None, options=None, formula=None, total=False, req=False):
    c = {"column_key": key or slug(label, "c"), "column_label": label, "column_type": ctype, "is_editable": ctype != "formula",
         "is_required": req, "is_total": total, "show_in_pdf": True}
    if width:
        c["width_pct"] = width
    if options:
        c["options_json"] = opts(options)
    if formula:
        c["formula_expression"] = formula
    return c


def colnum(label, key=None, **kw):
    return col(label, key, "decimal", **kw)


def coldate(label, key=None, **kw):
    return col(label, key, "date", **kw)


def colsel(label, options, key=None, **kw):
    return col(label, key, "select", options=options, **kw)


def colcheck(label, key=None, **kw):
    return col(label, key, "checkbox", **kw)


def colformula(label, expression, key=None, **kw):
    return col(label, key, "formula", formula=expression, **kw)


def table(key, name, columns, min_rows=1, max_rows=200, totals=False, description=None):
    t = {"table_key": key, "table_name": name, "is_repeatable": True, "min_rows": min_rows, "max_rows": max_rows,
         "show_row_numbers": True, "show_totals": totals, "show_in_pdf": True, "columns": columns}
    if description:
        t["description"] = description
    return t


def sec(title, *fields, tables=None, cols=2, page_break=False, description=None):
    s = {"title": title, "section_code": slug(title, "s")[:40].upper(), "layout_columns": cols, "is_collapsible": False, "is_collapsed": False,
         "show_in_pdf": True, "page_break_before": page_break, "fields": list(fields), "tables": tables or []}
    if description:
        s["description"] = description
    return s


def table_sec(title, *tables, page_break=False, description=None):
    return sec(title, tables=list(tables), cols=1, page_break=page_break, description=description)


def checklist(title, items, answer="status", options=None, remarks=True, page_break=False, description=None):
    """One select per requirement (label = the requirement text) and a single remarks box for the section."""
    options = options or AVAILABLE
    fields = [_field(item if len(item) < 250 else item[:247] + "...", "select", key=unique(f"{slug(title, 'c')[:18]}_{i:03d}"), w=12, options=options)
              for i, item in enumerate(items, start=1)]
    if remarks:
        fields.append(_field("Remarks / observations", "textarea", key=unique(f"{slug(title, 'c')[:18]}_remarks"), w=12))
    return sec(title, *fields, cols=1, page_break=page_break, description=description)


def header(reference=None, extra=None):
    """The block every audit form opens with."""
    fields = [
        text("Facility / unit name", req=True), date("Audit date", req=True),
        area("Facility address", w=12), text("Facility representative"),
        text("Audit / document reference", placeholder=reference or ""), text("Audited by (auditor / firm)"),
    ]
    fields.extend(extra or [])
    return sec("Audit details", *fields)


def signoff(extra_note=None):
    fields = [
        area("Overall conclusion and recommendations", w=12),
        _field("I confirm this audit was carried out on site and the entries above are true to the records seen", "checkbox", key="declaration", w=12, req=True),
    ]
    if extra_note:
        fields.insert(0, note(extra_note))
    return sec("Auditor sign-off", *fields, cols=1)


def form(name, description, prefix, sections, form_type="AUDIT", signature=False):
    return {"name": name, "description": description, "form_type": form_type, "layout_columns": 2, "requires_signature": signature,
            "requires_attachments": False, "allow_draft": True, "auto_number_prefix": prefix, "sections": sections}
