/**
 * Letterhead material shared by the audit-style PDFs (CAPAR, groundwater NOC): the company logo and letterhead banner saved
 * in Company Settings, with the platform logo as the last fallback, and the header block that draws them.
 */
import { query, type RowDataPacket } from '@/lib/db/mysql';
import { findFile, readFileBytes } from '@/lib/files/file-service';
import { COLORS, CONTENT_WIDTH, MARGIN, setFont, type Doc } from '@/lib/pdf/base';

/** Loads an image from the vault, or null when it is missing or not a format pdfkit can embed (PNG, JPEG). */
export async function loadImage(fileId: number | null | undefined): Promise<Buffer | null> {
  if (!fileId) return null;
  try {
    const file = await findFile(fileId);
    if (!file || !/^image\/(png|jpe?g)$/i.test(String(file.mime_type ?? ''))) return null;
    return await readFileBytes(file);
  } catch {
    return null;
  }
}

export function fileIdFromUrl(url: string | null | undefined): number | null {
  const id = Number(/\/files\/(\d+)\//.exec(String(url ?? ''))?.[1] ?? 0);
  return id || null;
}

export interface CompanyBranding {
  name: string;
  address: string;
  logo: Buffer | null;
  letterhead: Buffer | null;
}

export async function companyBranding(logoFileId: number | null = null): Promise<CompanyBranding> {
  const rows = await query<RowDataPacket>(
    "SELECT setting_key, setting_value FROM settings WHERE setting_group = 'company' AND setting_key IN ('company_name','company_address','logo_path','letterhead_path')"
  );
  const setting = Object.fromEntries(rows.map((row) => [String(row.setting_key), String(row.setting_value ?? '').trim()]));
  let logo = await loadImage(logoFileId);
  if (!logo) logo = await loadImage(fileIdFromUrl(setting.logo_path));
  if (!logo) {
    try {
      const { readFile } = await import('node:fs/promises');
      logo = await readFile(`${process.cwd()}/public/brand/logo.png`);
    } catch {
      logo = null;
    }
  }
  const letterhead = await loadImage(fileIdFromUrl(setting.letterhead_path));
  return { name: setting.company_name || '', address: setting.company_address || '', logo, letterhead };
}

/** The top of the first page: the letterhead banner, or the logo beside the firm name and address, then a rule. */
export function drawLetterhead(doc: Doc, options: { firm: string; address?: string; logo: Buffer | null; letterhead: Buffer | null }): void {
  doc.y = MARGIN;
  let drawn = false;
  if (options.letterhead) {
    try {
      doc.image(options.letterhead, MARGIN, doc.y, { fit: [CONTENT_WIDTH, 80], align: 'center' });
      doc.y += 84;
      drawn = true;
    } catch { /* fall back to the logo layout */ }
  }
  if (!drawn) {
    const top = doc.y;
    let textX = MARGIN;
    if (options.logo) {
      try {
        doc.image(options.logo, MARGIN, top, { fit: [110, 52] });
        textX = MARGIN + 122;
      } catch { /* no logo */ }
    }
    setFont(doc, 13, { bold: true });
    doc.fillColor(COLORS.brand).text(options.firm.toUpperCase(), textX, top + 4, { width: CONTENT_WIDTH - (textX - MARGIN) });
    if (options.address) {
      setFont(doc, 8.5);
      doc.fillColor(COLORS.muted).text(options.address, textX, doc.y + 1, { width: CONTENT_WIDTH - (textX - MARGIN) });
    }
    doc.y = Math.max(doc.y, top + 56) + 4;
  }
  doc.save().strokeColor(COLORS.brand).lineWidth(1.4).moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_WIDTH, doc.y).stroke().restore();
  doc.y += 10;
}
