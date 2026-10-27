/**
 * Client-side export helpers. Every CSV is generated from the rows actually on
 * screen, so what the user exports always matches what they reviewed.
 */
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][]
): void {
  const escape = (value: string | number | null | undefined) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const csv = [
    headers.map(escape).join(','),
    ...rows.map((row) => row.map(escape).join(',')),
  ].join('\r\n');

  // The BOM keeps Excel from mangling Tamil (UTF-8) text.
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
}

/** Triggers a browser download for a Blob or a URL. */
export function triggerDownload(file: Blob | string, filename: string): void {
  const url = typeof file === 'string' ? file : URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  if (typeof file !== 'string') setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Downloads a file from an authenticated API route (keeps CSRF/cookies). */
export async function downloadFromApi(url: string, filename: string): Promise<{ ok: boolean; message?: string }> {
  const response = await fetch(url, { credentials: 'same-origin' });
  if (!response.ok) {
    return { ok: false, message: `Download failed (${response.status})` };
  }
  const blob = await response.blob();
  triggerDownload(blob, filename);
  return { ok: true };
}

/** Opens a print-friendly window for the given HTML (used by report previews). */
export function printHtml(html: string, title = 'Document'): void {
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  if (!doc) return;
  doc.open();
  doc.write(`<!doctype html><html><head><title>${title}</title>
    <style>
      body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color:#1e293b; padding:24px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #e2e8f0; padding: 6px 8px; font-size: 12px; }
      th { background: #f8fafc; }
    </style></head><body>${html}</body></html>`);
  doc.close();
  frame.contentWindow?.focus();
  frame.contentWindow?.print();
  setTimeout(() => frame.remove(), 1000);
}
