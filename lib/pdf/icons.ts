/**
 * Small stroked icons for PDFs, drawn as vector paths (24 x 24 design grid), so a document can carry icons without any image file.
 * An unknown name draws a plain dot.
 */
import type { Doc } from '@/lib/pdf/base';

const PATHS: Record<string, string[]> = {
  clipboard: ['M9 4h6v3H9V4Z', 'M7 5H5v16h14V5h-2', 'M9 12l2 2 4-4'],
  users: ['M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1', 'M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z', 'M21 20v-1a4 4 0 0 0-3-3.9', 'M16 4.2a3.5 3.5 0 0 1 0 6.6'],
  shield: ['M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z', 'M9 12l2 2 4-4'],
  leaf: ['M11 20A7 7 0 0 1 4 13c0-6 6-9 16-9 0 10-3 16-9 16Z', 'M4 21c3-6 7-9 12-11'],
  heart: ['M19 14c1.5-1.5 2-3 2-4.5A4.5 4.5 0 0 0 16.5 5 4.5 4.5 0 0 0 12 7.5 4.5 4.5 0 0 0 7.5 5 4.5 4.5 0 0 0 3 9.5C3 11 3.5 12.5 5 14l7 7 7-7Z'],
  book: ['M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2V5Z', 'M8 7h8', 'M8 11h8'],
  globe: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M3 12h18', 'M12 3c3 3 3 15 0 18', 'M12 3c-3 3-3 15 0 18'],
  hardhat: ['M3 18h18', 'M5 18v-3a7 7 0 0 1 14 0v3', 'M10 8V5h4v3'],
  building: ['M4 21V4h10v17', 'M14 9h6v12', 'M4 21h16', 'M8 8h2', 'M8 12h2', 'M8 16h2'],
  phone: ['M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z'],
  mail: ['M3 5h18v14H3V5Z', 'M3 6l9 7 9-7'],
  pin: ['M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11Z', 'M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z'],
  check: ['M5 12l5 5 9-10'],
  file: ['M6 3h8l4 4v14H6V3Z', 'M14 3v4h4', 'M9 13h6', 'M9 17h6'],
  calendar: ['M4 6h16v15H4V6Z', 'M4 10h16', 'M8 3v4', 'M16 3v4'],
  target: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M12 12h.01'],
  chart: ['M4 20V10', 'M10 20V4', 'M16 20v-8', 'M22 20H2'],
  flame: ['M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9Z'],
  rupee: ['M7 5h10', 'M7 9h10', 'M7 5c5 0 7 2 7 4s-2 4-7 4l7 7'],
  star: ['M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.2 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3Z'],
  award: ['M12 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z', 'M8.5 13 7 22l5-3 5 3-1.5-9'],
  factory: ['M3 21V10l6 4v-4l6 4v-4l6 4v7H3Z', 'M17 10V3h3v7'],
  scale: ['M12 3v18', 'M5 21h14', 'M7 6h10'],
};

/** Draws an icon centred on (cx, cy) in a box `size` points square. */
export function drawIcon(doc: Doc, name: string, cx: number, cy: number, size: number, color: string, weight = 1.7): void {
  const paths = PATHS[name];
  doc.save();
  doc.translate(cx - size / 2, cy - size / 2).scale(size / 24);
  doc.lineWidth(weight).lineJoin('round').lineCap('round').strokeColor(color);
  if (!paths) doc.circle(12, 12, 2).fill(color);
  else for (const d of paths) doc.path(d).stroke();
  doc.restore();
}

/** A filled circle with a white icon in it. */
export function badge(doc: Doc, name: string, cx: number, cy: number, radius: number, fill: string, iconColor = '#FFFFFF'): void {
  doc.save().fillColor(fill).circle(cx, cy, radius).fill().restore();
  drawIcon(doc, name, cx, cy, radius * 1.15, iconColor, 1.9);
}
