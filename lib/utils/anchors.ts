/**
 * In-page anchors for headings, so a menu entry can open the exact part of a page it names ("/about#safety-wing") and no two entries open the same place.
 * The menu (components/public/site-header.tsx) and the page renderers use the same function, so the ids always match the headings.
 */
export function anchorId(text: string): string {
  return text
    .toLowerCase()
    .replace(/&amp;|&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Adds an id to every h1-h4 of a sanitised page body that has none (the same heading twice gets -2, -3 ...). */
export function withHeadingIds(html: string): string {
  const seen = new Map<string, number>();
  return html.replace(/<(h[1-4])((?:\s[^>]*)?)>([\s\S]*?)<\/\1>/gi, (whole, tag: string, attrs: string, inner: string) => {
    if (/\sid=/.test(attrs)) return whole;
    const base = anchorId(inner.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' '));
    if (!base) return whole;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return `<${tag}${attrs} id="${count === 1 ? base : `${base}-${count}`}">${inner}</${tag}>`;
  });
}
