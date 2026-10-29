'use client';

/** Asks for a signature, drawn on the screen or typed as a name, before an action is taken in the signer's name. */
import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SignaturePad } from '@/components/ui/signature-pad';

export interface SignaturePayload { signature_kind: 'drawn' | 'typed'; signature_data: string }

export function SignatureDialog({ open, onClose, title, description, confirmLabel, loading, defaultName, onSign }: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  confirmLabel: string;
  loading?: boolean;
  defaultName?: string;
  onSign: (signature: SignaturePayload) => void;
}) {
  const [mode, setMode] = useState<'drawn' | 'typed'>('drawn');
  const [drawn, setDrawn] = useState('');
  const [typed, setTyped] = useState(defaultName ?? '');
  const ready = mode === 'drawn' ? drawn.length > 200 : typed.trim().length >= 2;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={loading} disabled={!ready} onClick={() => onSign(mode === 'drawn' ? { signature_kind: 'drawn', signature_data: drawn } : { signature_kind: 'typed', signature_data: typed.trim() })}>{confirmLabel}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="inline-flex overflow-hidden rounded-lg border border-line" role="tablist" aria-label="Signature type">
          {([['drawn', 'Draw'], ['typed', 'Type your name']] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className={`h-9 px-4 text-sm font-medium ${mode === value ? 'bg-brand-600 text-white' : 'bg-white text-ink-soft hover:bg-surface-muted'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === 'drawn' ? (
          <SignaturePad label="Sign here" value={drawn} onChange={setDrawn} width={440} height={150} helper="Use your mouse, finger or pen. Clear it to start again." />
        ) : (
          <div className="space-y-3">
            <Input label="Your name" value={typed} onChange={(event) => setTyped(event.target.value)} placeholder="Type your full name" />
            <p className="flex h-20 items-center justify-center rounded-lg border border-line bg-white px-3 text-3xl italic text-ink" style={{ fontFamily: 'cursive, serif' }} aria-label="Signature preview">{typed || ' '}</p>
          </div>
        )}
        <p className="text-xs text-ink-muted">By signing you confirm the findings in this report are your own.</p>
      </div>
    </Modal>
  );
}
