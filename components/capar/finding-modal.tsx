'use client';

/** "Add finding" dialog for a row that is not tied to a checklist document (it is filed under a category instead). */
import { Modal } from '@/components/ui/modal';
import { FindingEditor } from '@/components/capar/finding-editor';
import type { CaparCategory, CaparFinding } from '@/types/capar';

export function FindingModal({ open, onClose, reportId, categories, finding, defaultCategoryId, onSaved }: {
  open: boolean;
  onClose: () => void;
  reportId: number;
  categories: CaparCategory[];
  finding: CaparFinding | null;
  defaultCategoryId: number | null;
  onSaved: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={finding ? 'Edit finding' : 'Add finding'}
      description="Record what was found, under which Act or Rule, and the corrective action the facility will take."
      size="xl"
    >
      {open && (
        <FindingEditor
          reportId={reportId}
          categories={categories}
          finding={finding}
          item={finding?.evidence_item_id ? { id: finding.evidence_item_id, name: finding.evidence_item_name ?? 'Checklist item', sectionName: '' } : null}
          defaultCategoryId={defaultCategoryId}
          onSaved={onSaved}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}
