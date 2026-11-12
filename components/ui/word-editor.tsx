'use client';

/**
 * A Word-style editor (Tiptap, MIT) for the text of an Act: paragraph styles and headings, bold / italic / underline / strike, superscript (footnote marks) and
 * subscript, alignment, bullet and numbered lists, indent levels for the (1) (a) (i) layout of an Act, quotes, tables, links, undo and redo. Pasting from Word keeps
 * the structure. The HTML it produces is sanitised again on the server (lib/utils/sanitize-html.ts) before it is stored, and uses the same `.act-prose` rules as the
 * readers, so what is typed here is what the public and the auditors read. Indent and alignment are data attributes, never inline styles.
 *
 * Load it with next/dynamic (ssr: false) so the pages that do not edit an Act do not carry the editor.
 */
import { useCallback } from 'react';
import clsx from 'clsx';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Extension } from '@tiptap/core';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';

const BLOCKS = ['paragraph', 'heading', 'blockquote'];
const MAX_INDENT = 6;

/** Adds the indent level (0-6) and the alignment to paragraphs, headings and quotes, stored as data-indent / data-align. */
const ActLayout = Extension.create({
  name: 'actLayout',
  addGlobalAttributes() {
    return [{
      types: BLOCKS,
      attributes: {
        indent: {
          default: 0,
          parseHTML: (element: HTMLElement) => Math.min(MAX_INDENT, Number(element.getAttribute('data-indent')) || 0),
          renderHTML: (attributes: Record<string, unknown>) => (attributes.indent ? { 'data-indent': String(attributes.indent) } : {}),
        },
        align: {
          default: null,
          parseHTML: (element: HTMLElement) => element.getAttribute('data-align') || element.style.textAlign || null,
          renderHTML: (attributes: Record<string, unknown>) => (attributes.align ? { 'data-align': String(attributes.align) } : {}),
        },
      },
    }];
  },
  addKeyboardShortcuts() {
    return { 'Mod-]': () => indent(this.editor, 1), 'Mod-[': () => indent(this.editor, -1) };
  },
});

function changeBlocks(editor: Editor, patch: (attributes: Record<string, unknown>) => Record<string, unknown>) {
  return editor.chain().focus().command(({ tr, state }) => {
    state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
      if (BLOCKS.includes(node.type.name)) tr.setNodeMarkup(pos, undefined, patch({ ...node.attrs }));
    });
    return true;
  }).run();
}

function indent(editor: Editor, step: number): boolean {
  if (editor.isActive('listItem')) return step > 0 ? editor.chain().focus().sinkListItem('listItem').run() : editor.chain().focus().liftListItem('listItem').run();
  return changeBlocks(editor, (a) => ({ ...a, indent: Math.max(0, Math.min(MAX_INDENT, Number(a.indent ?? 0) + step)) }));
}

function Tool({ label, onClick, active, disabled, children, className }: { label: string; onClick: () => void; active?: boolean; disabled?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={active === undefined ? undefined : active} disabled={disabled}
      onMouseDown={(event) => event.preventDefault()} onClick={onClick}
      className={clsx('focus-ring inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm text-ink-soft transition-colors hover:bg-surface-muted disabled:opacity-40',
        active && 'bg-brand-50 text-brand-700', className)}>
      {children}
    </button>
  );
}

const Divider = () => <span aria-hidden className="mx-1 h-5 w-px bg-line" />;

function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'), italic: e.isActive('italic'), underline: e.isActive('underline'), strike: e.isActive('strike'), sup: e.isActive('superscript'), sub: e.isActive('subscript'),
      bullet: e.isActive('bulletList'), ordered: e.isActive('orderedList'), quote: e.isActive('blockquote'), link: e.isActive('link'), table: e.isActive('table'),
      left: e.isActive({ align: 'left' }), center: e.isActive({ align: 'center' }), right: e.isActive({ align: 'right' }), justify: e.isActive({ align: 'justify' }),
      style: e.isActive('heading', { level: 1 }) ? '1' : e.isActive('heading', { level: 2 }) ? '2' : e.isActive('heading', { level: 3 }) ? '3' : e.isActive('heading', { level: 4 }) ? '4' : '0',
      canUndo: e.can().undo(), canRedo: e.can().redo(),
    }),
  });
  const setStyle = (value: string) => {
    const chain = editor.chain().focus();
    if (value === '0') chain.setParagraph().run();
    else chain.toggleHeading({ level: Number(value) as 1 | 2 | 3 | 4 }).run();
  };
  const align = (value: string) => changeBlocks(editor, (a) => ({ ...a, align: a.align === value ? null : value }));
  const link = () => {
    const previous = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link address (https://...); leave empty to remove the link', previous ?? 'https://');
    if (url === null) return;
    if (url.trim() === '' || url.trim() === 'https://') editor.chain().focus().extendMarkRange('link').unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };
  return (
    <div role="toolbar" aria-label="Text formatting" className="flex flex-wrap items-center gap-0.5 border-b border-line bg-surface-muted px-2 py-1.5">
      <Tool label="Undo (Ctrl+Z)" onClick={() => editor.chain().focus().undo().run()} disabled={!s.canUndo}>↶</Tool>
      <Tool label="Redo (Ctrl+Y)" onClick={() => editor.chain().focus().redo().run()} disabled={!s.canRedo}>↷</Tool>
      <Divider />
      <select aria-label="Paragraph style" value={s.style} onChange={(event) => setStyle(event.target.value)}
        className="focus-ring h-8 rounded-md border border-line bg-white px-2 text-sm text-ink-soft">
        <option value="0">Normal text</option>
        <option value="1">Heading 1</option><option value="2">Heading 2</option><option value="3">Heading 3</option><option value="4">Heading 4</option>
      </select>
      <Divider />
      <Tool label="Bold (Ctrl+B)" active={s.bold} onClick={() => editor.chain().focus().toggleBold().run()} className="font-bold">B</Tool>
      <Tool label="Italic (Ctrl+I)" active={s.italic} onClick={() => editor.chain().focus().toggleItalic().run()} className="italic">I</Tool>
      <Tool label="Underline (Ctrl+U)" active={s.underline} onClick={() => editor.chain().focus().toggleUnderline().run()} className="underline">U</Tool>
      <Tool label="Strikethrough" active={s.strike} onClick={() => editor.chain().focus().toggleStrike().run()} className="line-through">S</Tool>
      <Tool label="Superscript (footnote mark)" active={s.sup} onClick={() => editor.chain().focus().toggleSuperscript().run()}>x²</Tool>
      <Tool label="Subscript" active={s.sub} onClick={() => editor.chain().focus().toggleSubscript().run()}>x₂</Tool>
      <Divider />
      <Tool label="Align left" active={s.left} onClick={() => align('left')}>⇤</Tool>
      <Tool label="Centre" active={s.center} onClick={() => align('center')}>↔</Tool>
      <Tool label="Align right" active={s.right} onClick={() => align('right')}>⇥</Tool>
      <Tool label="Justify" active={s.justify} onClick={() => align('justify')}>≡</Tool>
      <Divider />
      <Tool label="Bulleted list" active={s.bullet} onClick={() => editor.chain().focus().toggleBulletList().run()}>• List</Tool>
      <Tool label="Numbered list" active={s.ordered} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. List</Tool>
      <Tool label="Decrease indent (Ctrl+[)" onClick={() => indent(editor, -1)}>◂ Indent</Tool>
      <Tool label="Increase indent (Ctrl+])" onClick={() => indent(editor, 1)}>Indent ▸</Tool>
      <Tool label="Quote" active={s.quote} onClick={() => editor.chain().focus().toggleBlockquote().run()}>❝</Tool>
      <Divider />
      <Tool label="Insert a table (3 x 3)" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>Table</Tool>
      <Tool label="Link" active={s.link} onClick={link}>Link</Tool>
      <Tool label="Horizontal line" onClick={() => editor.chain().focus().setHorizontalRule().run()}>―</Tool>
      <Tool label="Clear formatting" onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}>Tx</Tool>
      {s.table && (
        <>
          <Divider />
          <Tool label="Add a row below" onClick={() => editor.chain().focus().addRowAfter().run()}>+ Row</Tool>
          <Tool label="Add a column to the right" onClick={() => editor.chain().focus().addColumnAfter().run()}>+ Col</Tool>
          <Tool label="Delete the row" onClick={() => editor.chain().focus().deleteRow().run()}>− Row</Tool>
          <Tool label="Delete the column" onClick={() => editor.chain().focus().deleteColumn().run()}>− Col</Tool>
          <Tool label="Merge the selected cells" onClick={() => editor.chain().focus().mergeCells().run()}>Merge</Tool>
          <Tool label="Split the cell" onClick={() => editor.chain().focus().splitCell().run()}>Split</Tool>
          <Tool label="Delete the table" onClick={() => editor.chain().focus().deleteTable().run()} className="text-red-600">Delete table</Tool>
        </>
      )}
    </div>
  );
}

export default function WordEditor({ value, onChange, label, helper, minHeight = 260, disabled }: {
  value: string; onChange: (html: string) => void; label?: string; helper?: string; minHeight?: number; disabled?: boolean;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    content: value || '',
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] }, link: { openOnClick: false, autolink: false, HTMLAttributes: { rel: 'noopener noreferrer' } } }),
      Superscript, Subscript, ActLayout,
      Table.configure({ resizable: false }), TableRow, TableHeader, TableCell,
    ],
    editorProps: { attributes: { class: 'act-prose px-4 py-3 focus:outline-none', role: 'textbox', 'aria-multiline': 'true', 'aria-label': label ?? 'Text', style: `min-height:${minHeight}px` } },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? '' : e.getHTML()),
  });
  const focus = useCallback(() => editor?.chain().focus().run(), [editor]);

  return (
    <div>
      {label && <span className="label" onClick={focus}>{label}</span>}
      <div className={clsx('overflow-hidden rounded-lg border border-line bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/30', disabled && 'opacity-70')}>
        {editor && !disabled && <Toolbar editor={editor} />}
        {editor ? <EditorContent editor={editor} /> : <div className="px-4 py-3 text-sm text-ink-muted" style={{ minHeight }}>Loading the editor…</div>}
      </div>
      {helper && <p className="mt-1 text-xs text-ink-muted">{helper}</p>}
    </div>
  );
}
