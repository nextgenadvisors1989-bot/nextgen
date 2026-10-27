'use client';

/**
 * Company settings — the legal entity behind every document the platform
 * generates. The logo is uploaded into the document vault (versioned, audited)
 * and the resulting URL is stored as the `company.logo_path` setting, which is
 * what PDF letterheads and the public site read.
 */
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { csrfToken } from '@/lib/utils/api-client';
import { SettingsForm, type ResolvedValue, type SettingSection } from '@/components/settings/settings-form';

export function CompanySettings({
  sections,
  initial,
  canEdit,
  logoUrl,
  letterheadUrl,
}: {
  sections: SettingSection[];
  initial: Record<string, ResolvedValue>;
  canEdit: boolean;
  logoUrl: string | null;
  letterheadUrl: string | null;
}) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const letterheadRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingLetterhead, setUploadingLetterhead] = useState(false);
  const [preview, setPreview] = useState<string | null>(logoUrl);
  const [letterheadPreview, setLetterheadPreview] = useState<string | null>(letterheadUrl);

  async function uploadLogo(file: File, kind: 'logo' | 'letterhead' = 'logo') {
    const setBusy = kind === 'logo' ? setUploading : setUploadingLetterhead;
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('kind', kind);
      const response = await fetch('/api/admin/settings/company/upload-logo', {
        method: 'POST',
        body: formData,
        headers: { 'x-csrf-token': typeof csrfToken === 'function' ? csrfToken() ?? '' : String(csrfToken ?? '') },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        errorToast(payload?.message ?? `Upload failed (${response.status})`);
        return;
      }
      success(payload.message);
      if (kind === 'logo') setPreview(payload.path as string);
      else setLetterheadPreview(payload.path as string);
      router.refresh();
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
      if (letterheadRef.current) letterheadRef.current.value = '';
    }
  }

  const sidebar = (
    <div className="space-y-6">
    <Card>
      <CardBody className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-ink">Logo</h3>
          <p className="mt-1 text-[12px] text-ink-muted">
            PNG, JPEG, WebP or SVG up to 2 MB. Stored in the document vault, so replacing it keeps the previous file as
            a revision and every change is audited.
          </p>
        </div>

        <div className="flex min-h-[120px] items-center justify-center rounded-lg border border-dashed border-line bg-surface-muted p-4">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Company logo" className="max-h-24 max-w-full object-contain" />
          ) : (
            <p className="text-[12px] text-ink-muted">No logo uploaded yet</p>
          )}
        </div>

        {preview && (
          <a href={preview} target="_blank" rel="noreferrer" className="text-[12px] text-brand-600 hover:underline">
            Open the stored file
          </a>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadLogo(file);
          }}
        />
        <Button onClick={() => inputRef.current?.click()} loading={uploading} disabled={!canEdit} fullWidth variant="outline">
          {preview ? 'Replace logo' : 'Upload logo'}
        </Button>

        <div className="rounded-lg border border-line bg-surface-muted p-3 text-[12px] text-ink-muted">
          These details print on every generated PDF — the audit report letterhead, the employee personal file and the
          payslip footer — and appear in the footer of every email the platform sends.
        </div>
      </CardBody>
    </Card>

    <Card>
      <CardBody className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-ink">Letterhead (CAPAR reports)</h3>
          <p className="mt-1 text-[12px] text-ink-muted">
            A banner image printed across the top of every CAPAR report, in place of the logo and company name. PNG or JPEG up to 2 MB.
            An auditor can still use a different one on a single report.
          </p>
        </div>
        <div className="flex min-h-[80px] items-center justify-center rounded-lg border border-dashed border-line bg-surface-muted p-3">
          {letterheadPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={letterheadPreview} alt="Company letterhead" className="max-h-24 max-w-full object-contain" />
          ) : (
            <p className="text-[12px] text-ink-muted">No letterhead uploaded. Reports use the logo and company name.</p>
          )}
        </div>
        <input
          ref={letterheadRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadLogo(file, 'letterhead');
          }}
        />
        <Button onClick={() => letterheadRef.current?.click()} loading={uploadingLetterhead} disabled={!canEdit} fullWidth variant="outline">
          {letterheadPreview ? 'Replace letterhead' : 'Upload letterhead'}
        </Button>
      </CardBody>
    </Card>
    </div>
  );

  return (
    <SettingsForm
      group="company"
      label="Company"
      sections={sections}
      initial={initial}
      canEdit={canEdit}
      note="Saved details flow straight into generated PDFs, emails and the public site on the next render."
      sidebar={sidebar}
    />
  );
}
