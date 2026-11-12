"""Reads the lines of a PDF whose text layer is one word at a time (a Word document printed to PDF): every word is collected with its position, and the words that share a
baseline are joined into a line, left to right. Used by the Act parsers (scripts/act_parser_*.py) for the Tamil Nadu Factories Rules, where pypdf's own text extraction
returns one word per line (plain mode) or nothing (layout mode).

    from pdf_lines import document_lines
    for page_number, lines in document_lines(path):
        for line in lines: line.x, line.y, line.size, line.text, line.words

Footnote marks are small raised digits ("1", "2") that this PDF carries without any footnote text; they are dropped (drop_marks) so they do not end up inside the words.
"""
from dataclasses import dataclass, field
from pypdf import PdfReader


@dataclass
class Line:
    x: float        # left edge of the first word
    y: float        # baseline (PDF units, up is larger)
    size: float     # largest font size on the line, as the PDF reports it
    text: str       # the words, single-spaced
    words: list = field(default_factory=list)   # [(x, text, size)] left to right


def page_lines(page, y_tolerance: float = 2.5, drop_marks: bool = True, mark_size: float = 170.0):
    """Lines of one page from top to bottom."""
    words = []

    def visitor(text, cm, tm, font_dict, font_size):
        if text and text.strip():
            words.append((tm[5], tm[4], font_size or 0.0, text.strip()))

    page.extract_text(visitor_text=visitor)
    if drop_marks:
        words = [w for w in words if not (w[2] <= mark_size and w[3].isdigit() and len(w[3]) <= 2)]
    rows, current, current_y = [], [], None
    for y, x, size, text in sorted(words, key=lambda w: (-w[0], w[1])):
        if current_y is None or abs(y - current_y) <= y_tolerance:
            current.append((x, size, text))
            current_y = y if current_y is None else (current_y + y) / 2
        else:
            rows.append((current_y, current))
            current, current_y = [(x, size, text)], y
    if current:
        rows.append((current_y, current))
    out = []
    for y, row in rows:
        row.sort(key=lambda w: w[0])
        out.append(Line(x=row[0][0], y=y, size=max(w[1] for w in row), text=" ".join(w[2] for w in row), words=[(w[0], w[2], w[1]) for w in row]))
    return out


def document_lines(path: str):
    """[(page number, [Line])] for every page."""
    reader = PdfReader(path)
    return [(i + 1, page_lines(p)) for i, p in enumerate(reader.pages)]
