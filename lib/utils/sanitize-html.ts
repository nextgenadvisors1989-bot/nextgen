/**
 * Allow-list sanitiser for the Word-style editor of the Act builder (and anything else that stores editor HTML to be shown to the public).
 *
 * Unlike the older regex sanitiser in formatting.ts (which only removes known-bad pieces), this one rebuilds the markup: every tag that is not in the
 * list is dropped (its text stays), every attribute that is not in the list for its tag is dropped, links keep only http(s), mailto, tel, in-page and
 * site-relative targets, and scripts, styles, comments and processing instructions disappear with their content. No DOM is needed, so it runs on the server.
 */

const TAGS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'sub', 'sup', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'hr',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col', 'a', 'code', 'pre',
]);
const VOID = new Set(['br', 'hr', 'col']);
const DROP_WITH_CONTENT = /<(script|style|iframe|object|embed|noscript|template|svg|math)\b[\s\S]*?(?:<\/\1\s*>|$)/gi;
const ALIGN = new Set(['left', 'center', 'right', 'justify']);

const ATTRS: Record<string, string[]> = {
  a: ['href', 'title'],
  th: ['colspan', 'rowspan', 'data-align'],
  td: ['colspan', 'rowspan', 'data-align'],
  col: ['span'],
  ol: ['start', 'type'],
  p: ['data-indent', 'data-align'],
  li: ['data-indent', 'data-align'],
  h1: ['data-indent', 'data-align'], h2: ['data-indent', 'data-align'], h3: ['data-indent', 'data-align'], h4: ['data-indent', 'data-align'],
  blockquote: ['data-indent'],
};

const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
const ATTR = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function decode(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) => String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff)))
    .replace(/&#(\d+);?/g, (_, dec: string) => String.fromCodePoint(Math.min(parseInt(dec, 10), 0x10ffff)))
    .replace(/&colon;/gi, ':').replace(/&tab;/gi, '\t').replace(/&newline;/gi, '\n').replace(/&amp;/g, '&');
}

function safeHref(raw: string): string | null {
  const value = decode(raw).replace(/[\u0000- \u007f-\u009f]+/g, '');
  if (!value) return null;
  return /^(https?:|mailto:|tel:|#|\/(?!\/))/i.test(value) ? raw.trim().replace(/"/g, '&quot;') : null;
}

function cleanAttrs(tag: string, source: string): string {
  const allowed = ATTRS[tag];
  if (!allowed) return '';
  let out = '';
  const seen = new Set<string>();
  for (const match of source.matchAll(ATTR)) {
    const name = match[1].toLowerCase();
    if (!allowed.includes(name) || seen.has(name)) continue;
    const raw = match[2] ?? match[3] ?? match[4] ?? '';
    let value: string | null = null;
    if (name === 'href') value = safeHref(raw);
    else if (name === 'title') value = raw.replace(/[<>"]/g, '').slice(0, 200);
    else if (name === 'colspan' || name === 'rowspan' || name === 'span' || name === 'start') value = /^\d{1,3}$/.test(raw.trim()) ? raw.trim() : null;
    else if (name === 'type') value = /^[1aAiI]$/.test(raw.trim()) ? raw.trim() : null;
    else if (name === 'data-indent') value = /^[0-6]$/.test(raw.trim()) ? raw.trim() : null;
    else if (name === 'data-align') value = ALIGN.has(raw.trim().toLowerCase()) ? raw.trim().toLowerCase() : null;
    if (value === null || value === '') continue;
    seen.add(name);
    out += ` ${name}="${value}"`;
  }
  if (tag === 'a' && seen.has('href')) out += ' rel="noopener noreferrer"';
  return out;
}

export function sanitizeActHtml(input: unknown): string {
  if (input === null || input === undefined) return '';
  let html = String(input)
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
    .replace(/<[!?][^>]*>/g, '')
    .replace(DROP_WITH_CONTENT, '');
  // Rebuild from the pieces: allowed tags are re-written, text between them has any stray "<" (not a complete tag) turned into plain text.
  const text = (value: string) => value.replace(/</g, '&lt;');
  let out = '';
  let last = 0;
  for (const match of html.matchAll(TAG)) {
    const at = match.index ?? 0;
    out += text(html.slice(last, at));
    last = at + match[0].length;
    const tag = match[2].toLowerCase();
    if (!TAGS.has(tag)) continue;
    if (match[1]) out += VOID.has(tag) ? '' : `</${tag}>`;
    else out += `<${tag}${cleanAttrs(tag, match[3])}>`;
  }
  out += text(html.slice(last));
  return out.trim();
}

/** The plain text of editor HTML: block ends become line breaks so a search hit reads naturally. */
export function htmlToPlain(html: unknown, maxLength = 0): string {
  const text = String(html ?? '')
    .replace(/<\/(p|h[1-4]|li|tr|blockquote|pre|table)>/gi, '\n')
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    .replace(/<\/(td|th)>/gi, ' | ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return maxLength > 0 ? text.slice(0, maxLength) : text;
}
