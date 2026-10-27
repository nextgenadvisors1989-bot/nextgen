/** Minimal RFC 4180 CSV reader: quoted fields, escaped quotes, CRLF, BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const source = text.replace(/^﻿/, '');

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
    } else field += char;
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  return rows;
}

/** Rows keyed by the (lower-cased, trimmed) header row; values are trimmed strings. */
export function csvRecords(text: string): Record<string, string>[] {
  const [header, ...body] = parseCsv(text);
  if (!header) return [];
  const keys = header.map((cell) => cell.trim().toLowerCase().replace(/\s+/g, '_'));
  return body.map((cells) => Object.fromEntries(keys.map((key, index) => [key, (cells[index] ?? '').trim()])));
}
