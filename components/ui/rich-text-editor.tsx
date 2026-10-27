'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

/**
 * Dependency-light rich text editor built on contentEditable + execCommand.
 * Output is sanitised HTML on the server before storage, so only a safe subset
 * of tags survives persistence.
 */
export function RichTextEditor({ value, onChange, placeholder = 'Start typing…', minHeight = 180, label, error, helper, disabled, toolbar = true }: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  label?: string;
  error?: string;
  helper?: string;
  disabled?: boolean;
  toolbar?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value || '';
    }
  }, [value]);

  const exec = useCallback((command: string, argument?: string) => {
    document.execCommand(command, false, argument);
    ref.current?.focus();
    onChange(ref.current?.innerHTML ?? '');
  }, [onChange]);

  const insertTable = useCallback(() => {
    const rows = Number(window.prompt('Number of rows?', '3')) || 3;
    const cols = Number(window.prompt('Number of columns?', '3')) || 3;
    let html = '<table><tbody>';
    for (let r = 0; r < rows; r += 1) {
      html += '<tr>';
      for (let c = 0; c < cols; c += 1) {
        html += r === 0 ? '<th>Header</th>' : '<td>&nbsp;</td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table><p></p>';
    exec('insertHTML', html);
  }, [exec]);

  const insertLink = useCallback(() => {
    const url = window.prompt('Link URL', 'https://');
    if (url) exec('createLink', url);
  }, [exec]);

  const TOOLS: { label: string; title: string; action: () => void; className?: string }[] = [
    { label: 'B', title: 'Bold', action: () => exec('bold'), className: 'font-bold' },
    { label: 'I', title: 'Italic', action: () => exec('italic'), className: 'italic' },
    { label: 'U', title: 'Underline', action: () => exec('underline'), className: 'underline' },
    { label: 'H1', title: 'Heading 1', action: () => exec('formatBlock', '<h1>') },
    { label: 'H2', title: 'Heading 2', action: () => exec('formatBlock', '<h2>') },
    { label: 'P', title: 'Paragraph', action: () => exec('formatBlock', '<p>') },
    { label: '•', title: 'Bullet list', action: () => exec('insertUnorderedList') },
    { label: '1.', title: 'Numbered list', action: () => exec('insertOrderedList') },
    { label: '❝', title: 'Quote', action: () => exec('formatBlock', '<blockquote>') },
    { label: '⛓', title: 'Insert link', action: insertLink },
    { label: '▦', title: 'Insert table', action: insertTable },
    { label: '⌫', title: 'Clear formatting', action: () => exec('removeFormat') },
  ];

  return (
    <div className="w-full">
      {label && <label className="label">{label}</label>}
      <div className={clsx('overflow-hidden rounded-lg border bg-white', error ? 'border-red-400' : focused ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-line')}>
        {toolbar && (
          <div className="flex flex-wrap items-center gap-0.5 border-b border-line bg-surface-muted px-2 py-1.5">
            {TOOLS.map((tool) => (
              <button
                key={tool.title}
                type="button"
                title={tool.title}
                disabled={disabled}
                onMouseDown={(event) => event.preventDefault()}
                onClick={tool.action}
                className={clsx(
                  'h-7 min-w-7 rounded px-1.5 text-[13px] text-ink-soft transition-colors hover:bg-white hover:text-ink disabled:opacity-50',
                  tool.className
                )}
              >
                {tool.label}
              </button>
            ))}
          </div>
        )}
        <div
          ref={ref}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            onChange(ref.current?.innerHTML ?? '');
          }}
          onInput={() => onChange(ref.current?.innerHTML ?? '')}
          onPaste={(event) => {
            // Paste as plain text to keep stored HTML clean and safe.
            event.preventDefault();
            const text = event.clipboardData.getData('text/plain');
            document.execCommand('insertText', false, text);
          }}
          data-placeholder={placeholder}
          style={{ minHeight }}
          className="prose-editor max-w-none px-4 py-3 text-sm text-ink focus:outline-none empty:before:text-slate-400 empty:before:content-[attr(data-placeholder)]"
        />
      </div>
      {error ? <p className="error-text">{error}</p> : helper ? <p className="helper">{helper}</p> : null}
    </div>
  );
}
