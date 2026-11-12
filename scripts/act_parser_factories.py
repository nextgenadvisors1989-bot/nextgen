"""Turns the PDF of the Factories Act, 1948 (the client's sample, Downloads/Factory Act 1948.pdf, 60 pages) into the JSON the Act builder imports:

    Act details, then Chapter -> Section -> Sub Section nodes (and the three Schedules), each with its text as HTML and its amendment notes.

    python scripts/act_parser_factories.py "Factory Act 1948.pdf" out.json

How it reads the PDF (pypdf, layout mode, so words are not split and the indentation of every line is known):
  * pages 1-5 are the Arrangement of Sections: they give the chapters, the numbers and headings of the sections and the schedules (the skeleton);
  * the body is searched section by section in that order, so a sub clause numbered "1." inside a schedule can never be taken for a section;
  * a page ends with its footnotes ("1. Subs. by Act 94 of 1976, s. 2 ...") that restart at 1 on every page: they become the amendment notes of the section
    that carries the mark (1[ ... ] or 3***), renumbered 1, 2, 3 inside that section, and the mark is written as a superscript;
  * a section whose text starts with (1) and goes on with (2) ... is split into sub sections; clauses (a), (b), (i), (ii) stay in the text, indented.
A report of what was found and what was not is printed, and kept in the JSON ("qa"), so the result is checked before it is imported.
"""
import html
import json
import re
import sys
from pathlib import Path

from pypdf import PdfReader

MARK = re.compile(r"(?<![\w.,)(\-–/%])(\d{1,2})(?=\[|\*\*\*)")
LEAD_MARKS = re.compile(r"^(?:\s*\x01\d+\x02\[?\s*)+")
FOOTNOTE_START = re.compile(r"^\s{0,3}1\.\s+(?:Ins\.|Subs\.|Omitted|Added|Rep\.|Repealed|The |Clause|Sub-|Section|Re-?numbered|Substituted|Proviso|Explanation|For |Words|Paragraph|These|Item|Entry|Heading|Figures|Brackets|Inserted|See |Now |Vide |Ins\b|Subs\b)")
PARA_START = re.compile(r"^\s*(?:\x01\d+\x02\[\s*)*(?:\(([0-9]{1,3}[A-Z]{0,2}|[a-zA-Z]{1,4})\)\]?(?:\s|$)|(Provided|Explanation|Illustration|Note)\b)")
ROMAN = re.compile(r"^[ivx]+$")
NL = chr(10)


def read_pages(path):
    return [(p.extract_text(extraction_mode="layout") or "") for p in PdfReader(path).pages]


def squeeze(s):
    return re.sub(r"\s{2,}", " ", s.strip())


def norm(s):
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


# ──────────────────────────── arrangement of sections ────────────────────────────

def parse_arrangement(pages):
    lines = []
    for t in pages:
        for raw in t.split("\n"):
            s = squeeze(raw)
            if not s or re.fullmatch(r"\d+", s) or re.fullmatch(r"_+", s) or s in ("SECTIONS", "ARRANGEMENT OF SECTIONS") or s.startswith("THE FACTORIES ACT"):
                continue
            lines.append(s)
    chapters, schedules, cur, i = [], [], None, 0
    while i < len(lines):
        s = lines[i]
        m = re.match(r"^CHAPTER\s+([IVXL]+A?)$", s)
        if m:
            title = lines[i + 1]
            i += 2
            while i < len(lines) and lines[i].isupper() and not re.match(r"^\d", lines[i]) and not lines[i].startswith(("CHAPTER", "THE ")):
                title += " " + lines[i]
                i += 1
            cur = {"number": m.group(1), "title": title, "sections": []}
            chapters.append(cur)
            continue
        m = re.match(r"^THE (FIRST|SECOND|THIRD) SCHEDULE\.?$", s)
        if m:
            schedules.append(f"THE {m.group(1)} SCHEDULE")
            i += 1
            continue
        m = re.match(r"^(\d+[A-Z]{0,2})\.\s+(.*)$", s)
        if m and cur is not None:
            cur["sections"].append({"number": m.group(1), "title": m.group(2)})
        elif cur and cur["sections"]:
            cur["sections"][-1]["title"] += " " + s
        i += 1
    return chapters, schedules


# ──────────────────────────────── body pages ────────────────────────────────

def split_page(raw):
    lines = raw.split("\n")
    while lines and not lines[-1].strip():
        lines.pop()
    if lines and re.fullmatch(r"\s*\d+\s*", lines[-1]):
        lines.pop()
    while lines and not lines[-1].strip():
        lines.pop()
    idx = None
    for i in range(len(lines) - 1, -1, -1):
        if FOOTNOTE_START.match(lines[i]):
            idx = i
            break
    notes = {}
    if idx is not None:
        cur, expect = None, 1
        for l in lines[idx:]:
            s = squeeze(l)
            if not s:
                continue
            star = re.match(r"^\*\.?\s+(.*)$", s)
            m = re.match(r"^(\d+)\.\s+(.*)$", s)
            if star:
                notes["*"] = star.group(1)
                cur = "*"
            elif m and int(m.group(1)) == expect:
                notes[expect] = m.group(2)
                cur = expect
                expect += 1
            elif cur:
                notes[cur] += " " + s
        lines = lines[:idx]
        while lines and not lines[-1].strip():
            lines.pop()
    return lines, notes


def tidy(text):
    """Spacing artefacts of the PDF: ' ,' ' .' 'sub -section' '( 1 )' and doubled spaces."""
    text = re.sub(r"\s{2,}", " ", text)
    text = re.sub(r"\s+([,.;:)\]])", r"\1", text)
    text = re.sub(r"([(\[])\s+", r"\1", text)
    text = re.sub(r"(\w) -(\w)", r"\1-\2", text)
    text = re.sub(r"(\w)- (\w)", lambda m: m.group(0) if m.group(1).isdigit() else m.group(0), text)
    return text.strip()


def to_html_text(text):
    out = html.escape(text, quote=False)
    return re.sub(r"\x01(\d+)\x02", r"<sup>\1</sup>", out)


class Section:
    def __init__(self, number, title, chapter):
        self.number, self.title, self.chapter = number, title, chapter
        self.lines = []   # (page, indent, text)


def clause_level(marker, indent, last_alpha):
    """Indent level (0-2) of a paragraph that starts with (marker)."""
    if marker is None:
        return 0
    if re.fullmatch(r"\d+[A-Z]{0,2}", marker):
        return 0
    if marker.lower() == "i" and last_alpha == "h" or marker.lower() == "v" and last_alpha == "u" or marker.lower() == "x" and last_alpha == "w":
        return 1
    if ROMAN.match(marker):
        return 2 if last_alpha else 1
    if marker.isupper():
        return 3
    return 1


def build_paragraphs(lines):
    """lines: [(indent, text-with-marks)] -> [{'text', 'marker', 'level'}]; a new paragraph starts at (a), (1), Provided, Explanation ..."""
    paras, last_alpha = [], None
    for indent, text in lines:
        if not text.strip():
            continue
        m = PARA_START.match(text)
        if m or not paras:
            marker = m.group(1) if m else None
            if marker and re.fullmatch(r"\d+[A-Z]{0,2}", marker):
                last_alpha = None   # a new sub section starts: its clauses begin again at the first level
            level = clause_level(marker, indent, last_alpha)
            # a single lowercase letter is a lettered clause, unless it is really a roman numeral (i, v, x) that is not the next letter after h, u, w
            as_letter = bool(marker and re.fullmatch(r"[a-z]", marker)) and (not ROMAN.match(marker) or (marker, last_alpha) in (("i", "h"), ("v", "u"), ("x", "w")))
            if as_letter:
                last_alpha = marker
            if m and m.group(2) in ("Provided",):
                level = 1
            paras.append({"text": text.strip(), "marker": marker, "level": level})
        else:
            paras[-1]["text"] += " " + text.strip()
    return paras


def sub_split(paras, max_lead=0):
    """Index list of the paragraphs that start sub sections (1), (2), (2A) ... in sequence; [] when the section is not divided that way."""
    starts, last_n, last_s = [], 0, ""
    for i, p in enumerate(paras):
        mk = p["marker"]
        if not mk:
            continue
        m = re.fullmatch(r"(\d+)([A-Z]{0,2})", mk)
        if not m:
            continue
        n, s = int(m.group(1)), m.group(2)
        if (n == 1 and not starts and s == "") or (starts and ((n == last_n and s > last_s) or n == last_n + 1)):
            starts.append(i)
            last_n, last_s = n, s
    # max_lead: how many paragraphs of lead-in text may come before (1) (the Rules often start with a line such as "Rule prescribed under section 42")
    return starts if len(starts) >= 2 and starts[0] <= max_lead else []


def para_html(p):
    tag_attr = f' data-indent="{min(p["level"], 6)}"' if p["level"] else ""
    return f"<p{tag_attr}>{to_html_text(tidy(p['text']))}</p>"


def parse(path):
    pages = read_pages(path)
    body_start = next(i for i, t in enumerate(pages) if re.search(r"ACT\s+NO\.\s*63", t, flags=re.I))
    chapters, schedule_names = parse_arrangement(pages[:body_start])
    expected = [(c, s) for c in chapters for s in c["sections"]]

    stream, raw_stream, notes_by_page = [], [], {}
    for pno in range(body_start, len(pages)):
        lines, notes = split_page(pages[pno])
        notes_by_page[pno + 1] = notes
        for raw in lines:
            if raw.strip():
                stream.append((pno + 1, len(raw) - len(raw.lstrip(" ")), squeeze(raw)))
                raw_stream.append(raw.strip())

    # preamble: date of the Act and the long title
    head = " ".join(t for _, _, t in stream[:40])
    enacted = re.search(r"\[(\d{1,2})(?:st|nd|rd|th) (\w+), (\d{4})\.\]", head)
    months = {m: i for i, m in enumerate(["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"], 1)}
    enact_date = f"{enacted.group(3)}-{months[enacted.group(2)]:02d}-{int(enacted.group(1)):02d}" if enacted and enacted.group(2) in months else None
    long_title = re.search(r"An Act to [^.]+\.", head)
    whereas = re.search(r"WHEREAS[^;]+;", head)
    summary = " ".join(x.group(0) for x in (long_title, whereas) if x)

    # where every section starts, in the order of the arrangement
    starts, cursor, missing = [], 0, []
    for chapter, sec in expected:
        found = None
        words = norm(sec["title"]).split()[:3]
        for j in range(cursor, len(stream)):
            text = re.sub(r"^(?:\s*(?:\d+\[|\*)\s*)+", "", stream[j][2])
            if re.match(rf"^{re.escape(sec['number'])}\.\s+", text):
                nxt = stream[j + 1][2] if j + 1 < len(stream) else ""
                joined = norm(re.sub(rf"^{re.escape(sec['number'])}\.", "", text) + " " + nxt)
                # a repealed or omitted section is listed as "[Repealed.]" in the arrangement but keeps its old heading in the body
                if re.search(r"repealed|omitted", sec["title"], flags=re.I) or " ".join(words) in joined or joined.startswith(" ".join(words[:2])):
                    found = j
                    break
        if found is None:
            missing.append(f"{sec['number']}. {sec['title']}")
            continue
        starts.append((found, chapter, sec))
        cursor = found + 1

    # where the schedules start (after the last section)
    sched_starts = []
    for j in range(cursor, len(stream)):
        m = re.match(r"^(?:\d+\[|\*)?\s*THE (FIRST|SECOND|THIRD) SCHEDULE", stream[j][2])
        if m:
            sched_starts.append((j, f"THE {m.group(1)} SCHEDULE"))
    body_end = sched_starts[0][0] if sched_starts else len(stream)

    chapter_titles = {c["title"].upper() for c in chapters}
    sections = []
    for k, (j, chapter, sec) in enumerate(starts):
        end = starts[k + 1][0] if k + 1 < len(starts) else body_end
        s = Section(sec["number"], sec["title"], chapter)
        chunk = list(stream[j:end])
        while chunk and (re.fullmatch(r"CHAPTER [IVXL]+A?", chunk[-1][2]) or chunk[-1][2].upper() in chapter_titles or re.fullmatch(r"_+", chunk[-1][2])):
            chunk.pop()
        s.lines = chunk
        sections.append(s)

    qa = {"sections_expected": len(expected), "sections_found": len(starts), "sections_missing": missing, "marks_without_note": 0, "notes_total": 0, "subsections": 0,
          "sections_without_text": [], "sections_split": 0}

    def convert(lines):
        """[(page, indent, text)] -> ([(indent, text with marks)], {ref: note}); footnote marks become \x01ref\x02 renumbered 1.. in order of appearance."""
        refs, notes, out = {}, {}, []
        for page, indent, text in lines:
            if text.startswith("*") and notes_by_page.get(page, {}).get("*"):
                key = (page, "*")
                if key not in refs:
                    refs[key] = len(refs) + 1
                    notes[refs[key]] = notes_by_page[page]["*"]
                text = f"\x01{refs[key]}\x02" + text[1:]

            def repl(m):
                n = int(m.group(1))
                note = notes_by_page.get(page, {}).get(n)
                if note is None:
                    qa["marks_without_note"] += 1
                    return ""
                key = (page, n)
                if key not in refs:
                    refs[key] = len(refs) + 1
                    notes[refs[key]] = note
                return f"\x01{refs[key]}\x02"
            out.append((indent, MARK.sub(repl, text)))
        qa["notes_total"] += len(notes)
        return out, notes

    def amendments_for(text, notes):
        used = sorted({int(x) for x in re.findall(r"\x01(\d+)\x02", text)})
        return [{"reference": str(r), "description": notes[r]} for r in used if r in notes]

    def node_of(kind, number, title, paras, notes, status="active"):
        raw = " ".join(p["text"] for p in paras)
        return {"kind": kind, "number": number, "title": title, "status": status, "body_html": "".join(para_html(p) for p in paras) or None, "amendments": amendments_for(raw, notes), "children": []}

    out_chapters = []
    by_chapter = {}
    for s in sections:
        converted, notes = convert(s.lines)
        joined = "\n".join(t for _, t in converted)
        m = re.match(rf"^\s*(?:\x01\d+\x02\[?\s*|\*\s*)*{re.escape(s.number)}\.\s+(.*?)\s*\.?\s*—\s*", joined[:900], flags=re.S)
        repealed = None
        if not m:
            repealed = re.match(rf"^\s*(?:\x01\d+\x02\[?\s*|\*\s*)*{re.escape(s.number)}\.\s+\[(.*?)\]\s*(.*)$", joined, flags=re.S)
        heading_marks = re.findall(r"\x01(\d+)\x02", joined[: (m.end() if m else 60)])
        if m:
            consumed = joined[: m.end()].count(NL)
            first_rest = joined[m.end():].split(NL)[0]
            rest_lines = ([(converted[consumed][0], first_rest)] if first_rest.strip() else []) + list(converted[consumed + 1:])
        elif repealed:
            # "100. [Determination of occupier in certain cases.] Rep. by the Factories (Amendment) Act, 1987": the old heading, then the note of repeal
            s.title = tidy(repealed.group(1)).rstrip(".") + "."
            rest_lines = [(converted[0][0], re.sub(r"^Rep\. by", "Repealed by", repealed.group(2)))]
        else:
            rest_lines = list(converted[1:])   # no dash after the heading: the first line is the heading and nothing else
        paras = build_paragraphs(rest_lines)
        plain = " ".join(p["text"] for p in paras)
        status = "active"
        if re.fullmatch(r"\W*(\x01\d+\x02)?\W*(Omitted|\*\*\*)\W*", plain, flags=re.I) or plain.strip() in ("***", ""):
            status = "omitted" if not paras or re.search(r"Omitted|\*\*\*", plain) else "active"
        if repealed or re.fullmatch(r"\W*Repealed\W*", plain, flags=re.I):
            status = "repealed"
        starts_idx = sub_split(paras)
        title = s.title if s.title else ""
        node = node_of("Section", s.number, title, paras if not starts_idx else paras[: starts_idx[0]], notes, status)
        node["amendments"] = amendments_for(" ".join(f"\x01{x}\x02" for x in heading_marks) + " " + " ".join(p["text"] for p in (paras if not starts_idx else paras[: starts_idx[0]])), notes)
        if starts_idx:
            qa["sections_split"] += 1
            bounds = starts_idx + [len(paras)]
            for a, b in zip(bounds, bounds[1:]):
                group = [dict(p) for p in paras[a:b]]
                first = group[0]
                number = f"({first['marker']})"
                first["text"] = re.sub(r"^((?:\x01\d+\x02\[\s*)*)\([0-9A-Za-z]+\)\s*", r"\1", first["text"])
                first["level"] = 0
                plain_sub = re.sub(r"\x01\d+\x02", "", " ".join(g["text"] for g in group))
                excerpt = re.sub(r"^[\[\s]+", "", tidy(plain_sub))[:110].rstrip()
                sub = node_of("Sub Section", number, excerpt or number, group, notes)
                node["children"].append(sub)
                qa["subsections"] += 1
        if not node["body_html"] and not node["children"] and status == "active":
            qa["sections_without_text"].append(f"{s.number}. {s.title}")
        by_chapter.setdefault(s.chapter["number"], []).append(node)

    for c in chapters:
        out_chapters.append({"kind": "Chapter", "number": c["number"], "title": c["title"], "status": "active", "body_html": None, "amendments": [], "children": by_chapter.get(c["number"], [])})

    # schedules
    schedules = []
    for n, (j, name) in enumerate(sched_starts):
        end = sched_starts[n + 1][0] if n + 1 < len(sched_starts) else len(stream)
        converted, notes = convert([(page, ind, raw_stream[j + off]) for off, (page, ind, _) in enumerate(stream[j:end])])
        rows = [(ind, t) for ind, t in converted]
        heading_marks = re.findall(r"\x01(\d+)\x02", rows[0][1]) if rows else []
        title = name
        body_lines = rows[1:]
        for idx in range(min(4, len(body_lines))):
            t = body_lines[idx][1].strip()
            if t.isupper() and len(t) > 8:
                title = tidy(re.sub(r"\x01\d+\x02", "", t))
                del body_lines[idx]   # the title is shown above the text; it is not repeated in it
                break
        paras = build_schedule(body_lines)
        schedules.append({"kind": "Schedule", "number": name, "title": title, "status": "active", "body_html": paras or None,
                          "amendments": amendments_for(" ".join(f"\x01{x}\x02" for x in heading_marks) + " " + paras, notes), "children": []})
    qa["schedules_found"] = [s["number"] for s in schedules]
    qa["schedules_expected"] = schedule_names
    return {
        "act": {"act_name": "The Factories Act, 1948", "short_name": "Factories Act", "subtitle": "Arrangement of Sections", "act_number": "63", "act_year": 1948,
                "jurisdiction": "Central", "enactment_date": enact_date, "effective_date": "1949-04-01", "summary": summary or None},
        "nodes": out_chapters + schedules,
        "qa": qa,
    }


def build_schedule(rows):
    """The lines of a schedule as HTML: a block of lines with columns becomes a table, anything else a paragraph per entry."""
    blocks, table, para = [], [], []

    def flush_para():
        if para:
            blocks.append(f"<p>{to_html_text(tidy(' '.join(para)))}</p>")
            para.clear()

    def flush_table():
        if len(table) == 1:
            blocks.append(f"<p>{to_html_text(' '.join(table[0]))}</p>")
            table.clear()
        if table:
            width = max(len(r) for r in table)
            body = "".join("<tr>" + "".join(f"<td>{to_html_text(c)}</td>" for c in r + [""] * (width - len(r))) + "</tr>" for r in table)
            blocks.append(f"<table><tbody>{body}</tbody></table>")
            table.clear()

    for indent, text in rows:
        t = re.sub(r"(?:\s*\.){3,}", " ", text)
        cells = [c.strip() for c in re.split(r"\s{3,}", t) if c.strip()]
        if len(cells) >= 3 or (table and len(cells) >= 2):
            flush_para()
            table.append([tidy(c) for c in cells])
            continue
        flush_table()
        if re.match(r"^(?:\d+\.|\(\w{1,4}\)|—|\[)", t.strip()) or not para:
            flush_para()
        para.append(t.strip())
    flush_para()
    flush_table()
    return "".join(blocks)


if __name__ == "__main__":
    src, dest = sys.argv[1], sys.argv[2]
    result = parse(src)
    Path(dest).write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    qa = result["qa"]
    print(f"sections found {qa['sections_found']} of {qa['sections_expected']}; missing: {qa['sections_missing']}")
    print(f"sub sections {qa['subsections']} (in {qa['sections_split']} sections); amendment notes {qa['notes_total']}; marks without a note {qa['marks_without_note']}")
    print(f"sections without any text: {qa['sections_without_text']}")
    print(f"schedules: found {qa['schedules_found']} expected {qa['schedules_expected']}")
    print("chapters:", [(c['number'], c['title'], len(c['children'])) for c in result['nodes'] if c['kind'] == 'Chapter'])
