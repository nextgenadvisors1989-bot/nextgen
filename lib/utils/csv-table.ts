/** CSV writer for the export buttons (quotes, commas and line breaks inside cells are escaped). */

export function toCsv(rows: string[][]): string {
  const cell = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  return rows.map((row) => row.map(cell).join(',')).join('\r\n');
}
