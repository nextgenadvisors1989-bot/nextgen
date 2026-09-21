"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Mail, Plus, Send, Inbox, Star, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

interface MailItem {
  id: number;
  fromName: string;
  fromEmail: string;
  subject: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

export function MailCenter() {
  const toast = useToast();
  const [items, setItems] = useState<MailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);
  const [draft, setDraft] = useState({ to: "", subject: "", message: "" });
  const [sending, setSending] = useState(false);

  const fetchMails = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/mails", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to load inbox");
      setItems(json.data.messages || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMails();
  }, [fetchMails]);

  const unread = useMemo(() => items.filter((m) => !m.isRead).length, [items]);

  async function handleSend() {
    if (!draft.to || !draft.subject || !draft.message) {
      toast.warning("Incomplete message", "Please fill in the recipient, subject and message before sending.");
      return;
    }

    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.to.trim());
    if (!isEmail) {
      toast.warning("Invalid email", "Please enter a valid recipient email address.");
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/mails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to send mail");

      const sentMessage = json.data.message;
      setItems((prev) => [
        {
          ...sentMessage,
          createdAt: sentMessage.createdAt || new Date().toISOString(),
          isRead: true,
          fromName: "You",
        },
        ...prev,
      ]);
      setDraft({ to: "", subject: "", message: "" });
      setComposeOpen(false);
      toast.success("Message sent", `Your mail was queued for ${draft.to.trim()}.`);
    } catch (error) {
      console.error(error);
      toast.error("Send failed", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setSending(false);
    }
  }

  async function markRead(id: number) {
    const res = await fetch("/api/mails", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setItems((prev) => prev.map((m) => (m.id === id ? { ...m, isRead: true } : m)));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-violet-100 p-2 text-violet-700">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <p className="text-base font-semibold text-slate-900">Mail Center</p>
            <p className="text-xs text-slate-500">{unread} unread conversations</p>
          </div>
        </div>

        <button
          onClick={() => setComposeOpen((prev) => !prev)}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          <Plus className="h-4 w-4" />
          Compose
        </button>
      </div>

      {composeOpen && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm text-slate-600 md:col-span-2">
              <span>To</span>
              <input
                type="email"
                value={draft.to}
                onChange={(e) => setDraft((prev) => ({ ...prev, to: e.target.value }))}
                placeholder="kishoreanand7887@gmail.com"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-violet-500 focus:bg-white"
              />
            </label>

            <label className="space-y-2 text-sm text-slate-600 md:col-span-2">
              <span>Subject</span>
              <input
                value={draft.subject}
                onChange={(e) => setDraft((prev) => ({ ...prev, subject: e.target.value }))}
                placeholder="Subject"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-violet-500 focus:bg-white"
              />
            </label>

            <label className="space-y-2 text-sm text-slate-600 md:col-span-2">
              <span>Message</span>
              <textarea
                value={draft.message}
                onChange={(e) => setDraft((prev) => ({ ...prev, message: e.target.value }))}
                rows={5}
                placeholder="Write your message..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-violet-500 focus:bg-white"
              />
            </label>
          </div>

          <div className="mt-4 flex justify-end gap-3">
            <button type="button" onClick={() => setComposeOpen(false)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending}
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-violet-300"
            >
              <Send className="h-4 w-4" />
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">Loading mail box...</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 text-violet-700">
            <Inbox className="h-5 w-5" />
          </div>
          <p className="text-base font-semibold text-slate-700">Inbox is empty</p>
          <p className="mt-1 text-sm text-slate-500">No messages received yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => markRead(item.id)}
              className={cn(
                "w-full rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:border-slate-300",
                item.isRead ? "border-slate-200" : "border-violet-200 bg-violet-50/30"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">{item.fromName}</p>
                    {!item.isRead && <span className="h-2 w-2 rounded-full bg-violet-600" />}
                  </div>
                  <p className="text-xs text-slate-500">{item.fromEmail}</p>
                  <p className="mt-2 text-sm font-medium text-slate-800">{item.subject}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-600">{item.body}</p>
                </div>

                <div className="flex items-center gap-2 text-slate-400">
                  <Star className="h-4 w-4" />
                  <Trash2 className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-3 text-[11px] text-slate-400">
                {new Date(item.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
