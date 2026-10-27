/**
 * Presentation helpers for documents. Deliberately free of `fs`, `path` and the
 * database so client components can import them without dragging Node built-ins
 * into the browser bundle.
 */

export function formatFileSize(bytes: number | null | undefined): string {
  const value = Number(bytes ?? 0);
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const scaled = value / 1024 ** exponent;
  return `${scaled >= 10 || exponent === 0 ? Math.round(scaled) : scaled.toFixed(1)} ${units[exponent]}`;
}

/** Icon hint for the document lists. */
export function fileKind(mimeType: string | null | undefined): 'pdf' | 'image' | 'sheet' | 'doc' | 'archive' | 'other' {
  const mime = String(mimeType ?? '').toLowerCase();
  if (mime.includes('pdf')) return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  if (mime.includes('sheet') || mime.includes('excel') || mime.includes('csv')) return 'sheet';
  if (mime.includes('word') || mime.includes('document')) return 'doc';
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('compressed')) return 'archive';
  return 'other';
}
