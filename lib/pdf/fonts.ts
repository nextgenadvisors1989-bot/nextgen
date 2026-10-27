/**
 * Font registry for every PDF the platform produces.
 *
 * Noto Sans (Latin) and Noto Sans Tamil ship with the repository so a document
 * renders identically on any host — the bilingual payslip and any Tamil label
 * must never fall back to a font the server happens to have installed.
 */
import path from 'node:path';
import type PDFKit from 'pdfkit';

export const FONT_DIR = path.join(process.cwd(), 'lib/pdf/fonts');

export const FONT_FILES = {
  Regular: 'NotoSans-Regular.ttf',
  Bold: 'NotoSans-Bold.ttf',
  Tamil: 'NotoSansTamil-Regular.ttf',
  TamilBold: 'NotoSansTamil-Bold.ttf',
} as const;

export type FontName = keyof typeof FONT_FILES;

/** Registers the four faces on a document; safe to call once per document. */
export function registerFonts(doc: PDFKit.PDFDocument): void {
  for (const [name, file] of Object.entries(FONT_FILES)) {
    doc.registerFont(name, path.join(FONT_DIR, file));
  }
}

export interface FontOptions {
  bold?: boolean;
  tamil?: boolean;
}

/** Font name for a run of text, honouring the script it is written in. */
export function fontFor({ bold = false, tamil = false }: FontOptions = {}): FontName {
  if (tamil) return bold ? 'TamilBold' : 'Tamil';
  return bold ? 'Bold' : 'Regular';
}
