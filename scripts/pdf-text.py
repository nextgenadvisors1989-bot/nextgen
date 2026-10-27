#!/usr/bin/env python3
"""Extract the text a generated PDF actually renders.

The platform embeds Noto Sans subsets, so every string in a content stream is a
run of glyph ids (`[<0001> 20 <0002>] TJ`) rather than ASCII. This reads the
per-font /ToUnicode CMaps written by PDFKit and maps those glyph ids back to
characters, which lets the verification scripts assert on what a human would
read on the page — headers, footers, page numbers, Tamil text and all.

    python3 scripts/pdf-text.py file.pdf            # text of every page
    python3 scripts/pdf-text.py file.pdf --json     # [{"page": 1, "text": "..."}]

Exits non-zero when the file is not a readable PDF.
"""
import json
import re
import sys
import zlib


# ------------------------------------------------------------------ objects

def objects(data: bytes) -> dict[int, bytes]:
    """`<n> 0 obj … endobj` bodies keyed by object number."""
    found: dict[int, bytes] = {}
    for match in re.finditer(rb'(\d+)\s+0\s+obj\b', data):
        start = match.end()
        end = data.find(b'endobj', start)
        if end == -1:
            continue
        found[int(match.group(1))] = data[start:end]
    return found


def stream_of(body: bytes) -> bytes | None:
    marker = re.search(rb'stream\r?\n', body)
    if not marker:
        return None
    raw = body[marker.end():]
    end = raw.rfind(b'endstream')
    if end != -1:
        raw = raw[:end]
    if b'/FlateDecode' in body[:marker.start()]:
        try:
            return zlib.decompress(raw)
        except zlib.error:
            return None
    return raw


def ref(body: bytes, key: bytes) -> int | None:
    match = re.search(key + rb'\s+(\d+)\s+0\s+R', body)
    return int(match.group(1)) if match else None


def object_stream(objs: dict[int, bytes], number: int | None) -> bytes | None:
    if number is None or number not in objs:
        return None
    return stream_of(objs[number])


# ---------------------------------------------------------------- toUnicode

def utf16be(hex_text: bytes) -> str:
    """`<0066 0069>` (a ligature) decodes to two code points, so spaces are fine."""
    try:
        return bytes.fromhex(hex_text.decode('ascii').replace(' ', '')).decode('utf-16-be', 'replace')
    except Exception:
        return ''


def to_unicode_map(cmap: bytes) -> dict[int, str]:
    """Glyph id -> character for one embedded font subset."""
    table: dict[int, str] = {}

    for block in re.findall(rb'beginbfchar(.*?)endbfchar', cmap, re.S):
        for src, dst in re.findall(rb'<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>', block):
            table[int(src, 16)] = utf16be(dst)

    for block in re.findall(rb'beginbfrange(.*?)endbfrange', cmap, re.S):
        # <low> <high> [ <dst1> <dst2> … ]  — one destination per code
        for low, high, array in re.findall(
            rb'<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([^\]]*)\]', block, re.S
        ):
            start = int(low, 16)
            # Entries may hold several code points (`<0066 0069>` = the "fi" ligature).
            for offset, dst in enumerate(re.findall(rb'<([0-9A-Fa-f ]+)>', array)):
                table[start + offset] = utf16be(dst)
        # <low> <high> <dst>  — destinations run consecutively from <dst>
        stripped = re.sub(rb'<[0-9A-Fa-f]+>\s*<[0-9A-Fa-f]+>\s*\[[^\]]*\]', b' ', block)
        for low, high, dst in re.findall(rb'<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>', stripped):
            start, stop = int(low, 16), min(int(high, 16), int(low, 16) + 4095)
            base = int(dst, 16)
            for code in range(start, stop + 1):
                table[code] = chr(0x10000 + (base - 0x10000) + (code - start)) if base >= 0xD800 else chr(base + code - start)
    return table


# ------------------------------------------------------------------- pages

def pages(data: bytes) -> list[bytes]:
    """Pages in the order the page tree declares them."""
    objs = objects(data)
    root = next((n for n, body in objs.items() if re.search(rb'/Type\s*/Pages\b', body)), None)

    ordered: list[bytes] = []
    if root is not None:
        for number in re.findall(rb'(\d+)\s+0\s+R', objs[root]):
            body = objs.get(int(number))
            if body is not None and re.search(rb'/Type\s*/Page\b', body):
                ordered.append(body)
    if ordered:
        return ordered

    return [body for _, body in sorted(objs.items()) if re.search(rb'/Type\s*/Page(?!s)', body)]


def font_maps(objs: dict[int, bytes], page: bytes) -> dict[str, dict[int, str]]:
    """Resource name (/F3) -> glyph table, for the fonts a page draws with."""
    maps: dict[str, dict[int, str]] = {}

    resources = page
    indirect = ref(page, rb'/Resources')
    if indirect is not None and indirect in objs:
        resources = objs[indirect]

    resource = re.search(rb'/Font\s*<<(.*?)>>', resources, re.S)
    if not resource:
        return maps

    for name, number in re.findall(rb'/(\w+)\s+(\d+)\s+0\s+R', resource.group(1)):
        font = objs.get(int(number))
        if not font:
            continue
        cmap = object_stream(objs, ref(font, rb'/ToUnicode'))
        maps[name.decode('ascii')] = to_unicode_map(cmap) if cmap else {}
    return maps


def content_of(objs: dict[int, bytes], page: bytes) -> bytes:
    return object_stream(objs, ref(page, rb'/Contents')) or b''


def page_text(content: bytes, maps: dict[str, dict[int, str]]) -> str:
    """Walk the BT/ET blocks, tracking the active font for each glyph run."""
    out: list[str] = []
    fallback: dict[int, str] = next(iter(maps.values()), {})

    for block in re.findall(rb'BT(.*?)ET', content, re.S):
        current = fallback
        for token in re.finditer(
            rb'/(\w+)\s+[\d.]+\s+Tf|\[(.*?)\]\s*TJ|<([0-9A-Fa-f]*)>\s*Tj', block, re.S
        ):
            if token.group(1):                     # /F2 8.5 Tf
                current = maps.get(token.group(1).decode('ascii'), fallback)
                continue

            run = token.group(2) if token.group(2) is not None else (b'<' + (token.group(3) or b'') + b'>')
            for hex_run in re.findall(rb'<([0-9A-Fa-f]*)>', run):
                if not hex_run or len(hex_run) % 4:
                    continue
                for index in range(0, len(hex_run), 4):
                    code = int(hex_run[index:index + 4], 16)
                    out.append(current.get(code, fallback.get(code, '')))
    return ''.join(out).strip()


def extract(data: bytes) -> list[dict]:
    objs = objects(data)
    result = []
    for index, page in enumerate(pages(data), start=1):
        result.append({'page': index, 'text': page_text(content_of(objs, page), font_maps(objs, page))})
    return result


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2

    data = open(sys.argv[1], 'rb').read()
    if not data.startswith(b'%PDF-'):
        print('not a PDF', file=sys.stderr)
        return 1

    extracted = extract(data)
    if '--json' in sys.argv:
        print(json.dumps(extracted, ensure_ascii=False))
        return 0

    for page in extracted:
        print(f'------ page {page["page"]} ------')
        print(page['text'])
    return 0


if __name__ == '__main__':
    sys.exit(main())
