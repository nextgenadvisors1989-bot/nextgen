"""Turns the PDF of the Tamil Nadu Factories Rules, 1950 (the client's sample, 402 pages) into the JSON the Act builder imports (scripts/import-act.py):

    python scripts/act_parser_tn_rules.py "<the pdf>" out.json

The PDF is a Word document printed to PDF, whose text layer is one word at a time, so the lines are rebuilt from the position of every word (scripts/pdf_lines.py).
  * the contents (pages 2-25) list the chapters and the rules in order; they are the skeleton the body is matched against, so a numbered item inside a schedule
    ("1. Definitions" of the Third Schedule) can never be taken for rule 1;
  * a chapter is a centred "CHAPTER X" line with its title below it; a rule is a line at the left margin that starts with the next rule number ("2-A. [Competent person]");
  * a schedule or an appendix is a centred "SCHEDULE X" / "APPENDIX 'A'" line with its own title; it is kept as a top-level Schedule with its text and tables;
  * the text of a rule is split into sub rules (1), (2) ... when it starts with (1); clauses (a), (b), (i) stay in the text, indented;
  * the raised footnote marks of the PDF have no footnote text in it, so they are dropped; the square brackets that show amended words are kept.
A report of what was found and what was not is printed and kept in the JSON ("qa").
"""
import html
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pdf_lines import document_lines  # noqa: E402
from act_parser_factories import ROMAN, clause_level, para_html, sub_split, tidy  # noqa: E402

LEFT = 70.9
RULE_LEAD = re.compile(r"^\[?\s*(\d+)\s*([-–]?)\s*([A-Z]{0,3})\b\.?\s*(.*)$")
MISSING_TITLES = {"V": "WELFARE"}   # chapter V of the Rules has no title line in the PDF (it is the Welfare chapter of the Act)
ROMANS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV"]
PARA_START = re.compile(r"^\s*(?:\(([0-9]{1,3}[A-Z]{0,2}|[a-zA-Z]{1,4})\)(?:\s|$)|(Provided|Explanation|Illustration|Note)\b)")


def rule_key(number, suffix):
    return (int(number), suffix)


def rule_label(n, hyphen, suffix):
    return f"{int(n)}{'-' if hyphen and suffix else ''}{suffix}"


def norm_words(text):
    return re.sub(r"[^a-z0-9 ]+", " ", text.lower()).split()


def clean_title(text):
    text = tidy(text)
    text = re.sub(r"^\[\s*", "", text)
    text = re.sub(r"\s*\]$", "", text)
    return text.strip()


def parse(path):
    docs = document_lines(path)
    body_start = next(i for i, (_, lines) in enumerate(docs) if i > 1 and any("In exercise of the powers conferred" in l.text for l in lines))

    # ───────────── the contents: chapters and main rules in order ─────────────
    toc_rules, last = [], (0, "")
    for _, lines in docs[1:body_start]:
        for l in lines:
            if abs(l.x - LEFT) > 2:
                continue
            text = re.sub(r"\s*\.{4,}\s*\d*\s*$", "", l.text).strip()
            m = RULE_LEAD.match(text)
            if not m or not (text[:1].isdigit() or text.startswith("[")):
                continue
            n, hyphen, suffix, title = int(m.group(1)), m.group(2), m.group(3), m.group(4)
            key = (n, suffix)
            if key > last and n - last[0] <= 3 and (suffix == "" or len(suffix) <= 2):
                toc_rules.append({"number": rule_label(n, hyphen, suffix), "key": key, "title": clean_title(title.lstrip(". "))})
                last = key
    expected = toc_rules

    # ───────────── the body: lines from the page of the preamble ─────────────
    body = [(p, l) for p, lines in docs[body_start:] for l in lines]
    preamble = " ".join(l.text for _, l in body[:12])
    date = re.search(r"(\d{1,2})(?:st|nd|rd|th) (March|April|May|June|July|August|September|October|November|December|January|February),? (\d{4})", preamble)
    months = {m: i for i, m in enumerate(["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"], 1)}
    enacted = f"{date.group(3)}-{months[date.group(2)]:02d}-{int(date.group(1)):02d}" if date else None
    summary = " ".join(l.text for _, l in body if "In exercise of the powers" in l.text or False)
    prose = []
    for _, l in body[:14]:
        if l.text.startswith(("In exercise", "1948)", "having been")) or prose:
            prose.append(l.text)
        if "said Act." in l.text:
            break
    summary = " ".join(prose)

    events = []   # (index in body, kind, payload)
    k, missing = 0, []
    chapter_no = 0
    for j, (page, l) in enumerate(body):
        text = l.text.strip()
        if l.x > 200 and re.fullmatch(r"CHAPTER\s+[IVXLC0-9]+", text):
            title_lines, t = [], j + 1
            # the title is centred under the number (in capitals, or "Leave with wages"); chapter V has none in the PDF
            while t < len(body) and body[t][1].x > 200 and len(title_lines) < 3 and not re.match(r"^\[?\d", body[t][1].text.strip()) and len(body[t][1].text.strip()) < 70:
                title_lines.append(body[t][1].text.strip())
                t += 1
            number = ROMANS[chapter_no]
            title = tidy(" ".join(title_lines)).upper() or MISSING_TITLES.get(number, text)
            events.append((j, "chapter", {"number": number, "title": title, "skip": 1 + len(title_lines)}))
            chapter_no += 1
            continue
        if l.x >= 150 and re.match(r"^\[?\s*(SCHEDULE|APPENDIX)\b", text) and len(text) < 60:
            title_lines, t = [], j + 1
            while t < len(body) and body[t][1].x >= 150 and len(title_lines) < 3 and body[t][1].text.strip() and not re.search(r"\d{2,}", body[t][1].text) \
                    and (body[t][1].text.strip().isupper() or body[t][1].text.strip().startswith("[")):
                title_lines.append(body[t][1].text.strip())
                t += 1
            name = re.sub(r"^\[\s*", "", text)
            events.append((j, "schedule", {"number": tidy(name), "title": clean_title(" ".join(title_lines)) or tidy(name), "skip": 1 + len(title_lines)}))
            continue
        if 36 <= l.x <= 80 and l.size >= 230 and (text[:1].isdigit() or text.startswith("[")) and k < len(expected):
            m = RULE_LEAD.match(text)
            if not m:
                continue
            key = (int(m.group(1)), m.group(3))
            ahead = next((idx for idx in range(k, min(k + 4, len(expected))) if expected[idx]["key"] == key), None)
            if ahead is None:
                continue
            # a heading is "7B Adjustment ..." or "7- AA. Revocation ..." (the dot and the margin vary); the heading words must agree with the contents
            want = norm_words(expected[ahead]["title"])[:2]
            if want and not all(w in norm_words(m.group(4)) for w in want[:1]) and "." not in text[:8]:
                continue
            missing.extend(f"{e['number']}. {e['title']}" for e in expected[k:ahead])
            title = clean_title(m.group(4)) or expected[ahead]["title"]
            events.append((j, "rule", {"number": expected[ahead]["number"], "title": title, "skip": 1}))
            k = ahead + 1
    missing.extend(f"{e['number']}. {e['title']}" for e in expected[k:])

    # ───────────── the text between one start and the next ─────────────
    qa = {"rules_expected": len(expected), "rules_found": sum(1 for e in events if e[1] == "rule"), "rules_missing": missing, "chapters": chapter_no,
          "schedules": sum(1 for e in events if e[1] == "schedule"), "subsections": 0, "rules_without_text": [], "rules_split": 0}

    def lines_of(index):
        start = events[index][0] + events[index][2]["skip"]
        end = events[index + 1][0] if index + 1 < len(events) else len(body)
        return [l for _, l in body[start:end]]

    def paragraphs(lines):
        paras = []
        for l in lines:
            text = l.text.strip()
            if not text:
                continue
            m = PARA_START.match(text)
            starts = bool(m) or not paras
            if not starts and l.x <= paras[-1]["x"] + 1 and re.search(r"[.;:—]$", paras[-1]["last"]):
                starts = True
            if starts:
                paras.append({"text": text, "x": l.x, "last": text, "marker": m.group(1) if m else None, "level": 0})
            else:
                paras[-1]["text"] += " " + text
                paras[-1]["last"] = text
        last_alpha = None
        for p in paras:
            mk = p["marker"]
            if mk and re.fullmatch(r"\d+[A-Z]{0,2}", mk):
                last_alpha = None
            p["level"] = clause_level(mk, 0, last_alpha) if mk else 0
            if p["text"].startswith("Provided"):
                p["level"] = 1 if last_alpha else 0
            as_letter = bool(mk and re.fullmatch(r"[a-z]", mk)) and (not ROMAN.match(mk) or (mk, last_alpha) in (("i", "h"), ("v", "u"), ("x", "w")))
            if as_letter:
                last_alpha = mk
        return paras

    def node_of(kind, number, title, paras, status="active"):
        return {"kind": kind, "number": number, "title": title, "status": status, "body_html": "".join(para_html(p) for p in paras) or None, "amendments": [], "children": []}

    def schedule_html(lines):
        blocks, table, para = [], [], []

        def flush_para():
            if para:
                blocks.append(f"<p>{html.escape(tidy(' '.join(para)), quote=False)}</p>")
                para.clear()

        def flush_table():
            if len(table) == 1:
                blocks.append(f"<p>{html.escape(' '.join(table[0]), quote=False)}</p>")
                table.clear()
            if table:
                width = max(len(r) for r in table)
                body_rows = "".join("<tr>" + "".join(f"<td>{html.escape(c, quote=False)}</td>" for c in r + [""] * (width - len(r))) + "</tr>" for r in table)
                blocks.append(f"<table><tbody>{body_rows}</tbody></table>")
                table.clear()

        for l in lines:
            cells, current, prev_end = [], [], None
            for x, text, size in l.words:
                if prev_end is not None and x - prev_end > 18 and current:
                    cells.append(" ".join(current))
                    current = []
                current.append(text)
                prev_end = x + len(text) * 6.0 * (size / 240.0)
            if current:
                cells.append(" ".join(current))
            if len(cells) >= 3 or (table and len(cells) >= 2):
                flush_para()
                table.append([tidy(c) for c in cells])
                continue
            flush_table()
            text = l.text.strip()
            if abs(l.x - LEFT) <= 2 and re.match(r"^\d+\.\s+\S", text) and len(text) <= 90 and not text.endswith((".", ";", ",")):
                flush_para()
                blocks.append(f"<h3>{html.escape(tidy(text), quote=False)}</h3>")
                continue
            m = PARA_START.match(text)
            if m or not para or (l.x <= LEFT + 1 and para and re.search(r"[.;:]$", para[-1])):
                flush_para()
            para.append(text)
        flush_para()
        flush_table()
        return "".join(blocks)

    chapters, current = [], None
    pending_schedules = []
    for idx, (j, kind, data) in enumerate(events):
        lines = lines_of(idx)
        if kind == "chapter":
            if current is not None:
                chapters.append(current)
                chapters.extend(pending_schedules)
                pending_schedules = []
            current = {"kind": "Chapter", "number": data["number"], "title": data["title"], "status": "active", "body_html": None, "amendments": [], "children": []}
            continue
        if kind == "schedule":
            if data["number"].upper() in ("SCHEDULE", "APPENDIX") and current is not None and current["children"]:
                data["number"] = f"{data['number'].upper()} to rule {current['children'][-1]['number']}"
            pending_schedules.append({"kind": "Schedule", "number": data["number"], "title": data["title"], "status": "active", "body_html": schedule_html(lines) or None, "amendments": [], "children": []})
            continue
        if current is None:
            continue
        paras = paragraphs(lines)
        plain = " ".join(p["text"] for p in paras)
        status = "omitted" if re.fullmatch(r"\W*(Omitted|\*(\s*\*)*)?\W*", plain) and (not paras or re.search(r"Omitted|\*", plain)) else "active"
        if len(data["title"]) < 2:   # a rule with no heading in the contents or the text: omitted when it has no words, else named by its number
            data["title"] = "Omitted" if not plain.strip() else f"Rule {data['number']}"
            status = "omitted" if not plain.strip() else status
        if re.search(r"^\[?\s*Omitted", data["title"], flags=re.I):
            status = "omitted"
        starts = sub_split(paras, max_lead=1)
        node = node_of("Section", data["number"], data["title"], paras if not starts else paras[: starts[0]], status)
        if starts:
            qa["rules_split"] += 1
            bounds = starts + [len(paras)]
            for a, b in zip(bounds, bounds[1:]):
                group = [dict(p) for p in paras[a:b]]
                group[0]["text"] = re.sub(r"^\([0-9A-Za-z]+\)\s*", "", group[0]["text"])
                group[0]["level"] = 0
                excerpt = re.sub(r"^[\[\s]+", "", tidy(" ".join(g["text"] for g in group)))[:110].rstrip()
                number = f"({paras[a]['marker']})"
                node["children"].append(node_of("Sub Section", number, excerpt or number, group))
                qa["subsections"] += 1
        if not node["body_html"] and not node["children"] and status == "active":
            qa["rules_without_text"].append(f"{data['number']}. {data['title']}")
        current["children"].append(node)
    if current is not None:
        chapters.append(current)
        chapters.extend(pending_schedules)

    return {
        "act": {"act_name": "The Tamil Nadu Factories Rules, 1950", "short_name": "Tamil Nadu Factories Rules", "subtitle": "Arrangement of Rules", "act_number": "G.O. No. 1041", "act_year": 1950,
                "jurisdiction": "State", "state_name": "Tamil Nadu", "enactment_date": enacted, "effective_date": None, "summary": summary or None},
        "nodes": chapters,
        "qa": qa,
    }


if __name__ == "__main__":
    src, dest = sys.argv[1], sys.argv[2]
    result = parse(src)
    Path(dest).write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    qa = result["qa"]
    print(f"chapters {qa['chapters']}; rules found {qa['rules_found']} of {qa['rules_expected']}; schedules/appendices {qa['schedules']}")
    print(f"missing: {qa['rules_missing'][:12]}{' ...' if len(qa['rules_missing']) > 12 else ''} ({len(qa['rules_missing'])})")
    print(f"sub rules {qa['subsections']} (in {qa['rules_split']} rules); rules without text: {qa['rules_without_text'][:10]} ({len(qa['rules_without_text'])})")
    print("chapters:", [(c['number'], c['title'][:28], len(c['children'])) for c in result['nodes'] if c['kind'] == 'Chapter'])
