"use client";

import { useEffect, useState, useCallback } from "react";
import { ShieldCheck, CheckCircle2 } from "lucide-react";
import { PageTemplate } from "@/lib/page-template";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime, formatDate } from "@/lib/utils";

interface Item {
  id: number;
  title: string;
  description: string | null;
  acknowledgedAt: string | null;
  expiryDate: string | null;
  signatureData: string | null;
}

export default function EmployeeHealthSafetyPage() {
  const toast = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Item | null>(null);
  const [signature, setSignature] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/employee/health-safety");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      setItems(json.data.items);
    } catch (err) {
      toast.error("Failed to load", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  async function confirmAck() {
    if (!active) return;
    if (!signature.trim()) { toast.warning("Type your full name to sign"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/employee/health-safety/${active.id}/acknowledge`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureName: signature }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      toast.success("Acknowledged");
      setActive(null);
      setSignature("");
      fetchItems();
    } catch (err) {
      toast.error("Failed to acknowledge", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState message="Loading policies..." />;

  return (
    <PageTemplate title="Health & Safety" subtitle="Company policies and required acknowledgements" icon={ShieldCheck}>
      {items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200">
          <EmptyState icon={ShieldCheck} title="Nothing to acknowledge" description="Your Employer hasn't published any policies for acknowledgement yet." />
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-start justify-between gap-4">
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-gray-900">{item.title}</h3>
                {item.description && <p className="text-xs text-gray-500 mt-1">{item.description}</p>}
                {item.expiryDate && <p className="text-xs text-gray-400 mt-1">Valid until {formatDate(item.expiryDate)}</p>}
                {item.acknowledgedAt && (
                  <p className="text-xs text-green-700 mt-2 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Acknowledged {formatDateTime(item.acknowledgedAt)} — signed &ldquo;{item.signatureData}&rdquo;
                  </p>
                )}
              </div>
              {!item.acknowledgedAt && (
                <button
                  onClick={() => { setActive(item); setSignature(""); }}
                  className="flex-shrink-0 px-3 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition"
                >
                  Acknowledge
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={!!active}
        onClose={() => setActive(null)}
        title={active?.title || ""}
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setActive(null)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={confirmAck} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50">
              {saving ? "Signing..." : "I Acknowledge & Sign"}
            </button>
          </div>
        }
      >
        <p className="text-sm text-gray-600 mb-4">{active?.description}</p>
        <label className="block text-xs font-medium text-gray-600 mb-1">Type your full name as your digital signature</label>
        <input
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Full name"
        />
      </Modal>
    </PageTemplate>
  );
}
